import { describe, expect, it } from "vitest";

import {
  check,
  ROOT_CAUSE_OUTSIDE_ENUM,
  type UndeclaredSymbol,
  type UnresolvedReference,
} from "./check-findings-frontmatter.js";

/** Named, not counted. References outside the repository or git-ignored are never judged, so never belong here. */
const UNRESOLVED_REFERENCES_ON_DISK: UnresolvedReference[] = [];

/** Re-derive from the diff this assertion prints, not from a count. */
const UNDECLARED_SYMBOLS_ON_DISK: UndeclaredSymbol[] = [];

/** Read once: the symbol scan parses every module in the repository. */
describe("this repository", () => {
  const repository = check();

  /** First: a red here means re-run, never re-derive a pin. */
  it("was not written into while this scan read it", () => {
    expect(
      repository.inFlight,
      "a file moved under this scan, so every assertion below it is provisional — re-run before believing one, and never edit a pin on the strength of a red sitting beside this",
    ).toStrictEqual([]);
  });

  it("has no finding whose frontmatter a parser cannot read", () => {
    expect(repository.verdicts.length, "the scan must have something to scan").toBeGreaterThan(0);
    expect(
      repository.verdicts.filter((verdict) => verdict.outcome === "unreadable"),
      "every status rollup and link scan over this directory is defined on parsed frontmatter — an unreadable file is skipped by all of them silently",
    ).toStrictEqual([]);
    expect(repository.clean).toBe(true);
  });

  it("has no finding whose root_cause is outside the enum TEMPLATE.md states", () => {
    expect(
      repository.verdicts.filter(
        (verdict) =>
          verdict.outcome === "unreadable" && verdict.problem.startsWith(ROOT_CAUSE_OUTSIDE_ENUM),
      ),
      "a value in neither list is invisible to every rollup that groups by root_cause",
    ).toStrictEqual([]);
  });

  it("has no piece of work filed twice over the same files, cause and day", () => {
    expect(
      repository.duplicates,
      "the pair this scan was written for was two stale file lists, and repairing both retired it",
    ).toStrictEqual([]);
  });

  it("holds its dangling frontmatter references to the ones already reported", () => {
    expect(repository.unresolved).toStrictEqual(UNRESOLVED_REFERENCES_ON_DISK);
  });

  it("holds its undeclared lifecycle symbols to the ones already reported", () => {
    expect(repository.undeclared).toStrictEqual(UNDECLARED_SYMBOLS_ON_DISK);
  });

  /** Empty rather than pinned: a missing row is repaired by writing it. */
  it("has no finding the INDEX names nowhere", () => {
    expect(
      repository.unlisted,
      "a finding with no row is invisible to every pass that groups this directory, and deleting it erases it entirely",
    ).toStrictEqual([]);
  });
});
