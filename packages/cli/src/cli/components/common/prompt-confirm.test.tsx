/**
 * `promptValue` settles on whichever of three things happens first: the prompt resolved,
 * the prompt resolved before it was even mounted, or the Ink app exited having chosen
 * nothing. The middle one is not hypothetical — Ink flushes mount effects synchronously,
 * so a component that settles on mount calls back before `render()` has returned the
 * instance the teardown needs.
 */
import React, { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { promptValue } from "./prompt-confirm.js";

const CHOSEN = "chosen";
const NOTHING_CHOSEN = "nothing-chosen";

type ProbeProps = {
  /** When the probe calls back: during its mount effect, or a tick later. */
  when: "on-mount" | "after-mount";
  resolve: (value: string) => void;
  onUnmount: () => void;
};

/** Stands in for a prompt, with the two moments a real one can answer at. */
const Probe: React.FC<ProbeProps> = ({ when, resolve, onUnmount }) => {
  useEffect(() => {
    if (when === "on-mount") {
      resolve(CHOSEN);
      return onUnmount;
    }
    const answering = setTimeout(() => resolve(CHOSEN));
    return () => {
      clearTimeout(answering);
      onUnmount();
    };
  }, [when, resolve, onUnmount]);

  return null;
};

describe("promptValue", () => {
  it("resolves with the value a prompt answers on mount, and takes the render down", async () => {
    const onUnmount = vi.fn();

    const value = await promptValue<string>(
      (resolve) => <Probe when="on-mount" resolve={resolve} onUnmount={onUnmount} />,
      { onExit: NOTHING_CHOSEN, clearOnResolve: true },
    );

    expect(value).toBe(CHOSEN);
    expect(onUnmount, "an answered prompt must not be left mounted").toHaveBeenCalledTimes(1);
  });

  it("resolves with the value a prompt answers after mount, and takes the render down", async () => {
    const onUnmount = vi.fn();

    const value = await promptValue<string>(
      (resolve) => <Probe when="after-mount" resolve={resolve} onUnmount={onUnmount} />,
      { onExit: NOTHING_CHOSEN, clearOnResolve: true },
    );

    expect(value).toBe(CHOSEN);
    expect(onUnmount, "an answered prompt must not be left mounted").toHaveBeenCalledTimes(1);
  });
});
