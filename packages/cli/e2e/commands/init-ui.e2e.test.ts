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
  flattenCliOutput,
  writeCorruptConfig,
} from "../helpers/test-utils.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import { CLI_INVOKE_COMMAND, DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";

/**
 * `init --ui`: the browser is reachable from a directory with nothing installed.
 *
 * `edit --ui` has always existed, so until now the editor — which this repository calls the full
 * experience — could not be the way IN: you had to finish the terminal wizard before you were
 * allowed to open the other front door. That inverts the intended relationship between the two.
 *
 * The link is PRINTED rather than merely opened, and that is the assertion these specs can make:
 * a spawned process has no TTY, so no browser is launched, which is exactly the environment the
 * flag has to stay usable in — over a pipe, in CI, on a machine with no desktop session.
 */
describe("init --ui", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("prints the editor's address and exits successfully", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["init", "--ui"], { dir: tempDir });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    // STEP_TEXT.EDITOR_URL rather than a bare "agentsinc.sh". The host alone is a substring of
    // both the right address and the wrong one, so this assertion passed while the CLI pointed
    // at the landing page.
    expect(output).toContain(STEP_TEXT.EDITOR_URL);
    expect(output).toContain(
      `Then install what it gives you with '${CLI_INVOKE_COMMAND} init --from <id>'.`,
    );
  });

  /**
   * The subject guard. Opening the editor is not a setup, so a run that leaves a source folder
   * behind has done something this flag never promised — and the assertion above cannot tell the
   * difference on its own, since a completed install prints a link too.
   */
  it("installs nothing, because opening the editor is not a setup", async () => {
    tempDir = await createTempDir();

    await CLI.run(["init", "--ui"], { dir: tempDir });

    await expectNoSourceFolder(
      tempDir,
      "opening the editor is not a setup, so init --ui installs nothing",
    );
    expect(await directoryExists(`${tempDir}/${DIRS.CLAUDE}`)).toBe(false);
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
   * The editor's address carries a configuration id and nothing else, so a marketplace named beside
   * `--ui` would be dropped on the way — and a flag dropped reads as honoured. It is refused before
   * any link is printed. The first run in this file, `--ui` alone, is the control that makes the
   * refusal about the marketplace rather than about the editor.
   */
  it("refuses --marketplace beside it, because the editor loads marketplaces itself", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["init", "--ui", "--marketplace", tempDir], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.INVALID_ARGS);
    expect(
      flattenCliOutput(output),
      "the refusal says where a marketplace is loaded instead",
    ).toContain(STEP_TEXT.EDITOR_LOADS_MARKETPLACES);
    expect(output, "no link stands in for the refusal").not.toContain(STEP_TEXT.EDITOR_URL);
    await expectNoSourceFolder(tempDir, "a refused run installs nothing");
  });

  /**
   * The refusal's remedy has to run where the refusal is printed. A folder whose own installation
   * came from another marketplace refuses `init --marketplace <named>` in turn — an installation's
   * marketplace is chosen once — so naming that command hands the user a second refusal. The last
   * run below is that refusal, which is what makes the absence above it mean something.
   */
  it("names only a command that runs in a folder installed from another marketplace", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });
    await ProjectBuilder.installation(projectDir);
    const here = { env: { HOME: home } };

    const refused = await CLI.run(
      ["init", "--ui", "--marketplace", tempDir],
      { dir: projectDir },
      here,
    );

    expect(refused.exitCode, refused.output).toBe(EXIT_CODES.INVALID_ARGS);
    const said = flattenCliOutput(refused.output);
    expect(said).toContain(STEP_TEXT.EDITOR_LOADS_MARKETPLACES);
    expect(said, "the refusal names a command this folder refuses").not.toContain(
      `${CLI_INVOKE_COMMAND} init --marketplace`,
    );
    expect(said).toContain(`'${CLI_INVOKE_COMMAND} init --ui'`);

    const named = await CLI.run(["init", "--ui"], { dir: projectDir }, here);
    expect(named.exitCode, named.output).toBe(EXIT_CODES.SUCCESS);

    const unnamed = await CLI.run(["init", "--marketplace", tempDir], { dir: projectDir }, here);
    expect(unnamed.exitCode, unnamed.output).toBe(EXIT_CODES.INVALID_ARGS);
  });

  it("is listed in the command's own help", async () => {
    tempDir = await createTempDir();

    const { stdout } = await CLI.run(["init", "--help"], { dir: tempDir });

    expect(stdout).toContain("--ui");
  });
});
