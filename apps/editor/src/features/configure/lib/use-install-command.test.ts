import { describe, expect, it } from "vitest"

import { COMMAND_NOTES, limitReachedNote } from "./use-install-command"

// The install dialog is the SECOND door on `createSharedConfig`, and the line
// under the command is the only thing it has to say anything with. It had the
// same defect the Share button had: three refusals, one sentence between them,
// so the one a reload fixes read exactly like the two nothing fixes.
//
// The words rather than the hook, for the reason the sibling suite gives: the
// editor's unit suite runs in node with no DOM, and the decision worth pinning
// is pure anyway — an ending in, a sentence out.

const notes = Object.values(COMMAND_NOTES)

describe("what the install command's note says", () => {
  // The class gate, and the same one that holds the Share button. An ending
  // added without words of its own fails here rather than silently
  // borrowing somebody else's sentence.
  it("gives every ending words of its own", () => {
    expect(new Set(notes).size).toBe(notes.length)
  })

  // The only ending with a remedy. A tab running a bundle from before the last
  // deploy mints a seed version the worker refuses, and re-opening the dialog
  // mints it again — so the note has to name the reload or the id never comes.
  it("names reloading as the fix for an out-of-date page", () => {
    expect(COMMAND_NOTES["out-of-date"].toLowerCase()).toContain("reload")
  })

  // And the two with none. Sending someone whose worker is down to reload is
  // the flattening this row undid, in the other direction.
  it("does not offer a reload to a reader a reload cannot help", () => {
    expect(COMMAND_NOTES.refused.toLowerCase()).not.toContain("reload")
    expect(COMMAND_NOTES.unreachable.toLowerCase()).not.toContain("reload")
  })

  // What the bare command on screen does instead: a bare `init` opens the
  // editor (CLI-923), so the reader is starting over rather than installing.
  it("tells a reader with no id that the command starts over in the editor", () => {
    expect(COMMAND_NOTES.refused).toContain("starts over in the editor")
    expect(COMMAND_NOTES.unreachable).toContain("starts over in the editor")
  })
})

// Every open of the dialog mints, and the worker takes 20 mints a minute from
// one address, so the 21st open used to read "id unavailable" with nothing to
// say it would pass. The owner's ruling: say the limit was reached, and when
// to try again.
describe("what the note says when the rate limit refused the id", () => {
  it("says the limit was reached and when to try again", () => {
    expect(limitReachedNote(60)).toBe(
      "rate limit reached — try again in 1 minute"
    )
  })

  it("counts a window under a minute in seconds", () => {
    expect(limitReachedNote(30)).toBe(
      "rate limit reached — try again in 30 seconds"
    )
  })

  // Rounded up, so nobody is sent back before the window has ended.
  it("rounds a longer window up to whole minutes", () => {
    expect(limitReachedNote(61)).toBe(
      "rate limit reached — try again in 2 minutes"
    )
  })

  // A limit passes on its own, so it must not read like the refusal that
  // does not.
  it("is told apart from a refusal that names no window", () => {
    expect(limitReachedNote(60)).not.toContain("unavailable")
  })

  // The class gate above holds only what is in the vocabulary, so the limit's
  // words live there too and only the worker's window is appended.
  it("speaks from the vocabulary the class gate holds", () => {
    expect(limitReachedNote(60)).toBe(`${COMMAND_NOTES.limited} 1 minute`)
  })
})
