import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";

import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  ADDED_MARKER,
  REMOVED_MARKER,
  STEP_TEXT,
  TIMEOUTS,
  UNCHANGED_MARKER,
} from "../pages/constants.js";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * E2E tests for the `edit` command wizard — confirm step and completion flow.
 *
 * Tests the confirm step summary display, full edit flow completion,
 * back navigation, and skill selection preservation.
 */
describe("edit wizard — confirm step and completion", () => {
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("confirm step and completion", () => {
    it("should navigate to confirm step and show summary", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      const sources = await wizard.build.advanceToSources();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");

      await confirm.waitForReady();
      const screen = confirm.getScreen();
      expect(screen).toContain(STEP_TEXT.READY_TO_INSTALL);
      // The fixture is project-scoped throughout and this pass changes nothing,
      // so every row belongs under the Project heading carrying the unchanged
      // marker. A bare name match cannot tell that from a row the wizard is
      // about to add or remove — which is the only thing a summary says.
      expect(screen).toContain(STEP_TEXT.SCOPE_PROJECT);
      expect(screen).toContain(`${UNCHANGED_MARKER} ${E2E_SKILL.react.display}`);
      expect(screen).toContain(`${UNCHANGED_MARKER} Tailwind CSS`);
      expect(screen).toContain(`${UNCHANGED_MARKER} web-developer`);
      expect(screen).not.toContain(`${ADDED_MARKER} ${E2E_SKILL.react.display}`);
      expect(screen).not.toContain(`${REMOVED_MARKER} ${E2E_SKILL.react.display}`);
      // The whole footer line rather than the individual key captions: a step
      // whose rows bleed over the footer leaves every word present and splices
      // the overflow between them.
      expect(screen).toContain(STEP_TEXT.FOOTER_HOTKEY_ROW);
    });

    it(
      "should complete full edit flow and recompile agents",
      { timeout: TIMEOUTS.PLUGIN_INSTALL },
      async () => {
        // web-styling-tailwind is claimed by the config and installed nowhere —
        // the wizard cannot resolve it, drops it, and that removal is the change
        // this flow completes on.
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id],
          unresolvableSkills: ["web-styling-tailwind"],
          agents: ["web-developer"],
          domains: ["web"],
        });

        wizard = await EditWizard.launch({
          projectDir: project.dir,
          source: E2E_SOURCE,
          cols: 120,
          rows: 40,
        });

        // Single domain — advance Build -> Sources -> Agents -> Confirm
        const result = await wizard.build.saveFromBuild("edit");

        // The unresolvable skill is gone from config.ts — the wizard could not represent it, so
        // the merge removed it and `edit` named it in the Changes block.
        await expectPhaseSuccess(result, {
          skillIds: [E2E_SKILL.react.id],
          agents: ["web-developer"],
          compiledAgents: ["web-developer"],
        });
        await expect(result.project).toHaveCompiledAgentContent("web-developer", {
          contains: ["name: web-developer", E2E_SKILL.react.id],
        });
        // Compiled agent should contain the project's skill
        await expect(result.project).toHaveCompiledAgentContent("web-developer", {
          contains: [E2E_SKILL.react.id],
        });
      },
    );

    it("should preserve skill selections when navigating back and forth", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      // Verify pre-selected skill is shown
      const outputBefore = wizard.build.getOutput();
      expect(outputBefore).toMatch(/Framework.*\(1 of 1\)/);

      // Navigate forward: Build -> Sources -> Agents -> Confirm
      const sources = await wizard.build.advanceToSources();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");

      // Go back from confirm -> agents -> sources -> build via ESC chain
      const agentsBack = await confirm.goBackToAgents();
      const sourcesBack = await agentsBack.goBack();
      const buildAgain = await sourcesBack.goBack();

      // The pre-selected skill should still be shown after navigating back
      const outputAfter = buildAgain.getOutput();
      expect(outputAfter).toMatch(/Framework.*\(1 of 1\)/);
      expect(outputAfter).toContain("React");
    });
  });

  describe("confirm step navigation", () => {
    it("should return to agents step when pressing ESC on confirm step", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      const sources = await wizard.build.advanceToSources();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");

      // Press ESC on confirm step — should go back to agents step
      await confirm.goBack();

      const screen = agents.getOutput();
      // Should be back on the agents step, not exited
      expect(screen).toContain(STEP_TEXT.AGENTS);
    });
  });
});
