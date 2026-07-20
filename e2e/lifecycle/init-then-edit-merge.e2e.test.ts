import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectNoDuplicates } from "../assertions/config-assertions.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { cleanupTempDir, createTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { readConfigSkillIds } from "../fixtures/dual-scope-helpers.js";

/**
 * Init -> Edit merge lifecycle E2E test.
 *
 * Verifies that running `cc init` to completion, then running `cc edit`
 * with changes, produces a merged config (not an overwrite). The original
 * skills from init should be preserved alongside new skills added in edit.
 */

describe("init -> edit merge: config preserved across lifecycle", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  describe("full init then edit with changes", () => {
    let tempDir: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
    });

    it.fails(
      "should merge config after init -> edit with skill addition (no duplicates)",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = tempDir;

        // ================================================================
        // Phase 1: Init via wizard
        // ================================================================

        const initWizard = await InitWizard.launch({
          source: { sourceDir, tempDir: sourceTempDir },
          projectDir,
        });
        const initResult = await initWizard.completeWithDefaults();
        await initResult.destroy();

        // --- Phase 1 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: initResult.exitCode },
          {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "agents-inc",
          },
        );

        const initSkillIds = await readConfigSkillIds(projectDir);
        expectNoDuplicates(initSkillIds, "skills after init");

        // Verify agent frontmatter and skill content
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: ["web-framework-react"],
        });

        const originalSkillSet = new Set(initSkillIds);

        // ================================================================
        // Phase 2: Edit -- add a skill by navigating to a new category
        // ================================================================

        const editWizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          ...TERMINAL_SIZE.TALL,
        });

        // Arrow down to reach another skill, toggle it
        await editWizard.build.navigateDown();
        await editWizard.build.toggleFocusedSkill();

        // Navigate through: Build -> Sources -> Agents -> Confirm -> Complete
        const sources = await editWizard.build.passThroughAllDomains();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("edit");
        const editResult = await confirm.confirm();

        await editResult.destroy();

        // Edit phase must not contain error indicators
        const editOutput = editResult.rawOutput;
        expect(editOutput).not.toContain("Failed to");
        expect(editOutput).not.toContain("ENOENT");

        // --- Phase 2 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: editResult.exitCode },
          {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "agents-inc",
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

        expect(editSkillIds.length).toBeGreaterThanOrEqual(initSkillIds.length);

        // Agent should still be compiled with correct content
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: ["web-framework-react"],
        });
      },
    );
  });
});
