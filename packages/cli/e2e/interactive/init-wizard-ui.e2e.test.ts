import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { STEP_TEXT } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { ensureBinaryExists } from "../helpers/test-utils.js";
import { FEATURE_FLAGS } from "../../src/cli/lib/feature-flags.js";
import "../matchers/setup.js";

/** D-307 — the settings overlay is withdrawn; the spec that drives it skips with it. */
const settingsOverlayEnabled = FEATURE_FLAGS.WIZARD_SETTINGS_OVERLAY;

describe("init wizard — UI elements", () => {
  let wizard: InitWizard | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  describe("terminal size handling", () => {
    it("should show resize warning in a narrow terminal", async () => {
      wizard = await InitWizard.launchRaw({ cols: 40, rows: 40 });

      const screen = wizard.getScreen();
      expect(screen).toContain(STEP_TEXT.TOO_NARROW);
    });

    it("should show resize warning in a short terminal", async () => {
      wizard = await InitWizard.launchRaw({ cols: 120, rows: 10 });

      const screen = wizard.getScreen();
      expect(screen).toContain(STEP_TEXT.TOO_SHORT);
    });
  });

  describe("wizard UI elements", () => {
    it("should display hotkey hints in the footer", async () => {
      wizard = await InitWizard.launch();

      const output = wizard.stack.getOutput();
      expect(output).toContain("select");
      expect(output).toContain("continue");
      expect(output).toContain("back");
    });

    it("should display wizard step tabs", async () => {
      wizard = await InitWizard.launch();

      const output = wizard.stack.getOutput();
      expect(output).toContain("Stack");
      expect(output).toContain("Skills");
      expect(output).toContain("Sources");
      expect(output).toContain("Agents");
      expect(output).toContain("Confirm");
    });
  });

  describe("wizard toggle badges and keyboard shortcuts", () => {
    it("should toggle scope badge when S key is pressed in build step", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Focus react (a selected skill) and press S to toggle its scope — the grid's
      // first-alphabetical cell is Vue, an unselected skill whose `s` is a no-op.
      await build.focusSkill(E2E_SKILL.react.display);
      await build.toggleScopeOnFocusedSkill();

      const output = build.getOutput();
      expect(output).toContain(STEP_TEXT.BUILD);
    });

    it.skipIf(!settingsOverlayEnabled)(
      "should open settings overlay when S key is pressed during sources step",
      async () => {
        wizard = await InitWizard.launch();

        // Navigate scratch flow to sources
        const domain = await wizard.stack.selectScratch();
        const build = await domain.acceptDefaults();
        const sources = await build.passThroughScratchDomains();

        await sources.openSettings();

        const output = sources.getOutput();
        expect(output).toContain(STEP_TEXT.SOURCES);
      },
    );
  });

  describe("confirm step detail verification", () => {
    it("should display install mode on the confirm step", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");

      const confirmOutput = confirm.getOutput();
      expect(confirmOutput).toContain(STEP_TEXT.READY_TO_INSTALL);
    });

    it("should display install scope on the confirm step", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");

      const confirmOutput = confirm.getOutput();
      expect(confirmOutput).toContain(STEP_TEXT.READY_TO_INSTALL);
      expect(confirmOutput).toContain("Global");
    });

    it("should display selected skills grouped by domain on the confirm step", async () => {
      wizard = await InitWizard.launch();

      // Use scratch flow for domain-grouped display
      const domain = await wizard.stack.selectScratch();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughScratchDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");

      const confirmOutput = confirm.getOutput();
      expect(confirmOutput).toContain(STEP_TEXT.READY_TO_INSTALL);
    });

    it("should display selected agent count on the confirm step", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");

      const confirmOutput = confirm.getOutput();
      expect(confirmOutput).toContain(STEP_TEXT.READY_TO_INSTALL);
      expect(confirmOutput).toContain("web-developer");
    });
  });
});
