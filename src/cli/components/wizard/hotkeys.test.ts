import { describe, it, expect } from "vitest";
import { isHotkey, isInfoPanelAvailable, HOTKEY_INFO, HOTKEY_TOGGLE_LABELS } from "./hotkeys";
import { WIZARD_STEP_ORDER } from "../../stores/wizard-store";

describe("isHotkey", () => {
  it("should match case-insensitively", () => {
    expect(isHotkey("i", HOTKEY_INFO)).toBe(true);
    expect(isHotkey("I", HOTKEY_INFO)).toBe(true);
    expect(isHotkey("d", HOTKEY_TOGGLE_LABELS)).toBe(true);
    expect(isHotkey("D", HOTKEY_TOGGLE_LABELS)).toBe(true);
  });

  it("should reject non-matching input", () => {
    expect(isHotkey("x", HOTKEY_INFO)).toBe(false);
    expect(isHotkey("a", HOTKEY_TOGGLE_LABELS)).toBe(false);
  });
});

describe("isInfoPanelAvailable", () => {
  it("should be unavailable on the confirm step, which already renders the panel", () => {
    expect(isInfoPanelAvailable("confirm")).toBe(false);
  });

  it("should be available on every other step", () => {
    const availability = WIZARD_STEP_ORDER.map((step) => [step, isInfoPanelAvailable(step)]);

    expect(availability).toStrictEqual([
      ["stack", true],
      ["domains", true],
      ["build", true],
      ["sources", true],
      ["agents", true],
      ["confirm", false],
    ]);
  });
});
