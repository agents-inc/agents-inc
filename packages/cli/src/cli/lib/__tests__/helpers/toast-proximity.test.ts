import { describe, expect, it } from "vitest";

import { toastProximityIn } from "./toast-proximity.js";

const TOASTS = ["STEP_TEXT.GLOBAL_AGENTS_BLOCKED"];

/** The shape the rule exists for, as the site that produced it was written. */
const OPEN_LOOP = [
  "await agents.toggleAgent(E2E_AGENT_DISPLAY['web-developer']);",
  "const output = agents.getOutput();",
  "expect(output).toContain(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);",
].join("\n");

/** The same claim, made through the affordance that anchors on raw output before the press. */
const CLOSED_LOOP = [
  "await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY['web-developer']);",
  "await agents.toggleFocusedAgentAwaiting(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);",
].join("\n");

describe("toastProximityIn", () => {
  it("reports a processed-buffer read one line from a toast constant", () => {
    expect(toastProximityIn(OPEN_LOOP, TOASTS)).toStrictEqual([
      { line: 2, read: "getOutput()", toast: "STEP_TEXT.GLOBAL_AGENTS_BLOCKED" },
    ]);
  });

  it("says nothing about the awaiting form, which reads no buffer at all", () => {
    expect(toastProximityIn(CLOSED_LOOP, TOASTS)).toStrictEqual([]);
  });

  it("says nothing about a buffer read far from the toast", () => {
    const distant = [
      "const output = sources.getScreen();",
      "expect(output).toContain(E2E_SKILL.react.display);",
      "",
      "",
      "",
      "",
      "await agents.toggleFocusedAgentAwaiting(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);",
    ].join("\n");

    expect(toastProximityIn(distant, TOASTS)).toStrictEqual([]);
  });

  it("reports a read hoisted ABOVE the toast line as well as below it", () => {
    const hoisted = [
      "expect(agents.getFullOutput()).toContain(STEP_TEXT.GLOBAL_AGENTS_BLOCKED);",
    ].join("\n");

    expect(toastProximityIn(hoisted, TOASTS)).toStrictEqual([
      { line: 1, read: "getFullOutput()", toast: "STEP_TEXT.GLOBAL_AGENTS_BLOCKED" },
    ]);
  });

  it("reports nothing when the caller names no toast, rather than matching every buffer read", () => {
    expect(toastProximityIn(OPEN_LOOP, [])).toStrictEqual([]);
  });

  it("names the line so the site can be opened", () => {
    const padded = ["", "", ...OPEN_LOOP.split("\n")].join("\n");

    expect(toastProximityIn(padded, TOASTS).map((hit) => hit.line)).toStrictEqual([4]);
  });
});
