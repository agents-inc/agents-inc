import { pollUntil } from "../helpers/test-utils.js";
import type { TerminalSession } from "../helpers/terminal-session.js";

export class TerminalScreen {
  constructor(private session: TerminalSession) {}

  /** Auto-retrying wait for text in the full output (xterm buffer). */
  async waitForText(text: string, timeoutMs: number): Promise<void> {
    await pollUntil(
      () => this.session.getFullOutput().includes(text),
      timeoutMs,
      () =>
        new Error(
          `TerminalScreen: timeout waiting for "${text}" after ${timeoutMs}ms.\n` +
            `Screen:\n${this.session.getScreen()}\n` +
            `Full output:\n${this.session.getFullOutput()}`,
        ),
    );
  }

  /**
   * Auto-retrying wait for text appearing AFTER the given RAW-output cursor.
   * Needed for closed-loop retry: xterm's processed buffer is not append-only
   * (Ink rewrites lines in place), so cursoring it is unreliable. Raw output
   * IS append-only, so callers capture `getRawCursor()` before the action and
   * assert on post-cursor raw output.
   */
  async waitForTextAfter(text: string, cursor: number, timeoutMs: number): Promise<void> {
    await pollUntil(
      () => this.session.getRawOutput().slice(cursor).includes(text),
      timeoutMs,
      () =>
        new Error(
          `TerminalScreen: timeout waiting for "${text}" after raw cursor ${cursor} ` +
            `within ${timeoutMs}ms.\n` +
            `Screen:\n${this.session.getScreen()}\n` +
            `Post-cursor raw tail:\n${this.session.getRawOutput().slice(cursor).slice(-2000)}`,
        ),
    );
  }

  /** Captures the current raw-output length for use as a cursor in waitForTextAfter. */
  getRawCursor(): number {
    return this.session.getRawOutput().length;
  }

  /** Auto-retrying wait for text in raw PTY output (no xterm processing). */
  async waitForRawText(text: string, timeoutMs: number): Promise<void> {
    await pollUntil(
      () => this.session.getRawOutput().includes(text),
      timeoutMs,
      () =>
        new Error(
          `TerminalScreen: timeout waiting for "${text}" in raw output after ${timeoutMs}ms.\n` +
            `Raw output tail:\n${this.session.getRawOutput().slice(-2000)}`,
        ),
    );
  }

  /** Auto-retrying wait for either of two texts in the full output. */
  async waitForEither(textA: string, textB: string, timeoutMs: number): Promise<void> {
    await pollUntil(
      () =>
        this.session.getFullOutput().includes(textA) ||
        this.session.getFullOutput().includes(textB),
      timeoutMs,
      () =>
        new Error(
          `TerminalScreen: timeout waiting for "${textA}" or "${textB}" after ${timeoutMs}ms.\n` +
            `Screen:\n${this.session.getScreen()}\n` +
            `Full output:\n${this.session.getFullOutput()}`,
        ),
    );
  }

  /** Wait for the wizard footer ("select") to render, indicating stable layout. */
  async waitForStableRender(timeoutMs: number): Promise<void> {
    await this.waitForText("select", timeoutMs);
  }

  /**
   * Cursor-anchored version of waitForStableRender. Waits for the wizard
   * footer ("select") to appear in raw output AFTER the given cursor.
   *
   * Use this when a previous wizard step already printed "select" into
   * scrollback — the non-anchored variant would return instantly on the
   * stale residue, masking the fact that the next frame has not rendered.
   */
  async waitForStableRenderAfter(cursor: number, timeoutMs: number): Promise<void> {
    await this.waitForTextAfter("select", cursor, timeoutMs);
  }

  /** Get the current visible screen (viewport only). */
  getScreen(): string {
    return this.session.getScreen();
  }

  /** Get all output including scrollback. */
  getFullOutput(): string {
    return this.session.getFullOutput();
  }

  /** Get raw PTY output with ANSI stripped. */
  getRawOutput(): string {
    return this.session.getRawOutput();
  }
}
