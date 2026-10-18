import { describe, expect, it } from "vitest";

import { charactersOutsideKebabCase, validateKebabCaseName } from "./validate-kebab-name.js";

const NOUN = "Marketplace";

/** An npm scoped name — legal for a package, and the case this list exists for. */
const SCOPED_PACKAGE_NAME = "@acme/skills";

describe("charactersOutsideKebabCase", () => {
  it("should name every character a scoped npm name carries and kebab-case does not", () => {
    expect(charactersOutsideKebabCase(SCOPED_PACKAGE_NAME)).toStrictEqual(["@", "/"]);
  });

  it("should name a repeated offender once, where it first appears", () => {
    expect(charactersOutsideKebabCase("a.b.c_d")).toStrictEqual([".", "_"]);
  });

  it("should name nothing for a name whose characters are all admissible", () => {
    expect(charactersOutsideKebabCase("-leading-hyphen")).toStrictEqual([]);
    expect(charactersOutsideKebabCase("web-framework-react")).toStrictEqual([]);
  });

  it("should name an uppercase letter, which the rule admits nowhere", () => {
    expect(charactersOutsideKebabCase("Acme")).toStrictEqual(["A"]);
  });
});

describe("the pair a refusal is built from", () => {
  it("should leave a name with no offending character refused by the rule alone", () => {
    // `-leading-hyphen` breaks the shape, not the alphabet, so the character list is empty.
    expect(charactersOutsideKebabCase("-leading-hyphen")).toStrictEqual([]);
    expect(validateKebabCaseName("-leading-hyphen", NOUN)).toContain("kebab-case");
  });
});

describe("validateKebabCaseName, a name left blank", () => {
  it.each(["", "   "])("asks for a name when given %j", (blank) => {
    expect(validateKebabCaseName(blank, NOUN)).toBe("Marketplace name is required");
  });
});
