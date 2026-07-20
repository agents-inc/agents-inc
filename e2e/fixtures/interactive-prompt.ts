import { TerminalSession } from "../helpers/terminal-session.js";
import { delay } from "../helpers/test-utils.js";
import { TerminalScreen } from "../pages/terminal-screen.js";
import { TIMEOUTS, INTERNAL_DELAYS } from "../pages/constants.js";

/**
 * Page object for non-wizard interactive prompts (uninstall confirmation,
 * update confirmation, search UI).
 *
 * Wraps TerminalSession + TerminalScreen so test files do NOT import
 * TerminalSession directly.
 */
export class InteractivePrompt {
  private session: TerminalSession;
  private screen: TerminalScreen;

  constructor(
    args: string[],
    cwd: string,
    options?: {
      cols?: number;
      rows?: number;
      env?: Record<string, string | undefined>;
    },
  ) {
    this.session = new TerminalSession(args, cwd, options);
    this.screen = new TerminalScreen(this.session);
  }

  async waitForText(text: string, timeoutMs: number = TIMEOUTS.WIZARD_LOAD): Promise<void> {
    await this.screen.waitForText(text, timeoutMs);
  }

  async waitForRawText(text: string, timeoutMs: number = TIMEOUTS.WIZARD_LOAD): Promise<void> {
    await this.screen.waitForRawText(text, timeoutMs);
  }

  async confirm(): Promise<void> {
    this.session.write("y");
    await delay(INTERNAL_DELAYS.KEYSTROKE);
    this.session.enter();
    await delay(INTERNAL_DELAYS.STEP_TRANSITION);
  }

  async deny(): Promise<void> {
    this.session.write("n");
    await delay(INTERNAL_DELAYS.KEYSTROKE);
    this.session.enter();
    await delay(INTERNAL_DELAYS.STEP_TRANSITION);
  }

  async pressEnter(): Promise<void> {
    this.session.enter();
    await delay(INTERNAL_DELAYS.STEP_TRANSITION);
  }

  async arrowDown(): Promise<void> {
    this.session.arrowDown();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  async arrowUp(): Promise<void> {
    this.session.arrowUp();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  async pressKey(key: string): Promise<void> {
    this.session.write(key);
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  async ctrlC(): Promise<void> {
    this.session.ctrlC();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  async escape(): Promise<void> {
    this.session.escape();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  async waitForExit(timeoutMs: number = TIMEOUTS.EXIT): Promise<number> {
    return this.session.waitForExit(timeoutMs);
  }

  getOutput(): string {
    return this.session.getFullOutput();
  }

  getScreen(): string {
    return this.session.getScreen();
  }

  getRawOutput(): string {
    return this.session.getRawOutput();
  }

  async destroy(): Promise<void> {
    await this.session.destroy();
  }
}
