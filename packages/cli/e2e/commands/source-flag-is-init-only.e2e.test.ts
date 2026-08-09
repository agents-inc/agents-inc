import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { cleanupTempDir, createTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES } from "../pages/constants.js";

/**
 * Naming a source is an INSTALL-time decision, so `--source` is `init`'s flag and
 * nobody else's (owner ruling 2026-08-09).
 *
 * A later command that takes the flag is a command that can be pointed at a
 * marketplace the installation was never made from: `edit` would offer a catalogue
 * config.ts does not name, `compile` would resolve skill references against one
 * source while the config records another. Every command after `init` reads the
 * source that install stored — project config, then global, then the default.
 *
 * Withdrawn rather than ignored, for the same reason `eject` refuses it: a flag
 * silently accepted reads as honoured. The parser's own refusal is the contract,
 * and the exit code with it.
 */

/** oclif's refusal for a flag the command does not declare — both spellings of it. */
const NONEXISTENT_LONG_FLAG = "Nonexistent flag: --source";
const NONEXISTENT_SHORT_FLAG = "Nonexistent flag: -s";

/** The value-less form's refusal: the flag EXISTS and its argument is missing. */
const FLAG_EXPECTS_A_VALUE = "Flag --source expects a value";

/**
 * Every command that reads a source without choosing one. Asserted as a SET: one
 * command left holding the flag is the whole mixed-source path back, and each of
 * these reaches the source through a different call path.
 */
const COMMANDS_WITHOUT_SOURCE = ["edit", "compile", "uninstall", "list"] as const;

describe("--source is init's flag alone", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("refuses --source on every command that resolves the stored source", async () => {
    tempDir = await createTempDir();

    for (const command of COMMANDS_WITHOUT_SOURCE) {
      const result = await CLI.run([command, "--source", tempDir], { dir: tempDir });

      expect(result.exitCode, `${command} --source`).toBe(EXIT_CODES.INVALID_ARGS);
      expect(result.output, `${command} --source`).toContain(NONEXISTENT_LONG_FLAG);
    }
  });

  it("refuses the -s short form on the same commands", async () => {
    tempDir = await createTempDir();

    for (const command of COMMANDS_WITHOUT_SOURCE) {
      const result = await CLI.run([command, "-s", tempDir], { dir: tempDir });

      expect(result.exitCode, `${command} -s`).toBe(EXIT_CODES.INVALID_ARGS);
      expect(result.output, `${command} -s`).toContain(NONEXISTENT_SHORT_FLAG);
    }
  });

  it("keeps the flag on init", async () => {
    tempDir = await createTempDir();

    // The value-less form is the control: a command that does not DECLARE the flag
    // refuses its name before it can miss a value, so "expects a value" is only ever
    // printed by a command that has it. No wizard is reached — the parser answers first.
    const result = await CLI.run(["init", "--source"], { dir: tempDir });

    expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(result.output).toContain(FLAG_EXPECTS_A_VALUE);
    expect(result.output, "init must still declare --source").not.toContain(NONEXISTENT_LONG_FLAG);
  });
});
