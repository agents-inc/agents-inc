import { BaseStep } from "../base-step.js";
import { STEP_TEXT, TIMEOUTS, type WizardType } from "../constants.js";
import { ConfirmStep } from "./confirm-step.js";
import { SourcesStep } from "./sources-step.js";

export class AgentsStep extends BaseStep {
  /** Accept defaults and advance to confirm step. */
  async acceptDefaults(wizardType: WizardType = "init"): Promise<ConfirmStep> {
    await this.screen.waitForText(STEP_TEXT.AGENTS, TIMEOUTS.WIZARD_LOAD);
    await this.waitForWizardFooter();
    await this.pressEnter();
    return new ConfirmStep(this.session, this.projectDir, wizardType);
  }

  /**
   * Toggle an agent by name.
   * Scrolls the cursor to the line containing the agent name, then presses Space.
   */
  async toggleAgent(agentName: string): Promise<void> {
    await this.navigateCursorToItem(agentName);
    await this.waitForWizardFooter();
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
    await this.waitForWizardFooter();
    await this.pressKey("s");
  }

  /**
   * Extract the rendered scope badges (in display order) for a specific agent
   * in the current agents-step list.
   *
   * A single-scope agent renders one bracketed badge ("[P]" or "[G]") between
   * the checkbox and the agent label. A dual-scope agent (active entry plus an
   * excluded tombstone at the other scope) renders BOTH badges back-to-back
   * ("[P][G]"). Returns ["P"], ["G"], ["P", "G"], ["G", "P"], or [] when no
   * badge is present.
   *
   * Scans newest-to-oldest so a re-opened wizard reads the current frame rather
   * than stale scrollback. Only the "[P]" / "[G]" scope badges match the
   * bracket-letter pattern — the checkbox tokens ("[✓]", "[ ]") never
   * contain a bare P or G. Mirrors BuildStep.getScopeBadgesForSkill.
   *
   * Requires a stable render — the agents step must have finished redraws.
   */
  async getScopeBadgesForAgent(agentLabel: string): Promise<Array<"P" | "G">> {
    await this.waitForWizardFooter();
    const output = this.getOutput();
    const lines = output.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const nameIdx = line.indexOf(agentLabel);
      if (nameIdx === -1) continue;
      const prefix = line.slice(0, nameIdx);
      if (!prefix.includes("[")) continue;
      const badges = Array.from(prefix.matchAll(/\[([PG])\]/g)).map(
        (match) => match[1] as "P" | "G",
      );
      if (badges.length > 0) return badges;
    }
    throw new Error(
      `getScopeBadgesForAgent: "${agentLabel}" badge cell not found.\nOutput:\n${output}`,
    );
  }

  /** Advance to confirm step (Enter). */
  async advance(wizardType: WizardType = "init"): Promise<ConfirmStep> {
    await this.waitForWizardFooter();
    await this.pressEnter();
    return new ConfirmStep(this.session, this.projectDir, wizardType);
  }

  /** Go back to sources step (Escape). */
  async goBack(): Promise<SourcesStep> {
    await this.waitForWizardFooter();
    await this.pressEscape();
    await this.screen.waitForText(STEP_TEXT.SOURCES, TIMEOUTS.WIZARD_LOAD);
    return new SourcesStep(this.session, this.projectDir);
  }
}
