import { describe, it, expect, vi } from "vitest";
import { bytewise } from "./string";

/**
 * A locale whose collation orders two ordinary kebab-case names against their code units, which
 * is the whole reason `bytewise` exists rather than `localeCompare`. Lithuanian places `y`
 * immediately after `i`, so it puts `mobile-styling` before `mobile-storage` where code units put
 * it after — and `localeCompare` called with no locale reads the process default, which Node
 * takes from LC_ALL/LANG.
 */
const DIVERGENT_COLLATION_LOCALE = "lt";

/** The pair that locale reverses, stated in code-unit order. */
const COLLATION_DIVERGENT_PAIR = { first: "mobile-storage", second: "mobile-styling" } as const;

describe("bytewise", () => {
  it("orders by code unit even when the process's default collation disagrees", () => {
    const lithuanian = new Intl.Collator(DIVERGENT_COLLATION_LOCALE);
    const { first, second } = COLLATION_DIVERGENT_PAIR;

    expect(Math.sign(lithuanian.compare(first, second))).toBe(1);

    // Stands in for a machine whose default collation is Lithuanian, which is the only thing
    // `localeCompare` with no locale argument consults.
    const defaultCollation = vi
      .spyOn(String.prototype, "localeCompare")
      .mockImplementation(function (this: string, that: string) {
        return lithuanian.compare(String(this), that);
      });
    const collationInForce = Math.sign(first.localeCompare(second));
    const ordered = bytewise(first, second);
    defaultCollation.mockRestore();

    expect(
      collationInForce,
      "the stand-in must actually answer for the process default, or the spec below proves nothing",
    ).toBe(1);
    expect(ordered).toBe(-1);
  });

  it("reports the three comparator outcomes", () => {
    expect(bytewise("a", "b")).toBe(-1);
    expect(bytewise("b", "a")).toBe(1);
    expect(bytewise("a", "a")).toBe(0);
  });
});
