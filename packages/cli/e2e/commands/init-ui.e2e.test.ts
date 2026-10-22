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
 * `init --ui`, and bare `init` with nothing installed, print the editor address; with no TTY no
 * browser opens, which is the environment the route must work in.
 */
describe("init --ui", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  /** An empty HOME beside the project, so neither scope holds an installation. */
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
      // The whole address: the host alone is a substring of right and wrong ones.
      expect(stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
    });

    /**
     * A completed install prints a link too, so the absence of a source folder is what tells them
     * apart.
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
   * `--ui` opens whatever `--from` names, one rule across both commands (owner ruling 2026-08-24):
   * `editorConfigUrl(id)` only, no store or marketplace.
   */
  it("opens the id --from names, rather than this directory", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["init", "--ui", "--from", "se_ABC123"], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("?fromId=se_ABC123");
  });

  /** The offered command must run here: over an existing installation that is `edit --from`. */
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
   * `--ui` sits above the readability refusal, so choosing the offered command must not refuse
   * either; the file's presence counts as an installation.
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

  it("installs nothing when it opens an id", async () => {
    tempDir = await createTempDir();

    await CLI.run(["init", "--ui", "--from", "se_ABC123"], { dir: tempDir });

    await expectNoSourceFolder(
      tempDir,
      "opening an id in the editor is not a setup, so init --ui installs nothing",
    );
  });

  /**
   * The editor URL carries only a configuration id, so a `--marketplace` is not handed over; a
   * local folder must be pushed first.
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
   * Over another marketplace's installation, `--marketplace` without `--from` takes the editor
   * route too and leaves the installation as it was.
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
