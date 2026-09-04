import { describe, expect, it } from "vitest";

import { offendingLines, retiredFormsIn } from "./text-scans.js";

describe("offendingLines", () => {
  const SHOUTS = /\bNEVER\b/;

  it("returns a line a pattern matches", () => {
    const text = "Read the file first.\nNEVER skip this step.\n";

    expect(offendingLines(text, [SHOUTS])).toStrictEqual(["NEVER skip this step."]);
  });

  it("does not return a line no pattern matches", () => {
    const text = "Read the file first.\nThen write the change.\n";

    expect(offendingLines(text, [SHOUTS])).toStrictEqual([]);
  });
});

describe("retiredFormsIn", () => {
  const FORMS = ["CRITICAL WARNING", "COMPLETELY WORTHLESS"];

  it("returns a form that still appears in the text", () => {
    const text = "## CRITICAL WARNING\nRead the skill before you use it.";

    expect(retiredFormsIn(text, FORMS)).toStrictEqual(["CRITICAL WARNING"]);
  });

  it("does not return a form absent from the text", () => {
    const text = "Read the skill before you use it.";

    expect(retiredFormsIn(text, FORMS)).toStrictEqual([]);
  });
});
