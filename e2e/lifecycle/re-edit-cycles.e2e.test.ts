import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { expectNoDuplicates } from "../assertions/config-assertions.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";

/**
 * Re-edit / multiple edit cycle E2E tests.
 *
 * Verifies that running `cc edit` multiple times on the same installation
 * does not corrupt the config: no duplicate skills, agents, or domains
 * accumulate across edits.
 */

/**
 * Structurally loads a config.ts and returns its skill IDs, agent names, and
 * domains for duplicate detection and structural comparison.
 */
async function readConfigArrays(projectDir: string): Promise<{
  skillIds: string[];
  agentNames: string[];
  domains: string[];
}> {
  const loaded = await loadProjectConfigFromDir(projectDir);
  expect(loaded, `project config.ts must exist at ${projectDir}`).not.toBeNull();
  if (!loaded) return { skillIds: [], agentNames: [], domains: [] };
  return {
    skillIds: loaded.config.skills.map((sc) => sc.id),
    agentNames: loaded.config.agents.map((agent) => agent.name),
    domains: loaded.config.domains ?? [],
  };
}

describe("re-edit cycles: config stability across multiple edits", () => {
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

  describe("idempotent no-change edits", () => {
    let tempDir: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
    });

    it(
      "should preserve config across init -> edit -> edit without changes",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        tempDir = await createTempDir();
        const projectDir = tempDir;

        // ================================================================
        // Phase 1: Init via wizard
        // ================================================================

        // Explicit eject: press "l" on the sources step so new skills are
        // eject-sourced. Without this, the wizard defaults to plugin mode and
        // hard-errors when the source has no marketplace (no silent fallback).
        const initWizard = await InitWizard.launch({
          source: { sourceDir, tempDir: sourceTempDir },
          projectDir,
        });
        const initDomain = await initWizard.stack.selectFirstStack();
        const initBuild = await initDomain.acceptDefaults();
        const initSources = await initBuild.passThroughAllDomains();
        await initSources.waitForReady();
        await initSources.setAllLocal();
        const initAgentsStep = await initSources.advance();
        const initConfirm = await initAgentsStep.acceptDefaults("init");
        const initResult = await initConfirm.confirm();
        await initResult.destroy();

        // --- Phase 1 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: initResult.exitCode },
          {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "eject",
          },
        );
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: ["web-framework-react"],
        });

        const initArrays = await readConfigArrays(projectDir);
        expectNoDuplicates(initArrays.skillIds, "skills after init");
        expectNoDuplicates(initArrays.agentNames, "agents after init");
        expectNoDuplicates(initArrays.domains, "domains after init");

        // ================================================================
        // Phase 2: First edit -- navigate through without changes
        // ================================================================

        const edit1Wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
        });
        const edit1Result = await edit1Wizard.passThrough();
        await edit1Result.destroy();

        // --- Phase 2 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: edit1Result.exitCode },
          {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "eject",
          },
        );
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: ["web-framework-react"],
        });

        const edit1Arrays = await readConfigArrays(projectDir);

        expectNoDuplicates(edit1Arrays.skillIds, "skills after first edit");
        expectNoDuplicates(edit1Arrays.agentNames, "agents after first edit");
        expectNoDuplicates(edit1Arrays.domains, "domains after first edit");

        expect(edit1Arrays.skillIds.sort()).toStrictEqual(initArrays.skillIds.sort());

        // ================================================================
        // Phase 3: Second edit -- navigate through without changes again
        // ================================================================

        const edit2Wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
        });
        const edit2Result = await edit2Wizard.passThrough();
        await edit2Result.destroy();

        // --- Phase 3 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: edit2Result.exitCode },
          {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "eject",
          },
        );
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: ["web-framework-react"],
        });

        const edit2Arrays = await readConfigArrays(projectDir);

        expectNoDuplicates(edit2Arrays.skillIds, "skills after second edit");
        expectNoDuplicates(edit2Arrays.agentNames, "agents after second edit");
        expectNoDuplicates(edit2Arrays.domains, "domains after second edit");

        // CRITICAL: No accumulation between consecutive edits.
        expect(edit2Arrays.skillIds.sort()).toStrictEqual(edit1Arrays.skillIds.sort());
        expect(edit2Arrays.agentNames.sort()).toStrictEqual(edit1Arrays.agentNames.sort());
        expect(edit2Arrays.domains.sort()).toStrictEqual(edit1Arrays.domains.sort());

        expect(edit2Arrays.skillIds.length).toBe(edit1Arrays.skillIds.length);
        expect(edit2Arrays.agentNames.length).toBe(edit1Arrays.agentNames.length);
        expect(edit2Arrays.domains.length).toBe(edit1Arrays.domains.length);
      },
    );
  });

  describe("edit with skill addition persists across cycles", () => {
    let tempDir: string | undefined;

    afterEach(async () => {
      if (tempDir) {
        await cleanupTempDir(tempDir);
        tempDir = undefined;
      }
    });

    it(
      "should retain added skill across subsequent no-change edit",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        // ================================================================
        // Phase 1: Create project with limited skills (single domain, one skill)
        // ================================================================

        const project = await ProjectBuilder.editable({
          skills: ["web-framework-react"],
          agents: ["web-developer"],
          domains: ["web"],
          stack: {
            "web-developer": {
              "web-framework": [{ id: "web-framework-react", preloaded: true }],
            },
          },
        });
        tempDir = path.dirname(project.dir);
        const projectDir = project.dir;

        await createPermissionsFile(projectDir);

        // Verify initial state via matcher and detailed parsing
        await expect({ dir: projectDir }).toHaveConfig({
          skillIds: ["web-framework-react"],
          agents: ["web-developer"],
          source: "eject",
        });
        const beforeArrays = await readConfigArrays(projectDir);

        // ================================================================
        // Phase 2: First edit -- add a skill
        // ================================================================

        const edit1Wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          rows: 60,
          cols: 120,
        });

        // Arrow down to next category, space to select
        await edit1Wizard.build.navigateDown();
        await edit1Wizard.build.toggleFocusedSkill();

        // Navigate through: Build -> Sources -> Agents -> Confirm -> Complete
        // Explicit eject: press "l" so the newly added skill is eject-sourced.
        // Without this, the wizard defaults to plugin mode and hard-errors
        // because the local source has no marketplace (no silent fallback).
        const sources1 = await edit1Wizard.build.advanceToSources();
        await sources1.waitForReady();
        await sources1.setAllLocal();
        const agents1 = await sources1.advance();
        const confirm1 = await agents1.acceptDefaults("edit");
        const edit1Result = await confirm1.confirm();

        await edit1Result.destroy();

        // --- Phase 2 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: edit1Result.exitCode },
          {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "eject",
          },
        );
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: ["web-framework-react"],
        });

        const addArrays = await readConfigArrays(projectDir);

        expect(addArrays.skillIds.length).toBeGreaterThanOrEqual(beforeArrays.skillIds.length);
        expectNoDuplicates(addArrays.skillIds, "skills after adding");
        expectNoDuplicates(addArrays.agentNames, "agents after adding");

        expect(addArrays.skillIds).toContain("web-framework-react");

        const addedSkillIds = addArrays.skillIds.filter(
          (id) => !beforeArrays.skillIds.includes(id),
        );

        // ================================================================
        // Phase 3: Second edit -- navigate through without changes
        // ================================================================

        const edit2Wizard = await EditWizard.launch({
          projectDir,
          source: { sourceDir, tempDir: sourceTempDir },
          rows: 60,
          cols: 120,
        });

        const sources2 = await edit2Wizard.build.advanceToSources();
        const agents2 = await sources2.acceptDefaults();
        const confirm2 = await agents2.acceptDefaults("edit");
        const edit2Result = await confirm2.confirm();

        await edit2Result.destroy();

        // --- Phase 3 verification ---
        await expectPhaseSuccess(
          { project: { dir: projectDir }, exitCode: edit2Result.exitCode },
          {
            skillIds: ["web-framework-react"],
            agents: ["web-developer"],
            source: "eject",
          },
        );
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          name: "web-developer",
        });
        await expect({ dir: projectDir }).toHaveAgentFrontmatter("web-developer", {
          skills: ["web-framework-react"],
        });

        const noChangeArrays = await readConfigArrays(projectDir);

        expectNoDuplicates(noChangeArrays.skillIds, "skills after no-change edit");
        expectNoDuplicates(noChangeArrays.agentNames, "agents after no-change edit");
        expectNoDuplicates(noChangeArrays.domains, "domains after no-change edit");

        // CRITICAL: No accumulation between consecutive edits.
        expect(noChangeArrays.skillIds.sort()).toStrictEqual(addArrays.skillIds.sort());
        expect(noChangeArrays.skillIds.length).toBe(addArrays.skillIds.length);

        for (const addedId of addedSkillIds) {
          expect(noChangeArrays.skillIds).toContain(addedId);
        }

        expect(noChangeArrays.skillIds).toContain("web-framework-react");
      },
    );
  });
});
