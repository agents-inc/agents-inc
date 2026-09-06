import { describe, expect, it } from "vitest";

import { offendingLines, retiredFormsIn, withExemptionsRemoved } from "./text-scans.js";

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

describe("withExemptionsRemoved", () => {
  const EXEMPTIONS = ["NEVER/ALWAYS"];

  it("takes an exempt spelling out of reach of a scan that would otherwise fire on it", () => {
    const text = "Promote it to a NEVER/ALWAYS row.";

    expect(offendingLines(withExemptionsRemoved(text, EXEMPTIONS), [/\bNEVER\b/])).toStrictEqual(
      [],
    );
  });

  it("leaves a line whose emphasis is not the exempt spelling", () => {
    const text = "NEVER skip this step.";

    expect(offendingLines(withExemptionsRemoved(text, EXEMPTIONS), [/\bNEVER\b/])).toStrictEqual([
      "NEVER skip this step.",
    ]);
  });

  it("keeps the line structure the scans split on", () => {
    const text = "one NEVER/ALWAYS one\ntwo\nthree";

    expect(withExemptionsRemoved(text, EXEMPTIONS).split("\n")).toHaveLength(3);
  });
});
