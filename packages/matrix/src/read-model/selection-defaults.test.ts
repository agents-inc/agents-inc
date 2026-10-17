import { describe, expect, it } from "vitest"

import { DEFAULT_SELECTION_OPTIONS } from "./selection-defaults"

describe("DEFAULT_SELECTION_OPTIONS", () => {
  it("installs a fresh pick as a plugin, into the global scope", () => {
    expect(DEFAULT_SELECTION_OPTIONS).toStrictEqual({
      install: "plugin",
      scope: "global",
    })
  })
})
