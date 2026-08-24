import { afterEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { cleanupTempDir, createTempDir, directoryExists } from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES } from "../pages/constants.js";

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
    expect(output).toContain("agentsinc.sh");
  });

  /**
   * The subject guard. Opening the editor is not a setup, so a run that leaves `.claude-src/`
   * behind has done something this flag never promised — and the assertion above cannot tell the
   * difference on its own, since a completed install prints a link too.
   */
  it("installs nothing, because opening the editor is not a setup", async () => {
    tempDir = await createTempDir();

    await CLI.run(["init", "--ui"], { dir: tempDir });

    expect(await directoryExists(`${tempDir}/${DIRS.CLAUDE_SRC}`)).toBe(false);
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

  /** The subject guard for the pairing: naming an id must not install it. */
  it("installs nothing when it opens an id", async () => {
    tempDir = await createTempDir();

    await CLI.run(["init", "--ui", "--from", "se_ABC123"], { dir: tempDir });

    expect(await directoryExists(`${tempDir}/${DIRS.CLAUDE_SRC}`)).toBe(false);
  });

  it("is listed in the command's own help", async () => {
    tempDir = await createTempDir();

    const { stdout } = await CLI.run(["init", "--help"], { dir: tempDir });

    expect(stdout).toContain("--ui");
  });
});
