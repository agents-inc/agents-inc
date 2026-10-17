import { TerminalSession } from "../helpers/terminal-session.js";
import { delay } from "../helpers/test-utils.js";
import { INTERNAL_DELAYS, INTERNAL_RETRIES, KEYS } from "./constants.js";
import { TerminalScreen } from "./terminal-screen.js";

type DashboardLaunchOptions = {
  projectDir: string;
  /** No command at all: the dashboard the `init` hook shows. */
  bare?: boolean;
  env?: Record<string, string | undefined>;
};

export class DashboardSession {
  private screen: TerminalScreen;

  private constructor(
    private session: TerminalSession,
    readonly projectDir: string,
  ) {
    this.screen = new TerminalScreen(session);
  }

  static async launch({
    projectDir,
    bare,
    env,
  }: DashboardLaunchOptions): Promise<DashboardSession> {
    const session = new TerminalSession(bare ? [] : ["init"], projectDir, {
      env: { CC_MARKETPLACE: undefined, ...env },
    });

    return new DashboardSession(session, projectDir);
  }

  async waitForText(text: string, timeoutMs: number): Promise<void> {
    await this.screen.waitForText(text, timeoutMs);
  }

  async waitForEither(textA: string, textB: string, timeoutMs: number): Promise<void> {
    await this.screen.waitForEither(textA, textB, timeoutMs);
  }

  getOutput(): string {
    return this.screen.getFullOutput();
  }

  getScreen(): string {
    return this.screen.getScreen();
  }

  // Delayed, like every key here: a bare write races the handler the current frame registered.
  async escape(): Promise<void> {
    this.session.escape();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  async ctrlC(): Promise<void> {
    this.session.ctrlC();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  async arrowDown(): Promise<void> {
    this.session.arrowDown();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  // One write, as a paste or fast typist delivers it, so no frame paints between the keys.
  async chooseInOneBurst(downs: number): Promise<void> {
    this.session.write(KEYS.ARROW_DOWN.repeat(downs) + KEYS.ENTER);
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  // Paced: Enter only once `focusedRow` shows, i.e. the frame's key handler is mounted.
  async chooseOneKeyAtATime(downs: number, focusedRow: string): Promise<void> {
    for (let pressed = 0; pressed < downs; pressed++) {
      await this.arrowDown();
    }
    await this.screen.waitForText(focusedRow, INTERNAL_RETRIES.INTERVAL_MS);
    this.session.enter();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  async arrowUp(): Promise<void> {
    this.session.arrowUp();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  async waitForExit(timeoutMs?: number): Promise<number> {
    return this.session.waitForExit(timeoutMs);
  }

  async destroy(): Promise<void> {
    await this.session.destroy();
  }
}
