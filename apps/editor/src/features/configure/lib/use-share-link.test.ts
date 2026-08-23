import { describe, expect, it } from "vitest"

import { SHARE_NARRATIONS } from "./use-share-link"

// The Share button is the only feedback surface the roster panel has, so what
// it says IS the feature. This suite is the words rather than the hook: the
// editor's unit suite runs in node with no DOM, and the decision worth pinning
// is pure anyway — an ending in, a narration out.
//
// SERVER-04 is the reason it exists. A stale browser tab POSTs a seed version
// the deployed worker no longer serves and is refused on every click forever;
// the button said "Sharing failed" for two seconds and went quiet, so the defect
// was reported as a screenshot of a console 400 rather than as anything the app
// itself had said.

const narrations = Object.values(SHARE_NARRATIONS)

describe("what the Share button says", () => {
  // The class gate, and the one assertion that would have caught the defect on
  // its own: five different endings had one word between them, so no label
  // could be acted on. Distinctness is cheap to hold and impossible to satisfy
  // by accident — a sixth ending added without words of its own fails here.
  it("gives every ending words of its own", () => {
    const labels = narrations.map(({ label }) => label)

    expect(new Set(labels).size).toBe(labels.length)
  })

  // Only the endings that report something decay. The one that names an action
  // has to survive being looked away from.
  it("leaves the out-of-date instruction on screen", () => {
    expect(SHARE_NARRATIONS["out-of-date"].decays).toBe(false)
  })

  it("names reloading as the fix for an out-of-date page", () => {
    expect(SHARE_NARRATIONS["out-of-date"].label.toLowerCase()).toContain(
      "reload"
    )
  })

  // Every other ending is a report, and a report that outstays its welcome is
  // a button stuck on a word about a click two minutes ago.
  it("clears every ending that only reports what happened", () => {
    const lingering = Object.entries(SHARE_NARRATIONS)
      .filter(([outcome]) => outcome !== "out-of-date")
      .filter(([, narration]) => !narration.decays)

    expect(lingering).toStrictEqual([])
  })

  // The refusal that used to lie. By the time the clipboard is asked, the
  // config is stored and the id is minted — so the words cannot be the ones a
  // share that never happened gets.
  it("does not call a refused copy a failed share", () => {
    expect(SHARE_NARRATIONS["copy-refused"].label).not.toBe(
      SHARE_NARRATIONS.refused.label
    )
    expect(SHARE_NARRATIONS["copy-refused"].label.toLowerCase()).not.toContain(
      "failed"
    )
  })

  // Anything that is not a completed copy has to read as unfinished, since the
  // state is what the panel disables and styles on.
  it("marks every ending but a completed copy as unfinished", () => {
    const finished = Object.entries(SHARE_NARRATIONS)
      .filter(([, narration]) => narration.state === "copied")
      .map(([outcome]) => outcome)

    expect(finished).toStrictEqual(["copied"])
  })
})
