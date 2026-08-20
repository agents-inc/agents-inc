import { describe, expect, it } from "vitest";

import { charactersOutsideKebabCase, validateKebabCaseName } from "./validate-kebab-name.js";

/** The entity the refusals under test name. */
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
    // The two halves disagree by design: `-leading-hyphen` breaks the SHAPE and not the
    // alphabet, so a refusal quoting only the character list would name nothing to fix.
    expect(charactersOutsideKebabCase("-leading-hyphen")).toStrictEqual([]);
    expect(validateKebabCaseName("-leading-hyphen", NOUN)).toContain("kebab-case");
  });
});
