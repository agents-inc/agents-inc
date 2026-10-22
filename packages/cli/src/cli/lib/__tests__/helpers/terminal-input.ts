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

/**
 * Gives stdout a width for each test: a spec's piped stdout reports none, so output drawn to the
 * terminal's width (the summary panel) draws at its default without it.
 */
export function printAtWidth(columns: number): void {
  beforeEach(() => {
    Object.defineProperty(process.stdout, "columns", { value: columns, configurable: true });
  });

  afterEach(() => {
    Reflect.deleteProperty(process.stdout, "columns");
  });
}
