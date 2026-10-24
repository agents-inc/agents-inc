import { describe, it, expect } from "vitest";

import { matchedAsWritten } from "./matched-as-written.js";

/** Every character a RegExp reads as syntax outside a character class. */
const REGEX_SYNTAX = ".*+?^${}()|[]\\";

/** Each row's near miss is matched by the bare text read as a pattern, and by nothing escaped. */
const NEAR_MISSES = [
  { text: "127.0.0.1", nearMiss: "127x0x0x1" },
  { text: "a*b", nearMiss: "aab" },
  { text: "a+b", nearMiss: "aab" },
  { text: "a?b", nearMiss: "b" },
  { text: "a{2}", nearMiss: "aa" },
  { text: "(a)", nearMiss: "a" },
  { text: "a|b", nearMiss: "a" },
  { text: "[ab]", nearMiss: "a" },
  { text: "a\\d", nearMiss: "a1" },
] as const;

function wholly(source: string): RegExp {
  return new RegExp(`^${source}$`);
}

describe("matchedAsWritten", () => {
  it.each([...REGEX_SYNTAX])("matches text holding %s as that text", (character) => {
    const text = `a${character}b`;

    expect(text).toMatch(wholly(matchedAsWritten(text)));
  });

  it.each(NEAR_MISSES)("matches $text and not $nearMiss", ({ text, nearMiss }) => {
    expect(nearMiss, "the bare text, read as a pattern, matches the near miss").toMatch(
      wholly(text),
    );
    expect(nearMiss).not.toMatch(wholly(matchedAsWritten(text)));
  });

  it.each(["u", "v"])(
    "matches text with no regex syntax as that text under the %s flag, which refuses an escaped hyphen",
    (flag) => {
      const plain = "Skills Resolved – sub-agent web-developer: 2/2 skills found";

      expect(plain).toMatch(new RegExp(`^${matchedAsWritten(plain)}$`, flag));
    },
  );

  it("keeps the pattern valid under the unicode flag, which refuses a lone bracket", () => {
    expect(() => new RegExp(REGEX_SYNTAX, "u"), "the bare text is not a pattern").toThrow();
    expect(REGEX_SYNTAX).toMatch(new RegExp(`^${matchedAsWritten(REGEX_SYNTAX)}$`, "u"));
  });
});
