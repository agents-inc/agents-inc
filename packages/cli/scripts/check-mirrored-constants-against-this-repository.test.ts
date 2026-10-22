import { describe, expect, it } from "vitest";

import { check } from "./check-mirrored-constants.js";

describe("this repository", () => {
  it("mirrors every structural constant without drift", () => {
    const result = check();

    const drifted = result.verdicts.filter((verdict) => verdict.outcome === "drifted");

    expect(
      result.verdicts,
      "a run that judges no mirror reports clean, so the drift check below would pass with nothing registered",
    ).not.toStrictEqual([]);
    expect(
      drifted,
      "e2e/pages/constants.ts mirrors these deliberately, so a drift here is a value the E2E suite asserts against and the product no longer declares",
    ).toStrictEqual([]);
  });
});
