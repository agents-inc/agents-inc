import { describe, expect, it } from "vitest"

import { STORED_PAYLOAD, seedPayload } from "./fixtures"

// The canonical seed payload had been re-typed in apps/server's suite and in
// every packages/cli e2e spec that publishes one, each copy free to drift from
// the contract and from the others. `seedPayload` is the one statement of it;
// these are the three things a caller relies on when it stops writing its own.

describe("the configuration the worker holds", () => {
  // apps/server's suite wants one carrying a stack id and the CLI's e2e specs
  // want one carrying their own skills. Neither wants to restate the fields it
  // is not changing, which is the whole of why the copies existed.
  it("moves the field an override names and no other", () => {
    expect(seedPayload({ stackId: "next" })).toStrictEqual({
      ...STORED_PAYLOAD,
      stackId: "next",
    })
  })

  // Replaces rather than merges. A merge would leave every payload a spec built
  // carrying `web-framework-react` as well, so each of them would be asserting
  // about a skill it never asked for — and passing.
  it("replaces a map rather than merging into it", () => {
    expect(seedPayload({ skills: {} }).skills).toStrictEqual({})
  })

  // Parsed rather than asserted, exactly as every fixture beside it is: an
  // override that drifts from the contract fails where it was written, rather
  // than in whichever assertion happens to read the field that moved.
  it("refuses an override the contract does not admit", () => {
    // Matched on the field rather than on the throw, so a builder that is not
    // there at all cannot satisfy this with its own TypeError.
    // @ts-expect-error the shape is what is being refused
    expect(() => seedPayload({ skills: "nope" })).toThrow(/skills/)
  })
})
