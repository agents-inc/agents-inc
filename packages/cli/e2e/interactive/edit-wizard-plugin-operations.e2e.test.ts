import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { cleanupFixture, isClaudeCLIAvailable } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { TERMINAL_SIZE, TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * E2E tests for the edit wizard in plugin mode — skill install/uninstall
 * and cancellation.
 *
 * Test scenarios:
 *   P-EDIT-1: Add skill via edit triggers plugin install
 *   P-EDIT-2: Remove skill via edit triggers plugin uninstall
 *   + No-change completion
 *   + Cancellation safety
 *
 * The entire suite is skipped when the Claude CLI is not available.
 */

const claudeAvailable = await isClaudeCLIAvailable();

describe.skipIf(!claudeAvailable)("edit wizard — plugin mode operations", () => {
  let fixture: E2EPluginSource;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("remove skill triggers plugin uninstall", () => {
    it("should uninstall removed plugin skills", { timeout: TIMEOUTS.PLUGIN_TEST }, async () => {
      // web-styling-tailwind is claimed by the config and installed nowhere — the
      // wizard cannot resolve it, so removing it is what this run has to uninstall.
      const project = await ProjectBuilder.pluginProject({
        skills: [E2E_SKILL.react.id],
        unresolvableSkills: ["web-styling-tailwind"],
        marketplaceName: fixture.marketplaceName,
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: fixture,
      });

      const result = await wizard.completeFromBuild();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      const rawOutput = result.rawOutput;
      expect(rawOutput).toContain("Removed");
      expect(rawOutput).toContain("plugin");

      // Config should only contain the surviving skill
      await expect(result.project).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
        origin: fixture.marketplaceName,
      });

      // The removed skill must NOT appear in compiled agent content
      await expect(result.project).toHaveCompiledAgentContent("web-developer", {
        notContains: ["web-styling-tailwind"],
      });
    });

    it(
      "should update config after removing a plugin skill",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: fixture,
        });

        const result = await wizard.completeFromBuild();

        await expectPhaseSuccess(result, {
          skillIds: [E2E_SKILL.react.id],
          origin: fixture.marketplaceName,
          compiledAgents: [],
        });
      },
    );

    it(
      "should recompile agents after removing a plugin skill",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: fixture,
        });

        const result = await wizard.completeFromBuild();

        await expectPhaseSuccess(result, {
          compiledAgents: ["web-developer"],
        });
      },
    );
  });

  describe("add skill triggers plugin install", () => {
    it(
      "should install added plugin skills when navigating to a new skill",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: fixture,
          ...TERMINAL_SIZE.TALL,
        });

        // Arrow down to next skill and select it
        await wizard.build.navigateDown();
        await wizard.build.toggleFocusedSkill();

        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;
        expect(rawOutput).toContain("Installed");
        expect(rawOutput).toContain("plugin");

        // Config should include both the original and the newly added skill
        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.pinia.id],
          origin: fixture.marketplaceName,
        });

        // Agents should be recompiled after adding a skill
        await expect(result.project).toHaveCompiledAgent("web-developer");
      },
    );
  });

  describe("plugin mode completion without skill changes", () => {
    it(
      "should complete edit without triggering plugin install/uninstall when skills are unchanged",
      { timeout: TIMEOUTS.PLUGIN_TEST },
      async () => {
        const project = await ProjectBuilder.pluginProject({
          skills: [E2E_SKILL.react.id],
          marketplaceName: fixture.marketplaceName,
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: fixture,
        });

        const result = await wizard.completeFromBuild();

        expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

        const rawOutput = result.rawOutput;
        expect(rawOutput).not.toContain("Installed");
        expect(rawOutput).not.toContain("Removed");

        await expect(result.project).toHaveConfig({
          skillIds: [E2E_SKILL.react.id],
        });
        await expect(result.project).toHaveCompiledAgent("web-developer");
      },
    );
  });

  describe("cancellation in plugin mode", () => {
    it("should not trigger plugin install/uninstall when cancelled", async () => {
      const project = await ProjectBuilder.pluginProject({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        marketplaceName: fixture.marketplaceName,
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        source: fixture,
      });

      // abortAndDestroy pins the exit code to CANCELLED itself; this test's own
      // subject is that no plugin operation ran, which the assertions below carry.
      await wizard.abortAndDestroy(TIMEOUTS.EXIT);

      const rawOutput = wizard.getRawOutput();
      expect(rawOutput).not.toContain("Installing plugin:");
      expect(rawOutput).not.toContain("Uninstalling plugin:");
    });
  });
});
