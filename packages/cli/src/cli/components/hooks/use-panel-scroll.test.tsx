import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { usePanelScroll } from "./use-panel-scroll.js";
import { ScrollAffordance } from "../common/scroll-affordance.js";
import {
  ARROW_DOWN,
  ARROW_UP,
  INPUT_DELAY_MS,
  RENDER_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants.js";

const LINES = ["line 1", "line 2", "line 3", "line 4", "line 5", "line 6"] as const;

/** Laid out as SummaryPanel lays it out: a clipped viewport and the affordance beside it. */
const ScrolledLines: React.FC<{ height: number }> = ({ height }) => {
  const { viewportRef, contentRef, contentMarginTop, hiddenAbove, hiddenBelow } = usePanelScroll();
  return (
    <Box flexDirection="column" height={height}>
      <Box ref={viewportRef} flexDirection="column" flexGrow={1} flexBasis={0} overflow="hidden">
        <Box ref={contentRef} flexDirection="column" flexShrink={0} marginTop={contentMarginTop}>
          {LINES.map((line) => (
            <Text key={line}>{line}</Text>
          ))}
        </Box>
      </Box>
      <ScrollAffordance hiddenAbove={hiddenAbove} hiddenBelow={hiddenBelow} />
    </Box>
  );
};

describe("usePanelScroll", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function scrolled(height: number) {
    const view = render(<ScrolledLines height={height} />);
    cleanup = view.unmount;
    await delay(RENDER_DELAY_MS);
    return async (...keys: string[]): Promise<string | undefined> => {
      for (const key of keys) {
        view.stdin.write(key);
        await delay(INPUT_DELAY_MS);
      }
      return view.lastFrame();
    };
  }

  it("shows the top lines and counts the rest below before any key", async () => {
    const press = await scrolled(4);

    expect(await press()).toBe("line 1\nline 2\nline 3\n3 more below");
  });

  it("moves the content up a line per down arrow, counting both sides", async () => {
    const press = await scrolled(4);

    expect(await press(ARROW_DOWN, ARROW_DOWN)).toBe(
      "line 3\nline 4\nline 5\n2 more above   1 more below",
    );
  });

  it("moves it back a line per up arrow", async () => {
    const press = await scrolled(4);
    await press(ARROW_DOWN, ARROW_DOWN);

    expect(await press(ARROW_UP)).toBe("line 2\nline 3\nline 4\n1 more above   2 more below");
  });

  it("stops at the last line and at the first", async () => {
    const press = await scrolled(4);

    expect(await press(...Array.from({ length: 5 }, () => ARROW_DOWN))).toBe(
      "line 4\nline 5\nline 6\n3 more above",
    );
    expect(await press(...Array.from({ length: 6 }, () => ARROW_UP))).toBe(
      "line 1\nline 2\nline 3\n3 more below",
    );
  });
});

describe("ScrollAffordance", () => {
  /** In a column, so a line it took up while saying nothing would show as a blank one. */
  function between(hiddenAbove: number, hiddenBelow: number): string | undefined {
    const view = render(
      <Box flexDirection="column">
        <Text>above</Text>
        <ScrollAffordance hiddenAbove={hiddenAbove} hiddenBelow={hiddenBelow} />
        <Text>below</Text>
      </Box>,
    );
    const frame = view.lastFrame();
    view.unmount();
    return frame;
  }

  it("takes up no line when nothing is hidden", () => {
    expect(between(0, 0)).toBe("above\nbelow");
  });

  it("counts the lines hidden on each side it has any", () => {
    expect(between(3, 0)).toBe("above\n3 more above\nbelow");
    expect(between(0, 2)).toBe("above\n2 more below\nbelow");
  });
});
