import path from "path";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import "../matchers/setup.js";

/**
 * E2E tests for the edit wizard in eject mode — skill add and remove.
 *
 * Eject mode differs from plugin mode:
 * - No `claude plugin install/uninstall` calls
 * - Skills are copied from the source directory to .claude/skills/
 * - Removal in eject mode updates config but does NOT delete skill files
 */

describe("edit wizard — eject mode", () => {
  let sourceFixture: E2ESource;
  let wizard: EditWizard | undefined;
  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    sourceFixture = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceFixture) await cleanupTempDir(sourceFixture.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("add a skill during local edit", () => {
    it(
      "should update config with newly selected skill",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        // Create project with only web-framework-react. The E2E source also has
        // web-testing-vitest and web-state-zustand in the Web domain.
        const project = await ProjectBuilder.editable({
          skills: ["web-framework-react"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        // Select the vitest skill by name
        await wizard.build.selectSkill(E2E_SKILL.vitest.slug);

        // Navigate through remaining steps with explicit eject source selection
        const sources = await wizard.build.advanceToSources();
        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;

        // The changes summary should list additions
        expect(rawOutput).toContain("Changes:");

        // Config should now include both skills
        await expect(result.project).toHaveConfig({
          skillIds: ["web-framework-react", "web-testing-vitest"],
          agents: ["web-developer"],
        });

        // Eject mode: skill must be physically copied to .claude/skills/
        await expect(result.project).toHaveSkillCopied("web-testing-vitest");

        // Compiled agent should contain the newly added skill
        await expect(result.project).toHaveCompiledAgentContent("web-developer", {
          contains: ["web-testing-vitest"],
        });
      },
    );

    it(
      "should show changes summary with added count",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: ["web-framework-react"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        // Select an additional skill
        await wizard.build.navigateDown();
        await wizard.build.selectSkill(E2E_SKILL.vitest.slug);

        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;

        // The "Changes:" section should list additions
        expect(rawOutput).toContain("Changes:");

        await expect(result.project).toHaveCompiledAgents();
      },
    );

    it(
      "should recompile agents after adding a skill",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: ["web-framework-react"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        // Select an additional skill
        await wizard.build.navigateDown();
        await wizard.build.selectSkill(E2E_SKILL.vitest.slug);

        const result = await wizard.completeFromBuild();

        await expectPhaseSuccess(result, {
          compiledAgents: ["web-developer"],
        });
      },
    );
  });

  describe("remove a skill during local edit", () => {
    it(
      "should detect unresolvable skill as removed and complete edit",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        // Create project with 2 skills: web-framework-react (in E2E source)
        // and web-styling-tailwind (NOT in E2E source). The wizard cannot
        // resolve tailwind from the E2E source, so it drops it automatically.
        const project = await ProjectBuilder.editable({
          skills: ["web-framework-react", "web-styling-tailwind"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        // Navigate straight through without changing skills
        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;

        // The removal should be reported in the changes summary.
        expect(rawOutput).toContain("Changes:");
        expect(rawOutput).toContain("web-styling-tailwind");

        // Config should still reference the surviving skill.
        await expect(result.project).toHaveConfig({ skillIds: ["web-framework-react"] });

        // The removed skill must NOT appear in compiled agent content
        await expect(result.project).toHaveCompiledAgentContent("web-developer", {
          notContains: ["web-styling-tailwind"],
        });
      },
    );

    it("should show removal in changes summary", { timeout: TIMEOUTS.PLUGIN_INSTALL }, async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react", "web-styling-tailwind"],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: sourceFixture,
        ...TERMINAL_SIZE.TALL,
        env: { HOME: project.dir },
      });

      const result = await wizard.completeFromBuild();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const rawOutput = result.rawOutput;

      // The changes summary should list removals
      expect(rawOutput).toContain("Changes:");

      const config = await readTestFile(configTsPath(result.project.dir));
      expect(config).not.toContain('"web-testing-vitest"');

      await expect(result.project).toHaveCompiledAgents();
    });

    it(
      "should recompile agents after removing a skill",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: ["web-framework-react", "web-styling-tailwind"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        const result = await wizard.completeFromBuild();

        await expectPhaseSuccess(result, {
          compiledAgents: ["web-developer"],
        });
      },
    );

    it(
      "should preserve local skill files when source is unchanged during edit",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: ["web-framework-react", "web-styling-tailwind"],
          agents: ["web-developer"],
          domains: ["web"],
        });
        tempDir = path.dirname(project.dir);

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: sourceFixture,
          ...TERMINAL_SIZE.TALL,
          env: { HOME: project.dir },
        });

        const result = await wizard.completeFromBuild();

        // The wizard preserves the saved source ("eject") from the existing config
        // when the user doesn't explicitly change it. No source migration is triggered,
        // so eject skill files remain intact.
        await expectPhaseSuccess(result, {
          copiedSkills: ["web-framework-react"],
          compiledAgents: [],
        });

        await expect(result.project).toHaveCompiledAgents();
      },
    );
  });
});
