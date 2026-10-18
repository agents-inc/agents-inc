import { describe, expect, it } from "vitest"

import { bytewise, inAnEnglishList } from "./string"

describe("bytewise", () => {
  it("puts the smaller code unit first", () => {
    expect(bytewise("a", "b")).toBe(-1)
  })

  it("puts the larger code unit last", () => {
    expect(bytewise("b", "a")).toBe(1)
  })

  it("leaves equal strings where they are", () => {
    expect(bytewise("react", "react")).toBe(0)
  })

  it("orders by code unit rather than by locale, so capitals come before every lower case", () => {
    expect(["b", "a", "B", "A"].sort(bytewise)).toStrictEqual([
      "A",
      "B",
      "a",
      "b",
    ])
  })
})

describe("inAnEnglishList", () => {
  it("says nothing for no items", () => {
    expect(inAnEnglishList([])).toBe("")
  })

  it("names a single item alone", () => {
    expect(inAnEnglishList(["isolation"])).toBe("isolation")
  })

  it("joins two items with and", () => {
    expect(inAnEnglishList(["isolation", "experimental"])).toBe(
      "isolation and experimental"
    )
  })

  it("separates all but the last with commas", () => {
    expect(inAnEnglishList(["models", "isolation", "experimental"])).toBe(
      "models, isolation and experimental"
    )
  })
})
