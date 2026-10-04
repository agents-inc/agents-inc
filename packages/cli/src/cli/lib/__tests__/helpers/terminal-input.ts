import { Socket } from "node:net";
import { afterEach, beforeEach, vi, type MockInstance } from "vitest";

/** A terminal's input side: a socket that is a TTY and remembers the mode it was last put in. */
class TerminalInput extends Socket {
  readonly fd = 0;
  isTTY = true;
  isRaw = false;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

/**
 * Registers a `beforeEach` that puts a fresh, cooked {@link TerminalInput} in place of
 * `process.stdin`, and an `afterEach` that puts the runner's own back. Returns a live record of
 * the input standing in, so a test can read the mode it was left in or type into it.
 *
 * For a spec that means "a person is at a terminal". Setting `process.stdin.isTTY` says so for
 * half the terminal only: vitest forks its workers with stdin on a pipe, which has no
 * `setRawMode`, and a prompt puts the terminal into raw mode before it paints — so a spec that
 * reached one died on a TypeError from inside the command.
 *
 * Call once at the top of a file or a describe block. Only restores the spy it created — unlike
 * `vi.restoreAllMocks()`, it leaves unrelated spies untouched.
 */
export function standAtTerminal(): { input: TerminalInput } {
  const terminal = { input: new TerminalInput() };
  let stdin: MockInstance | undefined;

  beforeEach(() => {
    terminal.input = new TerminalInput();
    stdin = vi.spyOn(process, "stdin", "get").mockReturnValue(terminal.input);
  });

  afterEach(() => {
    stdin?.mockRestore();
    terminal.input.destroy();
  });

  return terminal;
}
