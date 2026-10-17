import { describe, expect, it } from "vitest"

import { SHARE_NARRATIONS } from "./use-share-link"

const narrations = Object.values(SHARE_NARRATIONS)

// Endings that instruct rather than report; listed, since nothing on a
// narration says so.
const INSTRUCTIONS: string[] = ["out-of-date", "unwritable"]

describe("what the Share button says", () => {
  it("gives every ending words of its own", () => {
    const labels = narrations.map(({ label }) => label)

    expect(new Set(labels).size).toBe(labels.length)
  })

  it("leaves the out-of-date instruction on screen", () => {
    expect(SHARE_NARRATIONS["out-of-date"].decays).toBe(false)
  })

  it("names reloading as the fix for an out-of-date page", () => {
    expect(SHARE_NARRATIONS["out-of-date"].label.toLowerCase()).toContain(
      "reload"
    )
  })

  it("leaves the unwritable instruction on screen", () => {
    expect(SHARE_NARRATIONS.unwritable.decays).toBe(false)
  })

  it("names scope as the fix for an unwritable configuration", () => {
    expect(SHARE_NARRATIONS.unwritable.label.toLowerCase()).toContain("scope")
  })

  it("clears every ending that only reports what happened", () => {
    const lingering = Object.entries(SHARE_NARRATIONS)
      .filter(([outcome]) => !INSTRUCTIONS.includes(outcome))
      .filter(([, narration]) => !narration.decays)

    expect(lingering).toStrictEqual([])
  })

  // By the clipboard step the config is stored and the id minted.
  it("does not call a refused copy a failed share", () => {
    expect(SHARE_NARRATIONS["copy-refused"].label).not.toBe(
      SHARE_NARRATIONS.refused.label
    )
    expect(SHARE_NARRATIONS["copy-refused"].label.toLowerCase()).not.toContain(
      "failed"
    )
  })

  it("marks every ending but a completed copy as unfinished", () => {
    const finished = Object.entries(SHARE_NARRATIONS)
      .filter(([, narration]) => narration.state === "copied")
      .map(([outcome]) => outcome)

    expect(finished).toStrictEqual(["copied"])
  })
})
