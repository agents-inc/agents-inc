import chalk from "chalk";
import { render } from "ink-testing-library";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SelectList, type SelectListItem } from "./select-list.js";
import {
  ARROW_DOWN,
  ENTER,
  INPUT_DELAY_MS,
  RENDER_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants.js";

const ESCAPE = "\u001B";
const KEY_J = "j";

/** chalk's level for 24-bit colour, so a frame carries the colour a terminal would show. */
const TRUE_COLOR = 3;

const THREE_ITEMS: readonly SelectListItem<string>[] = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
  { value: "gamma", label: "Gamma" },
];

const OTHER_ITEMS: readonly SelectListItem<string>[] = [
  { value: "delta", label: "Delta" },
  { value: "epsilon", label: "Epsilon" },
];

describe("SelectList", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function rendered(element: React.ReactElement) {
    const view = render(element);
    cleanup = view.unmount;
    await delay(RENDER_DELAY_MS);

    const press = async (...keys: string[]): Promise<string | undefined> => {
      for (const key of keys) {
        view.stdin.write(key);
        await delay(INPUT_DELAY_MS);
      }
      return view.lastFrame();
    };
    return { ...view, press };
  }

  it("marks the first item focused and the others not", async () => {
    const { lastFrame } = await rendered(<SelectList items={THREE_ITEMS} onSelect={vi.fn()} />);

    expect(lastFrame()).toBe("❯ Alpha\n  Beta\n  Gamma");
  });

  it("moves the focus with the arrow keys and selects the focused item on enter", async () => {
    const onSelect = vi.fn();
    const { press } = await rendered(<SelectList items={THREE_ITEMS} onSelect={onSelect} />);

    expect(await press(ARROW_DOWN)).toBe("  Alpha\n❯ Beta\n  Gamma");
    await press(ENTER);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith("beta");
  });

  it("does not move with j, the vim key", async () => {
    const { press } = await rendered(<SelectList items={THREE_ITEMS} onSelect={vi.fn()} />);

    expect(await press(KEY_J)).toBe("❯ Alpha\n  Beta\n  Gamma");
  });

  it("cancels on escape, selecting nothing", async () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const { press } = await rendered(
      <SelectList items={THREE_ITEMS} onSelect={onSelect} onCancel={onCancel} />,
    );

    await press(ESCAPE);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("listens to no key while inactive", async () => {
    const onSelect = vi.fn();
    const { press } = await rendered(
      <SelectList items={THREE_ITEMS} onSelect={onSelect} active={false} />,
    );

    expect(await press(ARROW_DOWN, ENTER)).toBe("❯ Alpha\n  Beta\n  Gamma");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("selects from the items and with the handler it was last given", async () => {
    const firstOnSelect = vi.fn();
    const newestOnSelect = vi.fn();
    const { press, rerender } = await rendered(
      <SelectList items={THREE_ITEMS} onSelect={firstOnSelect} />,
    );

    rerender(<SelectList items={OTHER_ITEMS} onSelect={newestOnSelect} />);
    await press(ENTER);

    expect(newestOnSelect).toHaveBeenCalledExactlyOnceWith("delta");
    expect(firstOnSelect).not.toHaveBeenCalled();
  });

  it("shows the focused row, marker and label, bold and in the primary colour", async () => {
    const levelBefore = chalk.level;
    chalk.level = TRUE_COLOR;
    try {
      const { lastFrame } = await rendered(<SelectList items={OTHER_ITEMS} onSelect={vi.fn()} />);

      expect(lastFrame()).toBe(
        "\u001B[1m\u001B[38;2;153;255;255m❯ Delta\u001B[39m\u001B[22m\n  Epsilon",
      );
    } finally {
      chalk.level = levelBefore;
    }
  });
});
