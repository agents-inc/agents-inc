import { BaseStep } from "../base-step.js";

export class SearchModal extends BaseStep {
  /** Type a search query into the modal. */
  async type(query: string): Promise<void> {
    for (const char of query) {
      await this.waitForWizardFooter();
      await this.pressKey(char);
    }
  }

  /** Select a result by label. */
  async selectResult(label: string): Promise<void> {
    await this.waitForItemVisible(label);
    await this.waitForWizardFooter();
    await this.pressEnter();
  }

  /** Close the search modal (Escape). */
  async close(): Promise<void> {
    await this.waitForWizardFooter();
    await this.pressEscape();
  }

  /** Get current search results screen. */
  getResults(): string {
    return this.screen.getScreen();
  }
}
