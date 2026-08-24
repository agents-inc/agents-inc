import { describe, it, expect, afterEach } from "vitest";
import { cleanupTempDir, createTempDir } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { EXIT_CODES } from "../pages/constants.js";

/**
 * Naming a marketplace is an INSTALL-time decision, so `--marketplace` is `init`'s flag and
 * nobody else's (owner ruling 2026-08-09).
 *
 * A later command that takes the flag is a command that can be pointed at a
 * marketplace the installation was never made from: `edit` would offer a catalogue
 * config.ts does not name, `compile` would resolve skill references against one
 * marketplace while the config records another. Every command after `init` reads the
 * marketplace that install stored — project config, then global, then the default.
 *
 * Withdrawn rather than ignored, for the same reason `eject` refuses it: a flag
 * silently accepted reads as honoured. The parser's own refusal is the contract,
 * and the exit code with it.
 *
 * The same rule now governs the flag's OLD spelling. Pre-1.0 ships no compatibility
 * shims, so `--source` is not aliased on `init` either — it is refused there exactly as
 * it is everywhere else, because a flag that still parses is a flag users keep typing.
 */

/** oclif's refusal for a flag the command does not declare — both spellings of it. */
const NONEXISTENT_LONG_FLAG = "Nonexistent flag: --marketplace";
const NONEXISTENT_SHORT_FLAG = "Nonexistent flag: -m";

/** The same refusal for the withdrawn spelling, which no command declares any more. */
const NONEXISTENT_WITHDRAWN_LONG_FLAG = "Nonexistent flag: --source";
const NONEXISTENT_WITHDRAWN_SHORT_FLAG = "Nonexistent flag: -s";

/** The value-less form's refusal: the flag EXISTS and its argument is missing. */
const FLAG_EXPECTS_A_VALUE = "Flag --marketplace expects a value";

/**
 * Every command that reads a marketplace without choosing one. Asserted as a SET: one
 * command left holding the flag is the whole mixed-marketplace path back, and each of
 * these reaches the marketplace through a different call path.
 */
const COMMANDS_WITHOUT_MARKETPLACE = ["edit", "compile", "uninstall", "list"] as const;

/** `init` included: the withdrawn spelling is refused by every command without exception. */
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

    // The value-less form is the control: a command that does not DECLARE the flag
    // refuses its name before it can miss a value, so "expects a value" is only ever
    // printed by a command that has it. No wizard is reached — the parser answers first.
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
