import { describe, expect, it } from "vitest"

import { STORED_PAYLOAD, seedPayload } from "./fixtures"


describe("the configuration the worker holds", () => {
  it("moves the field an override names and no other", () => {
    expect(seedPayload({ stackId: "next" })).toStrictEqual({
      ...STORED_PAYLOAD,
      stackId: "next",
    })
  })

  it("replaces a map rather than merging into it", () => {
    expect(seedPayload({ skills: {} }).skills).toStrictEqual({})
  })

  it("refuses an override the contract does not admit", () => {
    // Matched on the field so a missing builder's TypeError cannot pass.
    // @ts-expect-error the shape is what is being refused
    expect(() => seedPayload({ skills: "nope" })).toThrow(/skills/)
  })
})
