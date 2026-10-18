import { render } from "ink-testing-library";
import React, { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RemovalPlanConfirm, type RemovalPlanConfirmProps } from "./removal-plan-confirm";
import {
  CONFIRM_INPUT_DELAY_MS,
  ENTER,
  KEY_N,
  KEY_Y,
  RENDER_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";

describe("RemovalPlanConfirm", () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("indents each item under its heading", () => {
    const { lastFrame, unmount } = render(
      <RemovalPlanConfirm
        heading="Applying this configuration will remove:"
        sections={[{ label: "Skills:", items: ["Zustand (web-state-zustand)"] }]}
        statements={[]}
        message="Apply this configuration?"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    cleanup = unmount;

    expect(lastFrame()).toContain(" Skills:\n   Zustand (web-state-zustand)");
  });
});

/** Mounted beside the prompt: the app exiting unmounts it too, which is how an exit is seen. */
const ExitWatcher: React.FC<{ onExit: () => void }> = ({ onExit }) => {
  useEffect(() => onExit, [onExit]);
  return null;
};

describe("RemovalPlanConfirm answers", () => {
  const STATEMENT = "The global copy stays for your other projects.";
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  async function shown(overrides: Partial<RemovalPlanConfirmProps> = {}) {
    const props = {
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      onExit: vi.fn(),
    };
    const view = render(
      <>
        <RemovalPlanConfirm
          heading="Applying this configuration will remove:"
          sections={[{ label: "Skills:", items: ["Zustand (web-state-zustand)"] }]}
          statements={[STATEMENT]}
          message="Apply this configuration?"
          onConfirm={props.onConfirm}
          onCancel={props.onCancel}
          {...overrides}
        />
        <ExitWatcher onExit={props.onExit} />
      </>,
    );
    cleanup = view.unmount;
    await delay(RENDER_DELAY_MS);
    const press = async (key: string) => {
      view.stdin.write(key);
      await delay(CONFIRM_INPUT_DELAY_MS);
    };
    return { ...view, ...props, press };
  }

  it("shows each statement under the removals", async () => {
    const { lastFrame } = await shown();

    expect(lastFrame()).toContain(STATEMENT);
  });

  it("confirms on y, then exits", async () => {
    const { press, onConfirm, onCancel, onExit } = await shown();

    await press(KEY_Y);

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("cancels on n, then exits", async () => {
    const { press, onConfirm, onCancel, onExit } = await shown();

    await press(KEY_N);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("cancels on a bare Enter, since removing is never the default", async () => {
    const { press, onConfirm, onCancel } = await shown();

    await press(ENTER);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
