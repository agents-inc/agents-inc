import { Text } from "ink";
import { render } from "ink-testing-library";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useTerminalDimensions } from "./use-terminal-dimensions.js";
import { RENDER_DELAY_MS, delay } from "../../lib/__tests__/test-constants.js";

/** Renders the dimensions the hook reports, so a frame is its answer. */
const DimensionsShown: React.FC = () => {
  const { columns, rows } = useTerminalDimensions();
  return <Text>{`${columns}x${rows}`}</Text>;
};

/** ink-testing-library's stream reports 100 columns and no rows; a spec resizes it by hand. */
describe("useTerminalDimensions", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  function rendered() {
    const view = render(<DimensionsShown />);
    cleanup = view.unmount;
    return view;
  }

  async function resizedTo(
    view: ReturnType<typeof rendered>,
    size: { columns: number | undefined; rows: number | undefined },
  ): Promise<string | undefined> {
    Object.defineProperty(view.stdout, "columns", { value: size.columns, configurable: true });
    Object.defineProperty(view.stdout, "rows", { value: size.rows, configurable: true });
    view.stdout.emit("resize");
    await delay(RENDER_DELAY_MS);
    return view.lastFrame();
  }

  it("reports the stream's columns, and the default rows where it reports none", () => {
    expect(rendered().lastFrame()).toBe("100x24");
  });

  it("follows a resize", async () => {
    expect(await resizedTo(rendered(), { columns: 60, rows: 30 })).toBe("60x30");
  });

  it("falls back to the defaults when a resized stream reports no size", async () => {
    expect(await resizedTo(rendered(), { columns: 0, rows: undefined })).toBe("80x24");
  });
});
