import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  cleanupTempDir,
  createTempDir,
  directoryExists,
  readTreeSnapshot,
  writeCorruptConfig,
} from "../helpers/test-utils.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import { CLI_INVOKE_COMMAND, DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";

/**
 * `init --ui`, and the bare `init` that takes the same route where nothing is installed: the
 * editor is the way in, and the CLI's part is printing its address.
 *
 * The link is PRINTED rather than merely opened, and that is the assertion these specs can make:
 * a spawned process has no TTY, so no browser is launched, which is exactly the environment the
 * route has to stay usable in — over a pipe, in CI, on a machine with no desktop session.
 */
describe("init --ui", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  /** A project folder and an empty HOME beside it, so neither scope holds an installation. */
  async function nothingInstalled(): Promise<{ projectDir: string; home: string }> {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await mkdir(home, { recursive: true });
    return { projectDir, home };
  }

  describe.each([[["init"]], [["init", "--ui"]]])("%j where nothing is installed", (argv) => {
    it("prints the editor's address and exits successfully", async () => {
      const { projectDir, home } = await nothingInstalled();

      const { exitCode, stdout, output } = await CLI.run(
        argv,
        { dir: projectDir },
        { env: { HOME: home } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      // The whole address rather than a bare "agentsinc.sh": the host alone is a substring of
      // both the right address and the wrong one.
      expect(stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
    });

    /**
     * The subject guard. Opening the editor is not a setup, so a run that leaves a source folder
     * behind has done something this route never promised — and the address alone cannot tell the
     * difference, since a completed install prints a link too.
     */
    it("installs nothing, because opening the editor is not a setup", async () => {
      const { projectDir, home } = await nothingInstalled();
      const before = await readTreeSnapshot(tempDir);

      await CLI.run(argv, { dir: projectDir }, { env: { HOME: home } });

      await expectNoSourceFolder(projectDir, "opening the editor is not a setup");
      expect(await directoryExists(path.join(projectDir, DIRS.CLAUDE))).toBe(false);
      expect(await readTreeSnapshot(tempDir)).toStrictEqual(before);
    });

    it("offers init --from as the install that follows", async () => {
      const { projectDir, home } = await nothingInstalled();

      const { exitCode, stdout, output } = await CLI.run(
        argv,
        { dir: projectDir },
        { env: { HOME: home } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(
        `Then install what it gives you with '${CLI_INVOKE_COMMAND} init --from <id>'.`,
      );
    });
  });

  /**
   * `--ui` opens whatever `--from` names, and the command's own subject when `--from` is absent.
   * One rule across both commands (owner ruling 2026-08-24), which is what makes an id something
   * a recipient can LOOK at rather than only apply blind.
   *
   * No publish happens on this path and none is needed: the id already exists, so this is
   * `editorConfigUrl(id)` and nothing else. That is why it needs no store and no marketplace.
   */
  it("opens the id --from names, rather than this directory", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["init", "--ui", "--from", "se_ABC123"], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("?fromId=se_ABC123");
  });

  /**
   * The command it offers instead has to be one that runs HERE. `init --from` installs an id into
   * a directory with nothing installed, and refuses one holding its own installation — over that,
   * `edit --from` is the command that applies an id, so that is the one offered.
   */
  it("offers init --from in a directory with nothing installed", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["init", "--ui", "--from", "se_ABC123"], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(
      `To install it here instead, run '${CLI_INVOKE_COMMAND} init --from se_ABC123'.`,
    );
  });

  it("offers edit --from in a directory holding its own installation", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });
    await ProjectBuilder.installation(projectDir);

    const { exitCode, output } = await CLI.run(
      ["init", "--ui", "--from", "se_ABC123"],
      { dir: projectDir },
      { env: { HOME: home } },
    );

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(
      `To apply it here instead, run '${CLI_INVOKE_COMMAND} edit --from se_ABC123'.`,
    );
    expect(output, "init --from refuses a directory holding its own installation").not.toContain(
      `${CLI_INVOKE_COMMAND} init --from`,
    );
  });

  it("tells a bare init --ui over its own installation to apply what the editor gives with edit --from", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });
    await ProjectBuilder.installation(projectDir);

    const { exitCode, output } = await CLI.run(
      ["init", "--ui"],
      { dir: projectDir },
      { env: { HOME: home } },
    );

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(
      `Then apply what it gives you with '${CLI_INVOKE_COMMAND} edit --from <id>'.`,
    );
    expect(output, "init --from refuses a directory holding its own installation").not.toContain(
      `${CLI_INVOKE_COMMAND} init --from`,
    );
  });

  /**
   * `--ui` sits above the config-readability refusal so a broken config cannot block the other
   * front door, and choosing the command to offer reads that config — so the read must not
   * refuse either. The file is there, so the directory counts as holding its own installation.
   */
  it("still opens the id over a config it cannot read", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });
    await writeCorruptConfig(projectDir, renderUnparseableConfigTs());

    const { exitCode, output } = await CLI.run(
      ["init", "--ui", "--from", "se_ABC123"],
      { dir: projectDir },
      { env: { HOME: home } },
    );

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("?fromId=se_ABC123");
    expect(output).toContain(
      `To apply it here instead, run '${CLI_INVOKE_COMMAND} edit --from se_ABC123'.`,
    );
  });

  /** The subject guard for the pairing: naming an id must not install it. */
  it("installs nothing when it opens an id", async () => {
    tempDir = await createTempDir();

    await CLI.run(["init", "--ui", "--from", "se_ABC123"], { dir: tempDir });

    await expectNoSourceFolder(
      tempDir,
      "opening an id in the editor is not a setup, so init --ui installs nothing",
    );
  });

  /**
   * The editor's address carries a configuration id and nothing else, so a marketplace named
   * without `--from` is not handed over: the run opens the editor and says how to add it there. A
   * folder on this machine is out of the editor's reach until it is pushed, and the line says so.
   */
  it("opens the editor beside --marketplace, saying a local folder has to be pushed first", async () => {
    tempDir = await createTempDir();
    const before = await readTreeSnapshot(tempDir);

    const { exitCode, stdout, output } = await CLI.run(["init", "--ui", "--marketplace", tempDir], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
    expect(stdout).toContain(
      `${tempDir} is a folder on this machine, which the editor cannot read — push it to GitHub, then add it from the editor's Marketplace button.`,
    );
    await expectNoSourceFolder(tempDir, "opening the editor is not a setup");
    expect(await readTreeSnapshot(tempDir)).toStrictEqual(before);
  });

  it.each([
    [["init", "--ui", "--marketplace", "github:acme/skills"]],
    [["init", "--marketplace", "github:acme/skills"]],
  ])("%j names the editor's Marketplace button for a remote marketplace", async (argv) => {
    const { projectDir, home } = await nothingInstalled();
    const before = await readTreeSnapshot(tempDir);

    const { exitCode, stdout, output } = await CLI.run(
      argv,
      { dir: projectDir },
      { env: { HOME: home } },
    );

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
    expect(stdout).toContain("Add github:acme/skills from the editor's Marketplace button.");
    expect(stdout, "a remote marketplace needs no push").not.toContain("push it to GitHub");
    expect(await readTreeSnapshot(tempDir)).toStrictEqual(before);
  });

  /**
   * Over an installation made from another marketplace, naming one without `--from` takes the
   * editor route too — with `--ui` and without — rather than refusing or showing the dashboard,
   * which has nowhere to put a marketplace. The installation is left byte for byte as it was.
   */
  it.each([[["init", "--ui", "--marketplace"]], [["init", "--marketplace"]]])(
    "%j opens the editor over an installation made from another marketplace, leaving it as it was",
    async (argv) => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      const home = path.join(tempDir, "home");
      await mkdir(home, { recursive: true });
      await ProjectBuilder.installation(projectDir);
      const before = await readTreeSnapshot(tempDir);

      const { exitCode, stdout, output } = await CLI.run(
        [...argv, tempDir],
        { dir: projectDir },
        { env: { HOME: home } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
      expect(stdout).toContain(
        `${tempDir} is a folder on this machine, which the editor cannot read — push it to GitHub, then add it from the editor's Marketplace button.`,
      );
      expect(stdout, "the dashboard has nowhere to put a marketplace").not.toContain(
        STEP_TEXT.DASHBOARD,
      );
      expect(await readTreeSnapshot(tempDir)).toStrictEqual(before);
    },
  );

  it("is listed in the command's own help", async () => {
    tempDir = await createTempDir();

    const { stdout } = await CLI.run(["init", "--help"], { dir: tempDir });

    expect(stdout).toContain("--ui");
  });
});
