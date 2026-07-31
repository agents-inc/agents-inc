import type { TerminalSession } from "../../helpers/terminal-session.js";
import { BaseStep } from "../base-step.js";
import { STEP_TEXT, TIMEOUTS, type WizardType } from "../constants.js";
import { WizardResult } from "../wizard-result.js";

export class ConfirmStep extends BaseStep {
  constructor(
    session: TerminalSession,
    projectDir: string,
    private wizardType: WizardType,
  ) {
    super(session, projectDir);
  }

  /** Wait for confirm step to be ready. */
  async waitForReady(): Promise<void> {
    await this.screen.waitForText(STEP_TEXT.CONFIRM, TIMEOUTS.WIZARD_LOAD);
  }

  /** Wait for the confirm screen, let it settle, then press Enter. */
  private async submitConfirmation(): Promise<void> {
    await this.screen.waitForText(STEP_TEXT.CONFIRM, TIMEOUTS.WIZARD_LOAD);
    await this.waitForWizardFooter();
    await this.pressEnter();
  }

  /** Confirm and wait for completion. Returns WizardResult. */
  async confirm(): Promise<WizardResult> {
    await this.submitConfirmation();
    if (this.wizardType === "init") {
      await this.screen.waitForText(STEP_TEXT.INIT_SUCCESS, TIMEOUTS.INSTALL);
    } else {
      // Edit can produce "Plugin updated" or "Plugin unchanged"
      await this.screen.waitForEither(
        STEP_TEXT.EDIT_SUCCESS,
        STEP_TEXT.EDIT_UNCHANGED,
        TIMEOUTS.INSTALL,
      );
    }
    return new WizardResult(this.session, this.projectDir);
  }

  /**
   * Confirm and wait for `sentinel` in RAW PTY output on the caller's budget.
   *
   * `confirm()` bakes in both values: for an edit it accepts EDIT_SUCCESS *or*
   * EDIT_UNCHANGED off the xterm buffer within TIMEOUTS.INSTALL. Tests that
   * must pin one exact sentinel, read it from raw output, or allow the longer
   * budget a real `claude plugin install` round-trip needs
   * (TIMEOUTS.PLUGIN_INSTALL) pass both explicitly here rather than widening
   * `confirm()` for every other caller.
   */
  async confirmAwaiting(sentinel: string, timeoutMs: number): Promise<WizardResult> {
    await this.submitConfirmation();
    await this.screen.waitForRawText(sentinel, timeoutMs);
    return new WizardResult(this.session, this.projectDir);
  }

  /**
   * Confirm and wait for the process to exit, without requiring a success
   * banner. Use for tests that expect the install step to hard-error.
   * Callers assert on the resulting exit code and output.
   */
  async confirmExpectingExit(): Promise<WizardResult> {
    await this.submitConfirmation();
    return new WizardResult(this.session, this.projectDir);
  }

  /**
   * Arrow down until the summary panel stops reporting clipped content below.
   *
   * Closed-loop rather than a fixed press count: how far the panel scrolls
   * depends on how many skills and agents the run selected and on the terminal
   * height, so the number of presses that reaches the bottom is not a constant.
   * Throws rather than returning short, so a caller that then asserts on the
   * bottom frame cannot mistake a half-scrolled viewport for the end of the
   * range. Each press goes through `navigateDown`, which waits for the wizard
   * footer first.
   */
  async scrollSummaryToBottom(maxAttempts = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      if (!this.getScreen().includes(STEP_TEXT.SCROLL_MORE_BELOW)) return;
      await this.navigateDown();
    }
    throw new Error(
      `scrollSummaryToBottom: summary still reports clipped content below after ` +
        `${maxAttempts} presses.\nScreen:\n${this.getScreen()}`,
    );
  }

  /** Go back from confirm step (Escape). */
  async goBack(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressEscape();
  }

  /** Go back from confirm step to agents step (Escape + wait). */
  async goBackToAgents(): Promise<import("./agents-step.js").AgentsStep> {
    const { AgentsStep } = await import("./agents-step.js");
    await this.waitForWizardFooter();
    await this.pressEscape();
    await this.screen.waitForText(STEP_TEXT.AGENTS, TIMEOUTS.WIZARD_LOAD);
    return new AgentsStep(this.session, this.projectDir);
  }
}
