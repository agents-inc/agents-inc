import { describe, expect, it } from "vitest";

import { globalHomeFor } from "./global-home.js";

describe("globalHomeFor", () => {
  it("takes the explicit global HOME when the installation has one", () => {
    expect(globalHomeFor({ dir: "/project", globalHome: "/fake-home" })).toBe("/fake-home");
  });

  it("falls back to the installation's own directory when it has none", () => {
    expect(globalHomeFor({ dir: "/project" })).toBe("/project");
  });

  it("treats an empty global HOME as given rather than absent", () => {
    expect(globalHomeFor({ dir: "/project", globalHome: "" })).toBe("");
  });
});
