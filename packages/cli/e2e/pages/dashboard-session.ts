import { TerminalSession } from "../helpers/terminal-session.js";
import { delay } from "../helpers/test-utils.js";
import { INTERNAL_DELAYS, INTERNAL_RETRIES, KEYS } from "./constants.js";
import { TerminalScreen } from "./terminal-screen.js";

type DashboardLaunchOptions = {
  projectDir: string;
  /** Launch with no command at all — the dashboard the `init` hook shows, rather than `init`'s. */
  bare?: boolean;
  env?: Record<string, string | undefined>;
};

/** The dashboard a bare `init` (or a bare run) shows over an existing installation. */
export class DashboardSession {
  private screen: TerminalScreen;

  private constructor(
    private session: TerminalSession,
    readonly projectDir: string,
  ) {
    this.screen = new TerminalScreen(session);
  }

  /** Launch over an existing installation. The caller checks output and presses keys. */
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

  /** Wait for specific text to appear. */
  async waitForText(text: string, timeoutMs: number): Promise<void> {
    await this.screen.waitForText(text, timeoutMs);
  }

  /** Wait for whichever of two texts appears first — for a spec that must say which one it was. */
  async waitForEither(textA: string, textB: string, timeoutMs: number): Promise<void> {
    await this.screen.waitForEither(textA, textB, timeoutMs);
  }

  /** Get the full output. */
  getOutput(): string {
    return this.screen.getFullOutput();
  }

  /** Get the visible screen. */
  getScreen(): string {
    return this.screen.getScreen();
  }

  /**
   * Press Escape (with delay for PTY processing), like the navigation methods below.
   * Async because a bare synchronous write races the handler the current frame
   * registered — the same reason `arrowDown`/`arrowUp` carry the delay.
   */
  async escape(): Promise<void> {
    this.session.escape();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  /** Press Ctrl+C (with delay for PTY processing). */
  async ctrlC(): Promise<void> {
    this.session.ctrlC();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  /** Navigate down (with delay for PTY processing). */
  async arrowDown(): Promise<void> {
    this.session.arrowDown();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  /**
   * Move down `downs` options and press Enter in ONE write — the way a fast typist's keys or a
   * paste reach the terminal — so the CLI reads them as one chunk, with no frame painted between
   * them. Every other key method here writes a single key and waits.
   */
  async chooseInOneBurst(downs: number): Promise<void> {
    this.session.write(KEYS.ARROW_DOWN.repeat(downs) + KEYS.ENTER);
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  /**
   * Move down `downs` options one key at a time, then press Enter once `focusedRow` is on screen —
   * the paced counterpart of {@link chooseInOneBurst}, for a spec whose subject is what the run
   * does AFTER the choice and so must not also rest on the dashboard reading a burst. A frame that
   * moved the focus is one whose key handler is mounted, which is what makes a single Enter safe.
   */
  async chooseOneKeyAtATime(downs: number, focusedRow: string): Promise<void> {
    for (let pressed = 0; pressed < downs; pressed++) {
      await this.arrowDown();
    }
    await this.screen.waitForText(focusedRow, INTERNAL_RETRIES.INTERVAL_MS);
    this.session.enter();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  /** Navigate up (with delay for PTY processing). */
  async arrowUp(): Promise<void> {
    this.session.arrowUp();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  /** Wait for exit. */
  async waitForExit(timeoutMs?: number): Promise<number> {
    return this.session.waitForExit(timeoutMs);
  }

  /** Destroy the session. */
  async destroy(): Promise<void> {
    await this.session.destroy();
  }
}
