import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, createTempDir } from "../helpers/test-utils.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from` revalidates the decoded configuration against this catalog. The requirement target
 * is outside React's exclusive category, or the control would print a category warning instead.
 */

/** This catalog binds React to Zustand. */
const UNMET_REQUIREMENT_RULES = {
  requires: [
    {
      skill: E2E_SKILL.react.slug,
      needs: [E2E_SKILL.zustand.slug],
      reason: "React needs Zustand here — deliberately unmet",
    },
  ],
};

const EXPECTED_VALIDATION_WARNING = `${E2E_SKILL.react.display} ${STEP_TEXT.VALIDATION_REQUIRES} ${E2E_SKILL.zustand.display}`;

/** Unknown to this catalog, so the decode skips it by name. */
const UNKNOWN_SKILL_ID = "web-framework-does-not-exist";

describe("init --from revalidates the decoded selection", () => {
  let tempDir: string;
  let sourceDir: string;
  let sourceTempDir: string;
  let store: SeedConfigStore;

  beforeAll(async () => {
    const source = await createE2ESource({ relationships: UNMET_REQUIREMENT_RULES });
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  const runInit = (id: string) => runInitFrom(store, id, { dir: tempDir }, sourceDir);

  it(
    "warns that this catalog's requirement is unmet, beside the skip, and still installs",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      store.publish(
        "Unmet001",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: {
            [E2E_SKILL.react.id]: ejectedGlobalSkill(),
            [UNKNOWN_SKILL_ID]: ejectedGlobalSkill(),
          },
        }),
      );

      const { exitCode, output } = await runInit("Unmet001");

      // Advisory, not fatal.
      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(output);
      expect(said).toContain(UNKNOWN_SKILL_ID);
      expect(said).toContain(EXPECTED_VALIDATION_WARNING);
      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
    },
  );

  it(
    "stays silent on a payload this catalog still finds consistent",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      store.publish(
        "Consist1",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: {
            [E2E_SKILL.react.id]: ejectedGlobalSkill(),
            [E2E_SKILL.zustand.id]: ejectedGlobalSkill(),
          },
        }),
      );

      const { exitCode, output } = await runInit("Consist1");

      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      // Control: the warning is not printed unconditionally.
      expect(flattenCliOutput(output)).not.toContain(STEP_TEXT.VALIDATION_REQUIRES);
      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
    },
  );
});
