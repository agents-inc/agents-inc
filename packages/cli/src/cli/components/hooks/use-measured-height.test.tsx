import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMeasuredHeight } from "./use-measured-height.js";
import { render as renderToTerminal } from "../render.js";
import { RENDER_DELAY_MS, SETTLE_TIMEOUT_MS, delay } from "../../lib/__tests__/test-constants.js";

/** One line reports the measurement; the measured box fills the rest of `height`. */
const MeasuredFill: React.FC<{ height: number }> = ({ height }) => {
  const { ref, measuredHeight } = useMeasuredHeight();
  return (
    <Box flexDirection="column" height={height}>
      <Text>{`measured ${measuredHeight}`}</Text>
      <Box ref={ref} flexGrow={1}>
        <Text>filled</Text>
      </Box>
    </Box>
  );
};

/** Thirty words: two lines at 100 columns, four at 40, so narrowing the terminal grows the box. */
const WRAPPING_WORDS = Array.from({ length: 30 }, () => "word").join(" ");

const MeasuredWrap: React.FC = () => {
  const { ref, measuredHeight } = useMeasuredHeight();
  return (
    <Box flexDirection="column">
      <Text>{`measured ${measuredHeight}`}</Text>
      <Box ref={ref}>
        <Text>{WRAPPING_WORDS}</Text>
      </Box>
    </Box>
  );
};

const RESIZE = "resize";

describe("useMeasuredHeight", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("answers 0 before the first layout, then the height the box was given", async () => {
    const { lastFrame, unmount } = render(<MeasuredFill height={6} />);
    cleanup = unmount;

    expect(lastFrame()).toContain("measured 0");
    await vi.waitFor(() => expect(lastFrame()).toContain("measured 5"), SETTLE_TIMEOUT_MS);
  });

  it("measures again when a re-render changes the layout", async () => {
    const { lastFrame, rerender, unmount } = render(<MeasuredFill height={6} />);
    cleanup = unmount;
    // Past the mount's retries, so only the re-render can measure again.
    await delay(RENDER_DELAY_MS);

    rerender(<MeasuredFill height={9} />);

    await vi.waitFor(() => expect(lastFrame()).toContain("measured 8"), SETTLE_TIMEOUT_MS);
  });

  it("leaves no resize listener on the terminal once unmounted", async () => {
    const { stdout, unmount } = render(<MeasuredFill height={6} />);
    await delay(RENDER_DELAY_MS);

    unmount();
    await delay(RENDER_DELAY_MS);

    expect(stdout.listeners(RESIZE)).toStrictEqual([]);
  });
});

/**
 * A resize re-lays the content out without re-rendering it, so only the hook can see the new height.
 * stdout is made a TTY because Ink follows a resize only when it paints interactively.
 */
describe("useMeasuredHeight on a terminal that is resized", () => {
  const WIDE_COLUMNS = 100;
  const NARROW_COLUMNS = 40;
  const TERMINAL_ROWS = 24;
  let painted: string;
  let stdoutWasTty: boolean;
  let stdoutColumns: number;
  let stdoutRows: number;

  beforeEach(() => {
    painted = "";
    stdoutWasTty = process.stdout.isTTY;
    stdoutColumns = process.stdout.columns;
    stdoutRows = process.stdout.rows;
    process.stdout.isTTY = true;
    process.stdout.columns = WIDE_COLUMNS;
    process.stdout.rows = TERMINAL_ROWS;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk, ...rest: unknown[]) => {
      painted += String(chunk);
      const onWritten = rest.find((argument) => typeof argument === "function");
      if (onWritten !== undefined) queueMicrotask(() => onWritten());
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.stdout.isTTY = stdoutWasTty;
    process.stdout.columns = stdoutColumns;
    process.stdout.rows = stdoutRows;
  });

  it("measures again when narrowing the terminal wraps the content onto more lines", async () => {
    const { unmount } = renderToTerminal(<MeasuredWrap />);
    try {
      // Past the mount's retries, so only the resize can measure again.
      await delay(RENDER_DELAY_MS);
      await vi.waitFor(
        () =>
          expect(painted, "the wide terminal must hold the words on two lines").toContain(
            "measured 2",
          ),
        SETTLE_TIMEOUT_MS,
      );

      process.stdout.columns = NARROW_COLUMNS;
      process.stdout.emit(RESIZE);

      await vi.waitFor(() => expect(painted).toContain("measured 4"), SETTLE_TIMEOUT_MS);
    } finally {
      unmount();
    }
  });
});
