import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectNoDuplicates } from "../assertions/config-assertions.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import "../matchers/setup.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { cleanupTempDir, createTempDir } from "../helpers/test-utils.js";
import { readConfigSkillIds } from "../fixtures/dual-scope-helpers.js";
import {
  applyFromSeed,
  e2eStackPayload,
  installE2EStackGlobally,
} from "../fixtures/e2e-stack-seed.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";

/**
 * Init -> Edit merge lifecycle E2E test.
 *
 * Verifies that running `init --from` to completion, then `edit --from` with a
 * configuration that adds a skill, produces a merged config (not an overwrite). The
 * original skills from init should be preserved alongside the skill the edit adds.
 */

/**
 * The skill the edit phase adds: the E2E source's SPARE — assigned to no agent by
 * the stack, in a category that is not exclusive. Every OTHER skill a default install
 * leaves behind is an exclusive alternate of one it took, so adding it is a swap.
 */
const ADDED_SKILL = E2E_SKILL["visual-regression"];

/** A skill the INIT installed, so the merge can be shown to have kept it. */
const PRESERVED_SKILL = E2E_SKILL.vitest;

describe("init -> edit merge: config preserved across lifecycle", () => {
  describe("full init then edit with changes", () => {
    let store: SeedConfigStore;
    let tempDir: string | undefined;

    beforeAll(async () => {
      store = await startSeedConfigStore();
    });

    afterAll(async () => {
      await store.close();
    });

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
    });

    /**
     * The subject is the DELTA, so both halves are asserted as set differences and
     * on both surfaces the merge writes to: `config.ts` and the compiled agent.
     */
    it(
      "should merge config after init -> edit with skill addition (no duplicates)",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = tempDir;

        // Phase 1: init. HOME is projectDir: an install at the default (global) scope
        // with HOME elsewhere would be written somewhere this spec never looks.
        const initResult = await installE2EStackGlobally(store, projectDir);

        // --- Phase 1 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: initResult.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            agents: ["web-developer"],
            origin: "eject",
          },
        );

        const initSkillIds = await readConfigSkillIds(projectDir);
        expectNoDuplicates(initSkillIds, "skills after init");

        // Verify agent frontmatter and skill content
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: [E2E_SKILL.react.id],
        });

        // The pre-state the merge is measured against: the spare is what the edit
        // will add, so an install that already took it would make Phase 2 a no-op
        // that every "still present" assertion below would pass anyway.
        expect(initSkillIds, "the skill the edit adds must not be installed yet").not.toContain(
          ADDED_SKILL.id,
        );
        expect(initSkillIds, "the skill the merge must keep has to be installed first").toContain(
          PRESERVED_SKILL.id,
        );

        const originalSkillSet = new Set(initSkillIds);

        // Phase 2: edit -- the same configuration plus the spare, on web-developer. Under
        // the same HOME as Phase 1, so the edit is the global installation's own.
        const editResult = await applyFromSeed(
          store,
          "PlusSpare1",
          e2eStackPayload({ plus: { [ADDED_SKILL.id]: [E2E_AGENT["web-developer"].name] } }),
          { dir: projectDir, home: projectDir },
        );

        // --- Phase 2 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: editResult.exitCode },
          {
            skillIds: [E2E_SKILL.react.id],
            agents: ["web-developer"],
            origin: "eject",
          },
        );

        const editSkillIds = await readConfigSkillIds(projectDir);

        expectNoDuplicates(editSkillIds, "skills after edit");

        // All original skills should still be present (merge, not overwrite)
        for (const originalId of originalSkillSet) {
          expect(editSkillIds, `Original skill ${originalId} must be preserved`).toContain(
            originalId,
          );
        }

        // The merge contract, not a floor. `>= initSkillIds.length` was satisfied by
        // an edit that added five skills, and by one that removed a skill while
        // adding two — the two set differences say which actually happened, and
        // naming the added id is what separates a merge from a re-selection.
        expect(
          initSkillIds.filter((id) => !editSkillIds.includes(id)),
          "an edit that adds a skill must remove none",
        ).toStrictEqual([]);
        expect(
          editSkillIds.filter((id) => !originalSkillSet.has(id)),
          "the one toggle above must add exactly the skill it named",
        ).toStrictEqual([ADDED_SKILL.id]);

        // The edit announced that it changed something. Two generic absences stood
        // here ("Failed to", "ENOENT"); neither could tell a completed edit from one
        // that failed with different wording. Placed AFTER the merge assertions so
        // the set-difference above is what carries the red, not this line.
        expect(editResult.output).toContain(STEP_TEXT.EDIT_SUCCESS);

        // The same merge on the OTHER surface it writes. A config that merged while
        // the compiled agent was rewritten from the edit alone is the overwrite this
        // spec exists to catch, and config assertions cannot see it.
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: [E2E_SKILL.react.id],
        });
        await expect({ dir: projectDir }).toHaveAgentDynamicSkills("web-developer", {
          skillIds: [ADDED_SKILL.id, PRESERVED_SKILL.id],
        });
      },
    );
  });
});
