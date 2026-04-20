import { BaseStep } from "../base-step.js";
import { STEP_TEXT, TIMEOUTS } from "../constants.js";
import { ConfirmStep } from "./confirm-step.js";
import { SourcesStep } from "./sources-step.js";

export class AgentsStep extends BaseStep {
  /** Accept defaults and advance to confirm step. */
  async acceptDefaults(wizardType: "init" | "edit" = "init"): Promise<ConfirmStep> {
    await this.screen.waitForText(STEP_TEXT.AGENTS, TIMEOUTS.WIZARD_LOAD);
    await this.waitForStableRender();
    await this.pressEnter();
    return new ConfirmStep(this.session, this.projectDir, wizardType);
  }

  /**
   * Toggle an agent by name.
   * Scrolls the cursor to the line containing the agent name, then presses Space.
   */
  async toggleAgent(agentName: string): Promise<void> {
    await this.navigateCursorToItem(agentName);
    await this.waitForStableRender();
    await this.pressSpace();
  }

  /**
   * Navigate the cursor to a specific agent by display name.
   * Does NOT toggle selection or scope -- call toggleScopeOnFocusedAgent() after.
   */
  async navigateCursorToAgent(agentName: string): Promise<void> {
    await this.navigateCursorToItem(agentName);
  }

  /** Toggle scope on the currently focused agent (press "s"). */
  async toggleScopeOnFocusedAgent(): Promise<void> {
    await this.waitForStableRender();
    await this.pressKey("s");
  }

  /** Advance to confirm step (Enter). */
  async advance(wizardType: "init" | "edit" = "init"): Promise<ConfirmStep> {
    await this.pressEnter();
    return new ConfirmStep(this.session, this.projectDir, wizardType);
  }

  /** Go back to sources step (Escape). */
  async goBack(): Promise<SourcesStep> {
    await this.pressEscape();
    await this.screen.waitForText(STEP_TEXT.SOURCES, TIMEOUTS.WIZARD_LOAD);
    return new SourcesStep(this.session, this.projectDir);
  }
}
