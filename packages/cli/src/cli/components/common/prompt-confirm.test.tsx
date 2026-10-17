// Ink flushes mount effects synchronously, so a prompt can answer before `render()` returns.
import React, { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { promptValue } from "./prompt-confirm.js";

const CHOSEN = "chosen";
const NOTHING_CHOSEN = "nothing-chosen";

type ProbeProps = {
  when: "on-mount" | "after-mount";
  resolve: (value: string) => void;
  onUnmount: () => void;
};

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
