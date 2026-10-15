import { pollUntil } from "../helpers/test-utils.js";
import type { TerminalSession } from "../helpers/terminal-session.js";

/**
 * oclif's refusal for a flag the command does not declare. A session that printed it
 * has already exited, so every wait below would burn its whole budget — 45s a piece —
 * before reporting a timeout that says nothing about the cause. Seen once, the wait
 * fails immediately and quotes the refusal instead.
 */
const PARSE_REFUSAL = "Nonexistent flag";

export class TerminalScreen {
  constructor(private session: TerminalSession) {}

  /**
   * Polls like {@link pollUntil}, but abandons the wait the moment the session shows a
   * parse refusal — a frame that will never paint is not worth waiting for.
   */
  private async waitUntil(
    isSatisfied: () => boolean,
    timeoutMs: number,
    buildTimeoutError: () => Error,
  ): Promise<void> {
    await pollUntil(
      () => {
        this.refuseOnParseError();
        return isSatisfied();
      },
      timeoutMs,
      buildTimeoutError,
    );
  }

  private refuseOnParseError(): void {
    const output = this.session.getFullOutput();
    if (!output.includes(PARSE_REFUSAL)) return;

    throw new Error(
      `TerminalScreen: the command was refused by the parser, so no frame will ever paint.\n` +
        `Output:\n${output}`,
    );
  }

  /** Auto-retrying wait for text in the full output (xterm buffer). */
  async waitForText(text: string, timeoutMs: number): Promise<void> {
    await this.waitUntil(
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

  /** Auto-retrying wait for text in raw PTY output (no xterm processing). */
  async waitForRawText(text: string, timeoutMs: number): Promise<void> {
    await this.waitUntil(
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
    await this.waitUntil(
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

  /**
   * Delegates to {@link TerminalSession.getScreen}, so it returns scrollback PLUS the viewport
   * rather than the visible area alone — safe for positive assertions about current content,
   * unsound for absence. See that method's own comment for the range and the consequence.
   */
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
