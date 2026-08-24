import { afterEach, describe, expect, it } from "vitest";

import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * E2E tests for the `edit` command wizard — navigation, hotkeys, cancellation,
 * and build step validation.
 */
describe("edit wizard — navigation and hotkeys", () => {
  let wizard: EditWizard | undefined;

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("cancellation", () => {
    it("should cancel when Ctrl+C is pressed during wizard", async () => {
      const project = await ProjectBuilder.editable();

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      // abortAndDestroy pins the exit code to CANCELLED itself, so it carries the
      // verdict for this test. A copy here could never go red — the funnel throws
      // first — and would read as coverage while providing none.
      await wizard.abortAndDestroy(TIMEOUTS.EXIT);
    });

    it("should preserve original installation after cancellation", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      // Cancel the wizard
      await wizard.abortAndDestroy(TIMEOUTS.EXIT);

      // Config should be unchanged after cancellation
      await expect(project).toHaveConfig({ skillIds: [E2E_SKILL.react.id] });
      // Original skill files should still exist
      await expect(project).toHaveSkillCopied(E2E_SKILL.react.id);
    });
  });

  describe("keyboard navigation", () => {
    it("should navigate to sources step with ENTER", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      // Press ENTER to continue from build step.
      const sources = await wizard.build.advanceToSources();

      const output = sources.getOutput();
      expect(output).toContain(STEP_TEXT.SOURCES);
    });

    it("should stay on build step when pressing ESC in edit flow with no prior history", async () => {
      const project = await ProjectBuilder.editable();

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      await wizard.build.goBack();

      const screen = wizard.build.getScreen();
      expect(screen).toContain(STEP_TEXT.BUILD);
      expect(screen).not.toContain(STEP_TEXT.DOMAINS);
    });
  });

  describe("wizard hotkeys", () => {
    it("should show hotkey indicators in the footer", async () => {
      const project = await ProjectBuilder.editable();

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      const output = wizard.build.getOutput();
      // The build step footer shows the Labels hotkey indicator.
      expect(output).toContain(STEP_TEXT.BUILD_FOOTER);
      // Incompatible-skill filtering was withdrawn, so the hint it advertised is gone.
      expect(output).not.toContain("Filter incompatible");
    });

    it("should leave the build step untouched when the withdrawn F hotkey is pressed", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      const before = wizard.build.getScreen();
      await wizard.build.pressFilterIncompatibleHotkey();

      expect(wizard.build.getScreen(), "nothing handles F, so the grid cannot move").toBe(before);
    });

    it("should toggle focused skill scope with S key", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
        agents: ["web-developer"],
        domains: ["web"],
      });

      // `launchInGlobal` in the refusal spec below is this same launch with HOME collapsed onto
      // projectDir, and that collapse is the only difference between the two.
      wizard = await EditWizard.launchInProject({
        projectDir: project.dir,
        cols: 120,
        rows: 40,
      });

      // The footer paints the scope hotkey only for a genuine project-scope edit, so it is
      // both the affordance and this spec's proof of which scope the session actually runs at.
      expect(wizard.build.getScreen()).toContain(STEP_TEXT.SCOPE);

      // Focus the pre-selected project skill and press "s" to toggle its scope
      // from "project" (default) to "global". The grid's first-alphabetical cell
      // is Angular Standalone (unselected), so focus explicitly — and by the
      // TITLE the fixture's installed copy carries, not by its id and not by the
      // default catalogue's own "React", which is a different cell entirely.
      await wizard.build.focusSkill(E2E_SKILL.react.display);
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "the fixture installs react at project scope, so the row starts on the P badge",
      ).toStrictEqual(["P"]);

      await wizard.build.toggleScopeOnFocusedSkill();

      // The badge is the same observable the global-context refusal below reads, and the
      // reason the two are in one file: on its own, "the badge did not move" cannot tell a
      // guard scoped to global edits from one that has stopped the key working anywhere.
      expect(
        await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "`s` at project scope must move the row from project to global",
      ).toStrictEqual(["G"]);

      // Navigate to the confirm step to verify the scope change is reflected.
      const sources = await wizard.build.advanceToSources();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");

      const confirmOutput = confirm.getOutput();
      // The confirm step shows scope as section headers (Project/Global).
      expect(confirmOutput).toContain("Global");
    });

    // The runner's patience, not the wait's budget: `toggleScopeOnFocusedSkillAwaiting`
    // waits TIMEOUTS.WIZARD_LOAD for the toast, which outlasts this project's 30s default,
    // so a missing toast would be killed by the runner and reported as "test timed out"
    // instead of by the wait, which names the string it never saw.
    it(
      "should refuse the S scope toggle when the session is editing the global install",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id, "web-styling-tailwind"],
          agents: ["web-developer"],
          domains: ["web"],
        });

        // HOME === cwd === projectDir, the collapse `edit` reads as "this IS the global
        // install". There is no second scope to move a row to, so `s` is turned away.
        wizard = await EditWizard.launchInGlobal({
          projectDir: project.dir,
          cols: 120,
          rows: 40,
        });

        // The same sentinel the allowed spec above waits for, read the other way round: its
        // absence is what says this session really did collapse HOME onto the project, so a
        // missing toast below is the guard and not a launch that stayed at project scope.
        expect(wizard.build.getScreen()).not.toContain(STEP_TEXT.SCOPE);

        await wizard.build.focusSkill(E2E_SKILL.react.display);
        expect(
          await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
          "the fixture's saved entry is project-scoped, so the row opens on the P badge here too",
        ).toStrictEqual(["P"]);

        // The toast carries the whole verdict. A badge that has not moved is produced by the
        // component guard and by the store guard behind it alike, so it cannot say which one
        // refused — and the store's is unreachable, since nothing but this component calls it.
        await wizard.build.toggleScopeOnFocusedSkillAwaiting(STEP_TEXT.SCOPE_TOGGLE_BLOCKED);

        expect(
          await wizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
          "a refused scope toggle must leave the row's badge where it was",
        ).toStrictEqual(["P"]);
      },
    );
  });

  describe("build step advancement", () => {
    it("should advance past build step even when all skills in a category are deselected", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      expect(
        await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
        "the fixture pre-selects react, so Framework opens with one skill chosen",
      ).toBe(1);

      // `selectSkill` rather than `toggleFocusedSkill`: this test is named for the EMPTY
      // category, and an open-loop press cannot tell a swallowed keystroke from a refused one
      // or a landed one — all three leave the advance below green. `selectSkill` names the
      // skill it means and confirms the cell moved.
      await wizard.build.selectSkill(E2E_SKILL.react.display);

      // The precondition, read rather than assumed. Without it the wizard advancing says
      // nothing about advancing FROM AN EMPTY CATEGORY, since it advances either way.
      expect(
        await wizard.build.getExclusiveCategorySelectedCount(STEP_TEXT.CATEGORY_FRAMEWORK),
        "the deselection must leave Framework with nothing chosen before the advance is asserted",
      ).toBe(0);

      // Press ENTER — wizard should advance to the next step (sources)
      const sources = await wizard.build.advanceToSources();

      const sourcesOutput = sources.getOutput();
      // The wizard no longer blocks advancement — it advances to sources step
      expect(sourcesOutput).toContain(STEP_TEXT.SOURCES);
    });
  });
});
