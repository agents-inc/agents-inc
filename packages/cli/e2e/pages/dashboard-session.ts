import type { TerminalSession } from "../helpers/terminal-session.js";
import { cleanupTempDir, delay } from "../helpers/test-utils.js";
import { INTERNAL_DELAYS, INTERNAL_RETRIES, STEP_TEXT } from "./constants.js";
import { retryEnterUntil } from "./retry-enter.js";
import { BuildStep } from "./steps/build-step.js";
import { TerminalScreen } from "./terminal-screen.js";

/**
 * A wrapper for the dashboard mode of init (when project is already initialized).
 * The dashboard is NOT a wizard flow, so it has a simpler API.
 */
export class DashboardSession {
  private screen: TerminalScreen;

  constructor(
    private session: TerminalSession,
    readonly projectDir: string,
    private cleanupDirs: string[],
  ) {
    this.screen = new TerminalScreen(session);
  }

  /** Wait for specific text to appear. */
  async waitForText(text: string, timeoutMs: number): Promise<void> {
    await this.screen.waitForText(text, timeoutMs);
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

  /** Navigate up (with delay for PTY processing). */
  async arrowUp(): Promise<void> {
    this.session.arrowUp();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
  }

  /**
   * Press Enter on the currently focused dashboard option (with closed-loop
   * retry, see retryEnterUntil).
   * "Edit" is the default focused option (first in DASHBOARD_OPTIONS), so this
   * launches the edit wizard in the same PTY session via this.config.runCommand.
   * Waits for the edit wizard's build step to be ready and returns a BuildStep.
   * The post-condition matches EditWizard.launch's sequence: BUILD_FOOTER,
   * stable render, then BUILD.
   */
  async selectEdit(): Promise<BuildStep> {
    await retryEnterUntil(this.session, this.screen, async (cursor) => {
      await this.screen.waitForTextAfter(
        STEP_TEXT.BUILD_FOOTER,
        cursor,
        INTERNAL_RETRIES.INTERVAL_MS,
      );
      await this.screen.waitForWizardFooter(INTERNAL_RETRIES.INTERVAL_MS);
      await this.screen.waitForTextAfter(STEP_TEXT.BUILD, cursor, INTERNAL_RETRIES.INTERVAL_MS);
    });
    return new BuildStep(this.session, this.projectDir);
  }

  /** Wait for exit. */
  async waitForExit(timeoutMs?: number): Promise<number> {
    return this.session.waitForExit(timeoutMs);
  }

  /** Destroy the session and clean up temp dirs. */
  async destroy(): Promise<void> {
    await this.session.destroy();
    for (const dir of this.cleanupDirs) {
      await cleanupTempDir(dir);
    }
  }
}
