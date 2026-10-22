import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearTerminalScreen,
  formatTerminalTooSmallMessage,
  isTerminalLargeEnough,
} from "./terminal.js";

/** The smallest terminal the CLI draws in, written out rather than read off the product. */
const MIN_COLUMNS = 80;
const MIN_ROWS = 20;

describe("isTerminalLargeEnough", () => {
  it("takes a terminal exactly the minimum size, and refuses one a column or a row short", () => {
    expect(isTerminalLargeEnough(MIN_COLUMNS, MIN_ROWS)).toBe(true);
    expect(isTerminalLargeEnough(MIN_COLUMNS - 1, MIN_ROWS)).toBe(false);
    expect(isTerminalLargeEnough(MIN_COLUMNS, MIN_ROWS - 1)).toBe(false);
  });
});

describe("formatTerminalTooSmallMessage", () => {
  it("reports a terminal a column short as too narrow", () => {
    expect(formatTerminalTooSmallMessage(MIN_COLUMNS - 1)).toBe(
      "Terminal too narrow (need 80). Please resize.",
    );
  });

  it("reports a terminal wide enough as too short", () => {
    expect(formatTerminalTooSmallMessage(MIN_COLUMNS)).toBe(
      "Terminal too short (need 20). Please resize.",
    );
  });
});

describe("clearTerminalScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("homes the cursor and clears the screen and its scrollback", () => {
    let written = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      written += String(chunk);
      return true;
    });

    clearTerminalScreen();

    expect(written).toBe("\u001B[H\u001B[2J\u001B[3J");
  });
});
