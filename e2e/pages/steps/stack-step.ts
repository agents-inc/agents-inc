import { BaseStep } from "../base-step.js";
import { STEP_TEXT } from "../constants.js";
import { DomainStep } from "./domain-step.js";

export class StackStep extends BaseStep {
  /** Wait for the stack step to be ready. */
  async waitForReady(timeout?: number): Promise<void> {
    await this.waitForStep(STEP_TEXT.STACK, timeout);
    await this.waitForWizardFooter(timeout);
  }

  /** Select the first stack in the list (Enter on default selection). */
  async selectFirstStack(): Promise<DomainStep> {
    // Cursor-anchored Enter: "Select domains" is printed by the domain step's
    // first frame. waitForText on scrollback is unreliable here — under
    // contention an earlier redraw of this very step may have left residue,
    // or the keystroke may be dropped if useInput on the next step is not yet
    // mounted. See base-step.pressEnterAndWaitFor for the retry semantics.
    await this.pressEnterAndWaitFor(STEP_TEXT.DOMAINS);
    return new DomainStep(this.session, this.projectDir);
  }

  /** Select a stack by name. Scrolls cursor to it, then presses Enter. */
  async selectStack(stackName: string): Promise<DomainStep> {
    await this.navigateCursorToItem(stackName);
    await this.pressEnterAndWaitFor(STEP_TEXT.DOMAINS);
    return new DomainStep(this.session, this.projectDir);
  }

  /** Select "Start from scratch" option by scrolling until the cursor is on it. */
  async selectScratch(): Promise<DomainStep> {
    await this.navigateCursorToItem(STEP_TEXT.START_FROM_SCRATCH);
    await this.pressEnterAndWaitFor(STEP_TEXT.DOMAINS);
    return new DomainStep(this.session, this.projectDir);
  }

  /** Cancel the wizard from the stack step (Escape). */
  async cancel(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressEscape();
  }
}
