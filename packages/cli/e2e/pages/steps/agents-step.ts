import { BaseStep } from "../base-step.js";
import { STEP_TEXT, TIMEOUTS, type WizardType } from "../constants.js";
import { toggleListRowUntilRendered } from "../list-row-toggle.js";
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
   * Navigate to an agent by name and toggle it, CLOSED-LOOP: the Space press is confirmed
   * against that row's own rendered text and re-pressed only while the list has not shown it
   * landing (see {@link toggleListRowUntilRendered} for the race and the signal).
   *
   * It follows that `toggleAgent` means the toggle LANDED. A press the product refuses — a
   * global-locked sub-agent at project scope — leaves the row exactly as it was and is reported
   * here rather than passed on; a spec whose subject IS the refusal wants
   * {@link toggleFocusedAgentAwaiting}, which anchors on the toast instead.
   */
  async toggleAgent(agentName: string): Promise<void> {
    await this.navigateCursorToItem(agentName);
    await this.waitForWizardFooter();
    await toggleListRowUntilRendered({
      method: "AgentsStep.toggleAgent",
      label: agentName,
      readScreen: () => this.getScreen(),
      press: async () => {
        await this.waitForWizardFooter();
        await this.pressSpace();
      },
    });
  }

  /**
   * Navigate the cursor to a specific agent by display name.
   * Does NOT toggle selection or scope -- call toggleScopeOnFocusedAgent() after.
   */
  async navigateCursorToAgent(agentName: string): Promise<void> {
    await this.navigateCursorToItem(agentName);
  }

  /**
   * Press Space on the focused agent and wait for `sentinel` in RAW PTY output
   * emitted after the press.
   *
   * Use instead of `toggleAgent()` whenever the assertion is on a TOAST. Ink
   * rewrites the absolutely-positioned toast row in place, so xterm's processed
   * buffer (`getOutput()` / `getScreen()`) can already have lost the text by the
   * time a test reads it; raw output IS append-only, so the toast survives
   * there. Anchoring on a pre-press cursor is required because an earlier
   * frame's residue would satisfy a non-anchored raw match. Mirrors
   * BuildStep.toggleFocusedSkillAwaiting.
   */
  async toggleFocusedAgentAwaiting(sentinel: string): Promise<void> {
    await this.waitForWizardFooter();
    const cursor = this.getRawCursor();
    await this.pressSpace();
    await this.screen.waitForTextAfter(sentinel, cursor, this.defaultTimeout);
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
    for (const line of [...lines].reverse()) {
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
