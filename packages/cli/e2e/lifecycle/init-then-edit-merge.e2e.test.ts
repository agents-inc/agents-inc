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
 * The source's spare, in a non-exclusive category; every other uninstalled skill is an exclusive
 * alternate, so adding one would be a swap.
 */
const ADDED_SKILL = E2E_SKILL["visual-regression"];

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

    it(
      "should merge config after init -> edit with skill addition (no duplicates)",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = tempDir;

        // HOME is projectDir: with HOME elsewhere, a default-scope install lands out of view.
        const initResult = await installE2EStackGlobally(store, projectDir);

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

        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: [E2E_SKILL.react.id],
        });

        expect(initSkillIds, "the skill the edit adds must not be installed yet").not.toContain(
          ADDED_SKILL.id,
        );
        expect(initSkillIds, "the skill the merge must keep has to be installed first").toContain(
          PRESERVED_SKILL.id,
        );

        const originalSkillSet = new Set(initSkillIds);

        const editResult = await applyFromSeed(
          store,
          "PlusSpare1",
          e2eStackPayload({ plus: { [ADDED_SKILL.id]: [E2E_AGENT["web-developer"].name] } }),
          { dir: projectDir, home: projectDir },
        );

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

        for (const originalId of originalSkillSet) {
          expect(editSkillIds, `Original skill ${originalId} must be preserved`).toContain(
            originalId,
          );
        }

        // Set differences, not a floor: naming the added id separates a merge from a re-selection.
        expect(
          initSkillIds.filter((id) => !editSkillIds.includes(id)),
          "an edit that adds a skill must remove none",
        ).toStrictEqual([]);
        expect(
          editSkillIds.filter((id) => !originalSkillSet.has(id)),
          "the one toggle above must add exactly the skill it named",
        ).toStrictEqual([ADDED_SKILL.id]);

        // After the merge assertions, so the set difference carries the red.
        expect(editResult.output).toContain(STEP_TEXT.EDIT_SUCCESS);

        // Config assertions cannot see an agent rewritten from the edit alone.
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
