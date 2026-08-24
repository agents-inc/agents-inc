import { describe, expect, it } from "vitest";

import { globalHomeFor } from "./global-home.js";

describe("globalHomeFor", () => {
  it("takes the explicit global HOME when the installation has one", () => {
    expect(globalHomeFor({ dir: "/project", globalHome: "/fake-home" })).toBe("/fake-home");
  });

  // The case 23 of 38 call sites rely on, and the reason this is one function rather than two
  // matching expressions: a handle carrying no global HOME really does run under its own dir.
  it("falls back to the installation's own directory when it has none", () => {
    expect(globalHomeFor({ dir: "/project" })).toBe("/project");
  });

  // An empty string is a directory nobody means, and `??` lets it through where `||` would not.
  // Pinned so the operator cannot be "tidied" into the other one.
  it("treats an empty global HOME as given rather than absent", () => {
    expect(globalHomeFor({ dir: "/project", globalHome: "" })).toBe("");
  });
});
