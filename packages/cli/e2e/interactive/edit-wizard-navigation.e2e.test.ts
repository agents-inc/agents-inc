import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ensureBinaryExists, createTempDir, cleanupTempDir } from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { STEP_TEXT, TIMEOUTS, EXIT_CODES } from "../pages/constants.js";
import "../matchers/setup.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * E2E tests for the `edit` command wizard — navigation, hotkeys, cancellation,
 * and build step validation.
 */
describe("edit wizard — navigation and hotkeys", () => {
  let wizard: EditWizard | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("cancellation", () => {
    it("should cancel when Ctrl+C is pressed during wizard", async () => {
      const project = await ProjectBuilder.editable();

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      // Send Ctrl+C to abort
      const exitCode = await wizard.abortAndDestroy(TIMEOUTS.EXIT);

      // Ctrl+C in a PTY sends SIGINT, which usually results in non-zero exit
      expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
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
    let tempHOME: string | undefined;

    afterEach(async () => {
      if (tempHOME) {
        await cleanupTempDir(tempHOME);
        tempHOME = undefined;
      }
    });

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

      // Create a separate HOME so the wizard does not treat projectDir as global scope.
      // TerminalSession sets HOME=cwd by default, which makes isGlobalDir=true and
      // hides the Scope hotkey. A distinct HOME ensures project-scope editing.
      tempHOME = await createTempDir();

      wizard = await EditWizard.launch({
        projectDir: project.dir,
        cols: 120,
        rows: 40,
        env: { HOME: tempHOME },
      });

      const buildOutput = wizard.build.getOutput();
      // The "S" badge with "Scope" label should be visible in the build step footer
      expect(buildOutput).toContain("Scope");

      // Focus the pre-selected project skill and press "s" to toggle its scope
      // from "project" (default) to "global". The grid's first-alphabetical cell
      // is Angular Standalone (unselected), so focus explicitly — and by the
      // TITLE the fixture's installed copy carries, not by its id and not by the
      // default catalogue's own "React", which is a different cell entirely.
      await wizard.build.focusSkill(E2E_SKILL.react.display);
      await wizard.build.toggleScopeOnFocusedSkill();

      // Navigate to the confirm step to verify the scope change is reflected.
      const sources = await wizard.build.advanceToSources();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");

      const confirmOutput = confirm.getOutput();
      // The confirm step shows scope as section headers (Project/Global).
      expect(confirmOutput).toContain("Global");
    });
  });

  describe("build step advancement", () => {
    it("should advance past build step even when all skills in a category are deselected", async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        domains: ["web"],
      });

      wizard = await EditWizard.launch({ projectDir: project.dir, cols: 120, rows: 40 });

      // Framework category should show pre-selected react skill
      const output = wizard.build.getOutput();
      expect(output).toContain("(1 of 1)");

      // Deselect the react skill with SPACE (it is already focused as the first item)
      await wizard.build.toggleFocusedSkill();

      // Press ENTER — wizard should advance to the next step (sources)
      const sources = await wizard.build.advanceToSources();

      const sourcesOutput = sources.getOutput();
      // The wizard no longer blocks advancement — it advances to sources step
      expect(sourcesOutput).toContain("Sources");
    });
  });
});
