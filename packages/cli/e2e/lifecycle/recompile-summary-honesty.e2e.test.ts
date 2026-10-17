import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import "../matchers/setup.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { agentsPath, cleanupTempDir, readTreeSnapshot, runCLI } from "../helpers/test-utils.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  applyFromSeed,
  e2eStackPayload,
  installE2EStackGlobally,
} from "../fixtures/e2e-stack-seed.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

/**
 * The recompile summary reports agents REWRITTEN, not visited, from both `edit` and `compile`.
 * Checked against mtimes, since a same-bytes rewrite is invisible to a content comparison.
 */

describe("recompile summary distinguishes rewritten agents from unchanged ones", () => {
  let store: SeedConfigStore;
  let tempDir: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
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
      const { fakeHome } = env;

      await installE2EStackGlobally(store, fakeHome);

      const globalAgentsBefore = await readTreeSnapshot(agentsPath(fakeHome));
      const agentCount = Object.keys(globalAgentsBefore).length;
      expect(
        agentCount,
        "the global scope must hold the compiled agents this run will recompile",
      ).toBeGreaterThan(0);

      // A skill no sub-agent carries: writes a config and recompiles, but changes no agent.
      const phaseB = await applyFromSeed(
        store,
        "PlusUnassigned1",
        e2eStackPayload({ plus: { [E2E_SKILL["visual-regression"].id]: [] } }),
        { dir: fakeHome, home: fakeHome },
      );
      expect(
        phaseB.output,
        "the run must change something, or it never reaches the recompile it is judged on",
      ).not.toContain(STEP_TEXT.EDIT_UNCHANGED);

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
