import { Terminal } from "@xterm/headless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { awaitUnderSpinner } from "./spinner";

/**
 * Two spinner frames back to back put the second inside Ink's render throttle, where `unmount()`
 * would repaint it after the clear. stdout is made a TTY and fed to a terminal emulator.
 */

const TERMINAL_COLUMNS = 80;
const TERMINAL_ROWS = 24;
const LABEL = "Loading the fixture catalogue...";

describe("awaitUnderSpinner", () => {
  let terminal: Terminal;
  let stdoutWasTty: boolean;
  let stdoutColumns: number;
  let stdoutRows: number;
  let whileInkAwaitsAWrite: (() => void) | undefined;

  const painted = () => new Promise<void>((resolve) => terminal.write("", resolve));

  const screenRow = (row: number): string => {
    const line = terminal.buffer.active.getLine(row);
    if (line === undefined) throw new Error(`the emulator has no row ${row}`);
    return line.translateToString(true);
  };

  const advanceTwoFramesAtOnce = async () => {
    await vi.advanceTimersToNextTimerAsync();
    await vi.advanceTimersToNextTimerAsync();
  };

  beforeEach(() => {
    terminal = new Terminal({
      cols: TERMINAL_COLUMNS,
      rows: TERMINAL_ROWS,
      allowProposedApi: true,
    });
    stdoutWasTty = process.stdout.isTTY;
    stdoutColumns = process.stdout.columns;
    stdoutRows = process.stdout.rows;
    process.stdout.isTTY = true;
    process.stdout.columns = TERMINAL_COLUMNS;
    process.stdout.rows = TERMINAL_ROWS;
    whileInkAwaitsAWrite = undefined;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
      const onWritten = rest.find((argument) => typeof argument === "function");
      if (onWritten !== undefined) whileInkAwaitsAWrite?.();
      terminal.write(chunk, () => onWritten?.());
      return true;
    });
    // The spinner's clock only: Ink's render throttle keeps real time, which is the point.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    process.stdout.isTTY = stdoutWasTty;
    process.stdout.columns = stdoutColumns;
    process.stdout.rows = stdoutRows;
    terminal.dispose();
  });

  it("leaves a blank screen when a spinner frame is still held as the load finishes", async () => {
    const loaded = await awaitUnderSpinner(LABEL, async () => {
      await painted();
      expect(
        screenRow(0),
        "the spinner must be on screen for its removal to mean anything",
      ).toContain(LABEL);
      await advanceTwoFramesAtOnce();
      return "loaded";
    });
    await painted();

    expect(loaded).toBe("loaded");
    expect(screenRow(0), "no spinner frame may survive the hand-off").toBe("");
    expect(screenRow(1)).toBe("");
    expect(
      terminal.buffer.active.cursorY,
      "the next render must start on the row the spinner started on",
    ).toBe(0);
  });

  it("leaves a blank screen when spinner frames keep arriving while the held one is painted", async () => {
    await awaitUnderSpinner(LABEL, async () => {
      await painted();
      expect(
        screenRow(0),
        "the spinner must be on screen for its removal to mean anything",
      ).toContain(LABEL);
      // A spinner still ticking refills the throttle window while the held frame is painted.
      whileInkAwaitsAWrite = () => {
        vi.advanceTimersToNextTimer();
        vi.advanceTimersToNextTimer();
      };
    });
    await painted();

    expect(screenRow(0), "no spinner frame may survive the hand-off").toBe("");
    expect(screenRow(1)).toBe("");
    expect(terminal.buffer.active.cursorY).toBe(0);
  });

  it("leaves a blank screen when the load refuses the run with a spinner frame still held", async () => {
    const refusal = new Error("the source cannot be loaded");

    const outcome = awaitUnderSpinner(LABEL, async () => {
      await painted();
      expect(
        screenRow(0),
        "the spinner must be on screen for its removal to mean anything",
      ).toContain(LABEL);
      await advanceTwoFramesAtOnce();
      throw refusal;
    });

    await expect(outcome, "the refusal reaches the caller untouched").rejects.toBe(refusal);
    await painted();
    expect(screenRow(0), "no spinner frame may sit above the refusal").toBe("");
    expect(screenRow(1)).toBe("");
    expect(terminal.buffer.active.cursorY).toBe(0);
  });
});
