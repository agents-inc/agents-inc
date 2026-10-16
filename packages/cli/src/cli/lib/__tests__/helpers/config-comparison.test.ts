import { describe, expect, it } from "vitest";
import { normalizeConfigPreservingOrder, normalizeGlobalConfig } from "./config-comparison.js";

/** Lines in the shape the `config.ts` writer emits them: bare keys, single-quoted values. */
const PROJECTS_LINE = "  projects: ['/home/alice/app', '/tmp/xyz-123'],";
const OTHER_PROJECTS_LINE = "  projects: ['/home/bob/other'],";
const SKILL_REACT = "  { id: 'web-framework-react', scope: 'global', origin: 'eject' },";
const SKILL_VITEST = "  { id: 'web-testing-vitest', scope: 'global', origin: 'eject' },";

describe("normalizeGlobalConfig", () => {
  it("does not mask a change to the projects list", () => {
    const before = [SKILL_REACT, PROJECTS_LINE, SKILL_VITEST].join("\n");
    const after = [SKILL_REACT, OTHER_PROJECTS_LINE, SKILL_VITEST].join("\n");

    expect(normalizeGlobalConfig(after)).not.toStrictEqual(normalizeGlobalConfig(before));
  });

  it("treats configs that differ only in line ordering as equal", () => {
    const ordered = [SKILL_REACT, SKILL_VITEST].join("\n");
    const reordered = [SKILL_VITEST, SKILL_REACT].join("\n");

    expect(normalizeGlobalConfig(reordered)).toStrictEqual(normalizeGlobalConfig(ordered));
  });

  it("does not mask a genuine entry addition", () => {
    const before = [SKILL_REACT].join("\n");
    const after = [SKILL_REACT, SKILL_VITEST].join("\n");

    expect(normalizeGlobalConfig(after)).not.toStrictEqual(normalizeGlobalConfig(before));
  });

  it("does not mask a genuine entry removal", () => {
    const before = [SKILL_REACT, SKILL_VITEST].join("\n");
    const after = [SKILL_REACT].join("\n");

    expect(normalizeGlobalConfig(after)).not.toStrictEqual(normalizeGlobalConfig(before));
  });
});

/**
 * The order-SENSITIVE sibling, and the case the block above cannot have.
 *
 * The two are one substitution apart at every call site and read identically there, which is what
 * made swapping them look like a dedup rather than an assertion change: importing the sorted one
 * into a round-trip test weakens "the passthrough edit rewrote the config byte for byte" into "it
 * kept the same set of lines in any order", and reordering is the regression that test exists for.
 * So the reordering case is asserted in both directions, in one file, and neither assertion means
 * anything without the other.
 */
describe("normalizeConfigPreservingOrder", () => {
  it("does not mask a change to the projects list", () => {
    const before = [SKILL_REACT, PROJECTS_LINE, SKILL_VITEST].join("\n");
    const after = [SKILL_REACT, OTHER_PROJECTS_LINE, SKILL_VITEST].join("\n");

    expect(normalizeConfigPreservingOrder(after)).not.toStrictEqual(
      normalizeConfigPreservingOrder(before),
    );
  });

  it("does NOT treat configs that differ only in line ordering as equal", () => {
    const ordered = [SKILL_REACT, SKILL_VITEST].join("\n");
    const reordered = [SKILL_VITEST, SKILL_REACT].join("\n");

    expect(
      normalizeConfigPreservingOrder(reordered),
      "sorting here would stop reordering being detected, which is the whole reason this variant exists",
    ).not.toStrictEqual(normalizeConfigPreservingOrder(ordered));
    expect(
      normalizeGlobalConfig(reordered),
      "the sorted sibling is order-insensitive on the same input, which is what makes the pair a trap",
    ).toStrictEqual(normalizeGlobalConfig(ordered));
  });

  it("does not mask a genuine entry addition", () => {
    const before = [SKILL_REACT].join("\n");
    const after = [SKILL_REACT, SKILL_VITEST].join("\n");

    expect(normalizeConfigPreservingOrder(after)).not.toStrictEqual(
      normalizeConfigPreservingOrder(before),
    );
  });

  it("leaves every line, the projects list included, in its original position", () => {
    const config = [SKILL_VITEST, PROJECTS_LINE, SKILL_REACT].join("\n");

    expect(normalizeConfigPreservingOrder(config)).toStrictEqual(config);
  });
});
