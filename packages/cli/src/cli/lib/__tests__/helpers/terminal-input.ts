import { Socket } from "node:net";
import { afterEach, beforeEach, vi, type MockInstance } from "vitest";

class TerminalInput extends Socket {
  readonly fd = 0;
  isTTY = true;
  isRaw = false;

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    return this;
  }
}

/** Fresh stdin TTY per test; `isTTY` alone fails, as vitest's piped stdin lacks `setRawMode`. */
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
