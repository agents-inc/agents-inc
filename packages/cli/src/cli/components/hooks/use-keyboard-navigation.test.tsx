import { Text } from "ink";
import { render } from "ink-testing-library";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardNavigation } from "./use-keyboard-navigation.js";
import {
  ARROW_DOWN,
  ARROW_UP,
  ENTER,
  INPUT_DELAY_MS,
  RENDER_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants.js";

const ESCAPE = "\u001B";
const KEY_J = "j";
const KEY_K = "k";
const KEY_X = "x";

type FocusShownProps = {
  itemCount: number;
  handlers?: Parameters<typeof useKeyboardNavigation>[1];
  options?: Parameters<typeof useKeyboardNavigation>[2];
};

/** Renders nothing but the index the hook reports, so a frame is the hook's answer. */
const FocusShown: React.FC<FocusShownProps> = ({ itemCount, handlers, options }) => {
  const { focusedIndex } = useKeyboardNavigation(itemCount, handlers, options);
  return <Text>{`focused ${focusedIndex}`}</Text>;
};

describe("useKeyboardNavigation", () => {
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

  it("moves the focus down and up with the arrow keys", async () => {
    const { press } = await rendered(<FocusShown itemCount={4} />);

    expect(await press(ARROW_DOWN, ARROW_DOWN)).toBe("focused 2");
    expect(await press(ARROW_UP)).toBe("focused 1");
  });

  it("wraps from the first item to the last and back by default", async () => {
    const { press } = await rendered(<FocusShown itemCount={4} />);

    expect(await press(ARROW_UP)).toBe("focused 3");
    expect(await press(ARROW_DOWN)).toBe("focused 0");
  });

  it("stops at either end when wrapping is off", async () => {
    const { press } = await rendered(<FocusShown itemCount={3} options={{ wrap: false }} />);

    expect(await press(ARROW_UP)).toBe("focused 0");
    expect(await press(ARROW_DOWN)).toBe("focused 1");
    expect(await press(ARROW_DOWN, ARROW_DOWN)).toBe("focused 2");
    expect(await press(ARROW_UP)).toBe("focused 1");
  });

  it("moves with j and k by default, and with no other letter", async () => {
    const { press } = await rendered(<FocusShown itemCount={4} />);

    expect(await press(KEY_J)).toBe("focused 1");
    expect(await press(KEY_X)).toBe("focused 1");
    expect(await press(KEY_K)).toBe("focused 0");
  });

  it("ignores j and k when vim keys are off", async () => {
    const { press } = await rendered(<FocusShown itemCount={4} options={{ vimKeys: false }} />);

    expect(await press(KEY_K)).toBe("focused 0");
    expect(await press(KEY_J)).toBe("focused 0");
  });

  it("hands onEnter the focused index, even for keys sent in one chunk", async () => {
    const onEnter = vi.fn();
    const { press } = await rendered(<FocusShown itemCount={4} handlers={{ onEnter }} />);

    await press(`${ARROW_DOWN}${ARROW_DOWN}${ENTER}`);

    expect(onEnter).toHaveBeenCalledExactlyOnceWith(2);
  });

  it("calls onEscape on escape, selecting nothing", async () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    const { press } = await rendered(<FocusShown itemCount={4} handlers={{ onEnter, onEscape }} />);

    expect(await press(ESCAPE)).toBe("focused 0");

    expect(onEscape).toHaveBeenCalledOnce();
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("listens to no key while inactive", async () => {
    const onEnter = vi.fn();
    const { press } = await rendered(
      <FocusShown itemCount={4} handlers={{ onEnter }} options={{ active: false }} />,
    );

    expect(await press(ARROW_DOWN, ENTER)).toBe("focused 0");
    expect(onEnter).not.toHaveBeenCalled();
  });

  it("moves through a list whose length changed since the first render", async () => {
    const { press, rerender } = await rendered(<FocusShown itemCount={2} />);

    rerender(<FocusShown itemCount={3} />);

    expect(await press(ARROW_UP)).toBe("focused 2");
    expect(await press(ARROW_DOWN)).toBe("focused 0");
  });

  it("hands the newest onEnter the focused index", async () => {
    const firstOnEnter = vi.fn();
    const newestOnEnter = vi.fn();
    const { press, rerender } = await rendered(
      <FocusShown itemCount={4} handlers={{ onEnter: firstOnEnter }} />,
    );

    rerender(<FocusShown itemCount={4} handlers={{ onEnter: newestOnEnter }} />);
    await press(ARROW_DOWN, ENTER);

    expect(newestOnEnter).toHaveBeenCalledExactlyOnceWith(1);
    expect(firstOnEnter).not.toHaveBeenCalled();
  });
});
