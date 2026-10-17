import { describe, expect, it } from "vitest";

import { RETIRED_FORM_STRINGS, SHOUTING } from "./retired-prose-forms.js";

// Spelled out rather than read from the roster, so the test can't pass for whatever it holds.
const NUMERAL_SEPARATED_RUN = "DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE";

describe("SHOUTING", () => {
  it("reads a numeral inside a shouted run as a separator rather than as one of the four words", () => {
    expect(
      SHOUTING.test(NUMERAL_SEPARATED_RUN),
      "without `(?:\\d+\\s+)?` the numeral cuts this line into two runs of two and three words, and the one line the pattern exists for becomes the one line it cannot see",
    ).toBe(true);
  });

  it("still demands four capitalised words, so a numeral cannot pad a shorter run into a match", () => {
    expect(SHOUTING.test("ONE TWO 3 FOUR")).toBe(false);
  });

  it("leaves ordinary prose carrying an acronym and a figure alone", () => {
    expect(SHOUTING.test("The CLI has 13 commands and 18 flags")).toBe(false);
    expect(SHOUTING.test("Use TypeScript 5 strict mode")).toBe(false);
  });
});

describe("RETIRED_FORM_STRINGS", () => {
  it("names each retired form once, so a hit is reported once", () => {
    expect(
      [...new Set(RETIRED_FORM_STRINGS)],
      "a form listed twice in the roster is reported twice by every scan that runs it",
    ).toStrictEqual(RETIRED_FORM_STRINGS);
  });
});
