import { describe, it, expect, afterEach } from "vitest";
import { cleanupTempDir, createTempDir } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES } from "../pages/constants.js";

/**
 * Naming a marketplace is an INSTALL-time decision, so `--marketplace` is `init`'s flag and
 * nobody else's (owner ruling 2026-08-09); later commands read the marketplace the install stored.
 * Withdrawn rather than ignored, and the old `--source` spelling is refused everywhere, `init`
 * included.
 */

const NONEXISTENT_LONG_FLAG = "Nonexistent flag: --marketplace";
const NONEXISTENT_SHORT_FLAG = "Nonexistent flag: -m";

const NONEXISTENT_WITHDRAWN_LONG_FLAG = "Nonexistent flag: --source";
const NONEXISTENT_WITHDRAWN_SHORT_FLAG = "Nonexistent flag: -s";

/** The flag exists and its argument is missing. */
const FLAG_EXPECTS_A_VALUE = "Flag --marketplace expects a value";

/** Asserted as a set: each reaches the marketplace through a different call path. */
const COMMANDS_WITHOUT_MARKETPLACE = ["edit", "compile", "uninstall", "list"] as const;

const EVERY_COMMAND = ["init", ...COMMANDS_WITHOUT_MARKETPLACE] as const;

describe("--marketplace is init's flag alone", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("refuses --marketplace on every command that resolves the stored marketplace", async () => {
    tempDir = await createTempDir();

    for (const command of COMMANDS_WITHOUT_MARKETPLACE) {
      const result = await CLI.run([command, "--marketplace", tempDir], { dir: tempDir });

      expect(result.exitCode, `${command} --marketplace`).toBe(EXIT_CODES.INVALID_ARGS);
      expect(result.output, `${command} --marketplace`).toContain(NONEXISTENT_LONG_FLAG);
    }
  });

  it("refuses the -m short form on the same commands", async () => {
    tempDir = await createTempDir();

    for (const command of COMMANDS_WITHOUT_MARKETPLACE) {
      const result = await CLI.run([command, "-m", tempDir], { dir: tempDir });

      expect(result.exitCode, `${command} -m`).toBe(EXIT_CODES.INVALID_ARGS);
      expect(result.output, `${command} -m`).toContain(NONEXISTENT_SHORT_FLAG);
    }
  });

  it("keeps the flag on init", async () => {
    tempDir = await createTempDir();

    // Control: only a command declaring the flag can print "expects a value".
    const result = await CLI.run(["init", "--marketplace"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(result.output).toContain(FLAG_EXPECTS_A_VALUE);
    expect(result.output, "init must still declare --marketplace").not.toContain(
      NONEXISTENT_LONG_FLAG,
    );
  });

  it("refuses the withdrawn --source spelling on init as on everything else", async () => {
    tempDir = await createTempDir();

    for (const command of EVERY_COMMAND) {
      const result = await CLI.run([command, "--source", tempDir], { dir: tempDir });

      expect(result.exitCode, `${command} --source`).toBe(EXIT_CODES.INVALID_ARGS);
      expect(
        result.output,
        `${command} --source must be refused rather than quietly honoured`,
      ).toContain(NONEXISTENT_WITHDRAWN_LONG_FLAG);
    }
  });

  it("refuses the withdrawn -s short form on init as on everything else", async () => {
    tempDir = await createTempDir();

    for (const command of EVERY_COMMAND) {
      const result = await CLI.run([command, "-s", tempDir], { dir: tempDir });

      expect(result.exitCode, `${command} -s`).toBe(EXIT_CODES.INVALID_ARGS);
      expect(result.output, `${command} -s`).toContain(NONEXISTENT_WITHDRAWN_SHORT_FLAG);
    }
  });
});
