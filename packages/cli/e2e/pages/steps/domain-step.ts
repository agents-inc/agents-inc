import { BaseStep } from "../base-step.js";
import { STEP_TEXT, TIMEOUTS } from "../constants.js";
import { BuildStep } from "./build-step.js";
import { StackStep } from "./stack-step.js";

export class DomainStep extends BaseStep {
  /** Accept the default domain selection (Enter). Returns BuildStep. */
  async acceptDefaults(): Promise<BuildStep> {
    // Cursor-anchored Enter: "Framework" (BUILD) is the first category label
    // printed by the build step's first frame. Using waitForText on scrollback
    // is unsafe here because an earlier wizard step may have printed "Framework"
    // (e.g. the stack step's "Other Frameworks" group) — the anchored wait
    // ensures we only match the NEW render triggered by this Enter press.
    return this.advanceTo(STEP_TEXT.BUILD);
  }

  /**
   * Accept the default domain selection, waiting on a build-step sentinel the
   * CALLER names. Returns BuildStep.
   *
   * {@link acceptDefaults} waits for `STEP_TEXT.BUILD` — "Framework", the first
   * category label the fixture marketplace happens to paint. That string is a
   * property of THAT marketplace's categories, not of the wizard, so a session
   * running against a marketplace with categories of its own has to say what its
   * own build step prints. `STEP_TEXT.BUILD_FOOTER` is the marketplace-independent
   * choice for such a caller.
   */
  async advanceTo(buildStepSentinel: string): Promise<BuildStep> {
    await this.waitForStep(STEP_TEXT.DOMAINS);
    await this.pressEnterAndWaitFor(buildStepSentinel);
    return new BuildStep(this.session, this.projectDir);
  }

  /**
   * Toggle a domain by name using Space.
   * Navigates the cursor to the line containing the domain label,
   * then presses Space to toggle it.
   */
  async toggleDomain(domainName: string): Promise<void> {
    await this.navigateCursorToItem(domainName);
    await this.waitForWizardFooter();
    await this.pressSpace();
  }

  /** Advance to build step after toggling domains. */
  async advance(): Promise<BuildStep> {
    await this.pressEnterAndWaitFor(STEP_TEXT.BUILD);
    return new BuildStep(this.session, this.projectDir);
  }

  /**
   * Deselect all currently selected domains.
   * Walks through the entire domain list, unchecking selected items.
   * Uses checkbox markers ([✓]) to detect selected state.
   */
  async deselectAll(): Promise<void> {
    // Navigate through the full list, toggling selected items.
    // The domain list has up to 8 built-in items, so iterating from
    // top to bottom and toggling any checked items covers all cases.
    const maxItems = 10;
    for (let i = 0; i < maxItems; i++) {
      const output = this.getOutput();
      // Check if the currently focused item has a checkmark
      // The focused item has "❯" prefix
      const lines = output.split("\n");
      const focusedLine = lines.find((l) => l.includes("❯"));
      if (focusedLine && focusedLine.includes("✓")) {
        await this.waitForWizardFooter();
        await this.pressSpace();
      }
      await this.waitForWizardFooter();
      await this.pressArrowDown();
    }
  }

  /** Go back to stack selection (Escape). */
  async goBack(): Promise<StackStep> {
    await this.waitForWizardFooter();
    await this.pressEscape();
    await this.screen.waitForText(STEP_TEXT.STACK, TIMEOUTS.WIZARD_LOAD);
    return new StackStep(this.session, this.projectDir);
  }
}
