import { render } from "ink-testing-library";
import { afterEach, describe, expect, it } from "vitest";

import { RemovalPlanConfirm } from "./removal-plan-confirm";

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
