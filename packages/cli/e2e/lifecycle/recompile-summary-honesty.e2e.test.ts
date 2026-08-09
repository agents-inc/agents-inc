import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  ensureBinaryExists,
  readTreeSnapshot,
  runCLI,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  initGlobalWithEject,
  initProjectAllGlobal,
} from "../fixtures/dual-scope-helpers.js";

/**
 * The recompile summary reports what was REWRITTEN, not what was visited.
 *
 * A mutating run whose compiled agents all come back byte-identical is the state
 * the old line could not describe: it counted the roster it considered, so a
 * no-op recompile and a real one printed the same sentence. Both surfaces that
 * print the count are driven here — `edit` (through the project-setup pass that
 * writes a config and recompiles without changing a roster) and `compile` — and
 * each is checked against the agents' own mtimes, which is what makes "unchanged"
 * mean "not written" rather than "written with the same bytes".
 *
 * The mtime side is load-bearing and cannot be dropped for a bytes comparison:
 * rewriting a file with identical content is invisible in a diff, so bytes alone
 * would pass against exactly the behaviour this pins.
 */

describe("recompile summary distinguishes rewritten agents from unchanged ones", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "reports zero rewritten when a mutating run leaves every compiled agent identical",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const phaseA = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
      expect(phaseA.exitCode, `global init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      const globalAgentsBefore = await readTreeSnapshot(agentsPath(fakeHome));
      // Read from disk rather than pinned: the roster is the stack's, and what this
      // spec is about is that the SAME number appears as "unchanged" instead of as
      // "recompiled" — whatever that number happens to be.
      const agentCount = Object.keys(globalAgentsBefore).length;
      expect(
        agentCount,
        "the global scope must hold the compiled agents this run will recompile",
      ).toBeGreaterThan(0);

      // Setting a project up over that install writes a config and recompiles,
      // but changes no roster — so every agent it recompiles is already correct.
      const phaseB = await initProjectAllGlobal(sourceDir, sourceTempDir, fakeHome, projectDir);
      expect(phaseB.exitCode, `project setup failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);
      expect(phaseB.output, "the run must reach the recompile it is being judged on").toContain(
        STEP_TEXT.EDIT_UNCHANGED,
      );

      expect(
        phaseB.output,
        "an edit that rewrote nothing must say so rather than count the roster it considered",
      ).toContain(`0 ${STEP_TEXT.AGENTS_REWRITTEN}, ${agentCount} ${STEP_TEXT.UNCHANGED}`);
      expect(
        phaseB.output,
        "the count-of-considered form is what the honest summary replaces",
      ).not.toContain(`Recompiled ${agentCount} agents`);

      expect(
        await readTreeSnapshot(agentsPath(fakeHome)),
        "an agent reported unchanged must not have been written — bytes and mtime both",
      ).toStrictEqual(globalAgentsBefore);

      // `compile` prints the same count from the same pass, so it owes the same answer.
      const compileRun = await runCLI(["compile"], fakeHome, {
        env: { HOME: fakeHome },
      });
      expect(compileRun.exitCode, `compile failed: ${compileRun.combined}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      expect(
        compileRun.combined,
        "a compile that rewrote nothing must report zero rewritten, not the roster size",
      ).toContain(`0 global ${STEP_TEXT.AGENTS_REWRITTEN}, ${agentCount} ${STEP_TEXT.UNCHANGED}`);
      expect(
        compileRun.combined,
        "the count-of-considered form is what the honest summary replaces",
      ).not.toContain(`Recompiled ${agentCount} global agents`);

      expect(
        await readTreeSnapshot(agentsPath(fakeHome)),
        "a compile pass reporting everything unchanged must not have written a single agent",
      ).toStrictEqual(globalAgentsBefore);
    },
  );
});
