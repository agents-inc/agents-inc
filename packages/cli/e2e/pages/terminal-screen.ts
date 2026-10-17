import { pollUntil } from "../helpers/test-utils.js";
import type { TerminalSession } from "../helpers/terminal-session.js";

// oclif's unknown-flag refusal: the session has exited, so waits fail fast instead of timing out.
const PARSE_REFUSAL = "Nonexistent flag";

export class TerminalScreen {
  constructor(private session: TerminalSession) {}

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

  // Scrollback plus viewport: sound for presence assertions, unsound for absence.
  getScreen(): string {
    return this.session.getScreen();
  }

  getFullOutput(): string {
    return this.session.getFullOutput();
  }

  getRawOutput(): string {
    return this.session.getRawOutput();
  }
}
