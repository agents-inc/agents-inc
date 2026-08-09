import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { ADDED_MARKER, STEP_TEXT, WIZARD_TAB_LABELS } from "../pages/constants.js";
import { E2E_SKILL, E2E_STACK_AGENTS, E2E_STACK_DISPLAY } from "../fixtures/expected-values.js";
import { ensureBinaryExists } from "../helpers/test-utils.js";
import "../matchers/setup.js";

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
      // The whole footer as one line rather than its three captions: each word
      // survives a step whose rows bleed over the footer, and only the spacing
      // between them does not.
      expect(output).toContain(STEP_TEXT.FOOTER_HOTKEY_ROW);
    });

    it("should display wizard step tabs", async () => {
      wizard = await InitWizard.launch();

      const output = wizard.stack.getOutput();
      // Every tab, including the Domains one the five hardcoded labels omitted.
      for (const tabLabel of WIZARD_TAB_LABELS) {
        expect(output).toContain(tabLabel);
      }
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
  });

  describe("confirm step detail verification", () => {
    it("should name the stack, its marketplace, its scope and its whole agent roster", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughAllDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");

      const confirmOutput = confirm.getOutput();
      expect(confirmOutput).toContain(`${STEP_TEXT.READY_TO_INSTALL} ${E2E_STACK_DISPLAY}`);
      expect(confirmOutput).toContain(
        `${STEP_TEXT.PANEL_MARKETPLACE} ${STEP_TEXT.SOURCE_DISPLAY_DEFAULT}`,
      );
      expect(confirmOutput).toContain(`${STEP_TEXT.PANEL_STACK} ${E2E_STACK_DISPLAY}`);
      expect(confirmOutput).toContain(STEP_TEXT.SCOPE_GLOBAL);

      // The roster is read off the stack definition, so neither an omission nor an
      // addition can pass — a hand-written list would go stale silently.
      for (const agentName of E2E_STACK_AGENTS) {
        expect(confirmOutput).toContain(`${ADDED_MARKER} ${agentName}`);
      }
    });

    it("should list the selected skills under their scope heading in the scratch flow", async () => {
      wizard = await InitWizard.launch();

      const domain = await wizard.stack.selectScratch();
      const build = await domain.acceptDefaults();
      const sources = await build.passThroughScratchDomains();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("init");

      const confirmOutput = confirm.getOutput();
      expect(confirmOutput).toContain(STEP_TEXT.READY_TO_INSTALL);
      expect(confirmOutput).toContain(`${STEP_TEXT.PANEL_STACK} ${STEP_TEXT.PANEL_STACK_NONE}`);
      expect(confirmOutput).toContain(STEP_TEXT.SCOPE_GLOBAL);

      // The scratch flow's default domains are Web and API, so each domain's
      // required framework skill is selected and no meta-domain skill is.
      expect(confirmOutput).toContain(`${ADDED_MARKER} ${E2E_SKILL.react.display}`);
      expect(confirmOutput).toContain(`${ADDED_MARKER} ${E2E_SKILL.hono.display}`);
      expect(confirmOutput).not.toContain(E2E_SKILL.reviewing.display);
    });
  });
});
