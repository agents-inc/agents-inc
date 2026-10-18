import { describe, expect, it } from "vitest";

import { invalidResult, mergeValidationResults, validResult } from "./validation-result.js";

describe("validation results", () => {
  it("builds a passing result with nothing to report", () => {
    expect(validResult()).toStrictEqual({ valid: true, errors: [], warnings: [] });
  });

  it("builds a failing result carrying its one error and no warning", () => {
    expect(invalidResult("name is required")).toStrictEqual({
      valid: false,
      errors: ["name is required"],
      warnings: [],
    });
  });

  it("merges results into one that fails when any carries an error", () => {
    expect(
      mergeValidationResults([validResult(), invalidResult("name is required")]),
    ).toStrictEqual({ valid: false, errors: ["name is required"], warnings: [] });
  });
});
