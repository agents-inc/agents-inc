import { describe, expect, it } from "vitest";

import { check } from "./check-spec-name-vocabulary.js";

/** Generous headroom over a whole-tree scan whose size grows with the package. */
const WHOLE_TREE_SCAN_TIMEOUT_MS = 60_000;

describe("this package", () => {
  it(
    "has no spec named after a constant the package no longer holds",
    () => {
      const { specs, modules, unresolved } = check();

      // Asserted in one `it` because a second whole-tree scan would double the cost.
      expect(specs.length, "a scan that read no spec judged nothing").toBeGreaterThan(1);
      expect(
        modules.length,
        "a scan with no vocabulary calls every name withdrawn",
      ).toBeGreaterThan(1);
      expect(
        unresolved,
        "a test name cannot go red, so a rename that leaves one behind is corrected in the same pass or never — clean-code-standards.md 17.4",
      ).toStrictEqual([]);
    },
    WHOLE_TREE_SCAN_TIMEOUT_MS,
  );
});
