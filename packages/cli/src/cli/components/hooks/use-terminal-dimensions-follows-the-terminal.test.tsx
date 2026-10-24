import { Text } from "ink";
import { render } from "ink-testing-library";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useTerminalDimensions } from "./use-terminal-dimensions.js";
import { RENDER_DELAY_MS, delay } from "../../lib/__tests__/test-constants.js";

/** A resize re-renders through React's scheduler, which a busy worker starts late. */
const SETTLE_TIMEOUT_MS = 5_000;

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

  function resizedTo(
    view: ReturnType<typeof rendered>,
    size: { columns: number | undefined; rows: number | undefined },
  ): ReturnType<typeof rendered> {
    Object.defineProperty(view.stdout, "columns", { value: size.columns, configurable: true });
    Object.defineProperty(view.stdout, "rows", { value: size.rows, configurable: true });
    view.stdout.emit("resize");
    return view;
  }

  it("reports the stream's columns, and the default rows where it reports none", () => {
    expect(rendered().lastFrame()).toBe("100x24");
  });

  it("follows a resize", async () => {
    const view = resizedTo(rendered(), { columns: 60, rows: 30 });

    await vi.waitFor(() => expect(view.lastFrame()).toBe("60x30"), SETTLE_TIMEOUT_MS);
  });

  it("falls back to the defaults when a resized stream reports no size", async () => {
    const view = resizedTo(rendered(), { columns: 0, rows: undefined });

    await vi.waitFor(() => expect(view.lastFrame()).toBe("80x24"), SETTLE_TIMEOUT_MS);
  });

  it("leaves no resize listener on the stream once unmounted", async () => {
    const { stdout, unmount } = render(<DimensionsShown />);
    await delay(RENDER_DELAY_MS);

    unmount();
    await delay(RENDER_DELAY_MS);

    expect(stdout.listeners("resize")).toStrictEqual([]);
  });
});
