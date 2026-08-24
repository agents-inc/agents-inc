import { describe, expect, it } from "vitest";

import { flattenCliOutput } from "./flatten-cli-output.js";

describe("flattenCliOutput", () => {
  it("rejoins a sentence oclif wrapped across lines", () => {
    const wrapped = " ›   Error: Local marketplace not found:\n ›   /tmp/nope\n";

    expect(flattenCliOutput(wrapped)).toBe("Error: Local marketplace not found: /tmp/nope");
  });

  it("leaves a sentence that was never wrapped alone", () => {
    expect(flattenCliOutput("already one line")).toBe("already one line");
  });

  // The whole point is asserting a WHOLE sentence, so the collapse must not swallow the spaces
  // that separate its words — a version that stripped rather than collapsed would pass every
  // `toContain` on a fragment and fail only on the full string, which is the case it exists for.
  it("collapses runs of whitespace to one space rather than removing them", () => {
    expect(flattenCliOutput("two    words\t\tapart")).toBe("two words apart");
  });

  it("answers empty for output that is only wrapping", () => {
    expect(flattenCliOutput(" ›   \n ›   ")).toBe("");
  });
});
