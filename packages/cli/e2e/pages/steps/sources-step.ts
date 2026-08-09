import { BaseStep } from "../base-step.js";
import { STEP_TEXT, TIMEOUTS } from "../constants.js";
import { AgentsStep } from "./agents-step.js";
import { BuildStep } from "./build-step.js";

export class SourcesStep extends BaseStep {
  /** Wait for sources step to be ready. */
  async waitForReady(): Promise<void> {
    await this.screen.waitForText(STEP_TEXT.SOURCES, TIMEOUTS.WIZARD_LOAD);
    await this.waitForWizardFooter();
  }

  /** Accept defaults and advance to agents step. */
  async acceptDefaults(): Promise<AgentsStep> {
    await this.waitForReady();
    await this.pressEnter();
    return new AgentsStep(this.session, this.projectDir);
  }

  /** Set every skill to install locally (press "l"). */
  async setAllLocal(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("l");
  }

  /** Set every skill to install as a plugin (press "p"). */
  async setAllPlugin(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("p");
  }

  /**
   * Commit the install-mode cell the grid cursor is currently on (Space).
   *
   * Each row is one skill and carries a two-state control: `Local` at column 0,
   * `Plugin` at column 1. Space commits the focused cell as that skill's mode,
   * leaving every other row untouched — this is how a per-skill mixed install
   * is produced.
   */
  async selectFocusedSourceCell(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressSpace();
  }

  /**
   * Move the grid cursor one cell right within the focused skill's row —
   * `Local` to `Plugin`, and from `Plugin` it wraps back to `Local`.
   */
  async moveSourceColumnRight(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressArrowRight();
  }

  /** Go back to build step (Escape). */
  async goBack(): Promise<BuildStep> {
    await this.waitForWizardFooter();
    await this.pressEscape();
    await this.screen.waitForText(STEP_TEXT.BUILD, TIMEOUTS.WIZARD_LOAD);
    return new BuildStep(this.session, this.projectDir);
  }

  /** Advance to agents step (Enter). */
  async advance(): Promise<AgentsStep> {
    await this.waitForWizardFooter();
    await this.pressEnter();
    return new AgentsStep(this.session, this.projectDir);
  }
}
