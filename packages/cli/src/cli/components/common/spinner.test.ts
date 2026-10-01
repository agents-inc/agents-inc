import { Terminal } from "@xterm/headless";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { awaitUnderSpinner } from "./spinner";

/**
 * The spinner's hand-off, watched on a terminal emulator: whatever the spinner drew must be gone,
 * and the cursor back where the spinner started, by the time the await returns — because the next
 * thing `init` and `edit` render is a wizard sized to the terminal's full height, and one line
 * left above it pushes the wizard's top line off the screen.
 *
 * **The race these specs hold still.** Ink paints through a render throttle (32ms at its default
 * 30fps). A spinner frame that arrives inside that window is held, not painted, and `unmount()`
 * paints whatever is held. A spinner cleared with a frame held is therefore drawn again AFTER the
 * clear, and nothing erases it. The spinner's frames are 80ms apart, so on an idle machine a frame
 * almost never lands inside the window; on a starved one a tick that runs late is followed by the
 * next one sooner than the window closes, which is how it surfaced — in full e2e runs only. Here the
 * spinner's clock is advanced twice back to back, so the second frame lands in the window the first
 * one opened, every time: while the load is still running, and while the frame Ink held is being
 * painted.
 *
 * `process.stdout` stands in as the terminal because it is where the commands render: it is made a
 * TTY for the duration, so Ink paints frames as it does for a person, and everything written to
 * it is fed to the emulator rather than printed.
 */

const TERMINAL_COLUMNS = 80;
const TERMINAL_ROWS = 24;
const LABEL = "Loading the fixture catalogue...";

describe("awaitUnderSpinner", () => {
  let terminal: Terminal;
  let stdoutWasTty: boolean;
  let stdoutColumns: number;
  let stdoutRows: number;
  /** Runs, once armed, whenever Ink writes and waits to hear the write has landed. */
  let whileInkAwaitsAWrite: (() => void) | undefined;

  /** Resolves once the emulator has parsed everything written so far. */
  const painted = () => new Promise<void>((resolve) => terminal.write("", resolve));

  const screenRow = (row: number): string => {
    const line = terminal.buffer.active.getLine(row);
    if (line === undefined) throw new Error(`the emulator has no row ${row}`);
    return line.translateToString(true);
  };

  /** Two spinner frames with no time between them: the second is held by Ink's render throttle. */
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
      // Painting what Ink holds means waiting on the terminal, and a spinner still ticking fills
      // the throttle window again in that wait.
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
