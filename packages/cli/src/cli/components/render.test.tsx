import { Text } from "ink";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { inkRender } = vi.hoisted(() => ({ inkRender: vi.fn() }));

vi.mock("ink", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ink")>()),
  render: inkRender,
}));

import { render } from "./render.js";

const NODE = <Text>prompt</Text>;

/** `render` reads `process.stdout` when the caller names no stream; its `isTTY` is set per spec. */
describe("render", () => {
  let foundIsTTY: PropertyDescriptor | undefined;

  beforeEach(() => {
    inkRender.mockClear();
    foundIsTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  });

  afterEach(() => {
    if (foundIsTTY === undefined) Reflect.deleteProperty(process.stdout, "isTTY");
    else Object.defineProperty(process.stdout, "isTTY", foundIsTTY);
  });

  function stdoutIsATerminal(isTTY: boolean): void {
    Object.defineProperty(process.stdout, "isTTY", { value: isTTY, configurable: true });
  }

  it("forces interactive painting on a terminal", () => {
    stdoutIsATerminal(true);

    render(NODE);

    expect(inkRender).toHaveBeenCalledExactlyOnceWith(NODE, { interactive: true });
  });

  it("lets a caller's interactive choice win on a terminal", () => {
    stdoutIsATerminal(true);

    render(NODE, { interactive: false });

    expect(inkRender).toHaveBeenCalledExactlyOnceWith(NODE, { interactive: false });
  });

  it("leaves painting to Ink off a terminal", () => {
    stdoutIsATerminal(false);

    render(NODE);

    expect(inkRender).toHaveBeenCalledExactlyOnceWith(NODE, {});
  });
});
