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

  /** Set all sources to local (press "l"). */
  async setAllLocal(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("l");
  }

  /** Set all sources to plugin (press "p"). */
  async setAllPlugin(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("p");
  }

  /**
   * Select the source cell the grid cursor is currently on (Space).
   *
   * Each row in the customize grid is one skill; each column is one available
   * source (column 0 is "Local"/eject, columns 1+ are the configured
   * marketplaces). Space commits the focused column as that skill's source,
   * leaving every other row untouched — this is how a per-skill source split
   * is produced.
   */
  async selectFocusedSourceCell(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressSpace();
  }

  /**
   * Move the grid cursor one source column to the right within the focused
   * skill row (e.g. from "Local" to the first marketplace column).
   */
  async moveSourceColumnRight(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressArrowRight();
  }

  /** Open settings overlay (press "s"). */
  async openSettings(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("s");
  }

  /** Close settings overlay (Escape within settings). */
  async closeSettings(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressEscape();
  }

  /** Press "a" to add a source (within settings overlay). */
  async pressAddSource(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("a");
  }

  /** Press backspace/DEL to delete a source (within settings overlay). */
  async pressDeleteSource(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressKey("\x7f");
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
