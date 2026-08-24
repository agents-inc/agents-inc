import { afterEach, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { cleanupTempDir, createTempDir, directoryExists } from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES } from "../pages/constants.js";

/**
 * `edit --ui --from <id>` — the pairing that makes a shared id something a recipient can LOOK at.
 *
 * The two flags were refused together until 2026-08-24, on the reading that they were opposite
 * ends of one round trip: `--ui` handed THIS installation out and `--from` applied one back. The
 * owner's ruling replaced that with one rule for both commands — **`--ui` opens whatever `--from`
 * names, and the command's own subject when `--from` is absent** — under which the combination is
 * the obvious thing rather than a contradiction.
 */
describe("edit --ui --from", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("opens the id it was given", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("?fromId=se_XYZ789");
  });

  /**
   * No installation is required, and that is the owner's ruling rather than an oversight: opening
   * an id in a browser reads no local state, so requiring one would be arbitrary. It is the same
   * reasoning that puts `init --ui` above `ensureConfigReadable` — a directory's condition cannot
   * decide whether you may look at somebody else's configuration.
   *
   * `edit` refuses a directory with nothing installed on every OTHER path, so this spec is what
   * says the exemption is deliberate.
   */
  it("needs no installation, because opening an id reads nothing local", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(await directoryExists(`${tempDir}/${DIRS.CLAUDE_SRC}`)).toBe(false);
  });

  /** Applying is what `--from` does WITHOUT `--ui`; naming an id to look at must change nothing. */
  it("applies nothing, because looking is not applying", async () => {
    tempDir = await createTempDir();

    await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], { dir: tempDir });

    expect(await directoryExists(`${tempDir}/${DIRS.CLAUDE}`)).toBe(false);
  });
});
