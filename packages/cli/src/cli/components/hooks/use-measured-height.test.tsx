import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useMeasuredHeight } from "./use-measured-height.js";
import { RENDER_DELAY_MS, delay } from "../../lib/__tests__/test-constants.js";

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
    await delay(RENDER_DELAY_MS);
    expect(lastFrame()).toContain("measured 5");
  });

  it("measures again when a re-render changes the layout", async () => {
    const { lastFrame, rerender, unmount } = render(<MeasuredFill height={6} />);
    cleanup = unmount;
    await delay(RENDER_DELAY_MS);

    rerender(<MeasuredFill height={9} />);
    await delay(RENDER_DELAY_MS);

    expect(lastFrame()).toContain("measured 8");
  });
});
