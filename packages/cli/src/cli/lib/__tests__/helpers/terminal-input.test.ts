import { describe, expect, it } from "vitest";

import { printAtWidth, standAtTerminal } from "./terminal-input.js";

const RUNNER_STDIN = process.stdin;

describe("standAtTerminal", () => {
  const terminal = standAtTerminal();

  it("stands a terminal in for stdin, cooked until something puts it into raw mode", () => {
    expect(process.stdin).toBe(terminal.input);
    expect(process.stdin.isTTY).toBe(true);
    expect(terminal.input.isRaw).toBe(false);

    process.stdin.setRawMode(true);

    expect(terminal.input.isRaw, "the mode a prompt set must be readable afterwards").toBe(true);
  });

  it("hands each test a fresh terminal, whatever the last one was left in", () => {
    expect(terminal.input.isRaw).toBe(false);
  });
});

// Outside the block above, so its hooks don't run here.
describe("after standAtTerminal's tests", () => {
  it("puts the runner's own stdin back", () => {
    expect(process.stdin).toBe(RUNNER_STDIN);
  });
});

const A_WIDTH = 140;

describe("printAtWidth", () => {
  printAtWidth(A_WIDTH);

  it("has stdout report the width it was given", () => {
    expect(process.stdout.columns).toBe(A_WIDTH);
  });
});

// Outside the block above, so its hooks don't run here.
describe("after printAtWidth's tests", () => {
  it("leaves stdout reporting no width, as a pipe does", () => {
    expect(process.stdout.columns).toBeUndefined();
  });
});
