import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createE2ESource } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, createTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * `init --from <id>` revalidates the configuration it decoded against THIS catalog rather than
 * trusting the verdict of the app that built it.
 *
 * The decode is deliberately lenient — an id this catalog does not know is skipped, never fatal —
 * so a payload that was internally consistent where it was shared can arrive here with a real
 * unmet requirement. The source below binds React to a state library, which is the same shape: a
 * rule this catalog carries and the sharer's did not.
 *
 * The requirement target sits in a different category from React on purpose. A target in React's
 * own (exclusive) category would make the consistent payload carry two picks there, so the control
 * below would be silent about requirements while a category warning printed in its place — and a
 * control that passes for the wrong reason proves nothing.
 *
 * Every payload ejects at global scope, matching the rest of the `--from` specs: the E2E source is
 * local and has no marketplace, so plugin mode legitimately refuses it, and a project-scoped skill
 * assigned to a sub-agent resting at the shared default is a pair the decode refuses outright.
 */

/** One unmet requirement in any selection carrying React alone: this catalog binds it to Zustand. */
const UNMET_REQUIREMENT_RULES = {
  requires: [
    {
      skill: E2E_SKILL.react.slug,
      needs: [E2E_SKILL.zustand.slug],
      reason: "React needs Zustand here — deliberately unmet",
    },
  ],
};

/** The line the validator owes, worded by the validator itself. */
const EXPECTED_VALIDATION_WARNING = `${E2E_SKILL.react.display} ${STEP_TEXT.VALIDATION_REQUIRES} ${E2E_SKILL.zustand.display}`;

/** An id this catalog does not know, so the decode skips it and says so by name. */
const UNKNOWN_SKILL_ID = "web-framework-does-not-exist";

function seedPayload(skills: Record<string, unknown>) {
  return { v: 5, matrixVersion: "1.0.0", stackId: null, skills, agents: {} };
}

function skillEntry() {
  return { install: "eject", scope: "global", assignments: { "web-developer": "lazy" } };
}

describe("init --from revalidates the decoded selection", () => {
  let tempDir: string;
  let sourceDir: string;
  let sourceTempDir: string;
  let store: SeedConfigStore;

  beforeAll(async () => {
    await ensureBinaryExists();
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
        seedPayload({
          [E2E_SKILL.react.id]: skillEntry(),
          [UNKNOWN_SKILL_ID]: skillEntry(),
        }),
      );

      const { exitCode, output } = await runInit("Unmet001");

      // Advisory, not fatal: the configuration installs and the user is told what it costs.
      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(output);
      // Cause and effect in one run: the id this catalog does not have, and the requirement
      // this catalog does have and finds unmet.
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
        seedPayload({
          [E2E_SKILL.react.id]: skillEntry(),
          [E2E_SKILL.zustand.id]: skillEntry(),
        }),
      );

      const { exitCode, output } = await runInit("Consist1");

      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      // The control that stops the assertion above passing on a warning printed unconditionally.
      expect(flattenCliOutput(output)).not.toContain(STEP_TEXT.VALIDATION_REQUIRES);
      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
    },
  );
});
