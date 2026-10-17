import { describe, expect, it } from "vitest"

import { COMMAND_NOTES, limitReachedNote } from "./use-install-command"

const notes = Object.values(COMMAND_NOTES)

describe("what the install command's note says", () => {
  it("gives every ending words of its own", () => {
    expect(new Set(notes).size).toBe(notes.length)
  })

  // A stale bundle mints a seed version the worker refuses.
  it("names reloading as the fix for an out-of-date page", () => {
    expect(COMMAND_NOTES["out-of-date"].toLowerCase()).toContain("reload")
  })

  it("does not offer a reload to a reader a reload cannot help", () => {
    expect(COMMAND_NOTES.refused.toLowerCase()).not.toContain("reload")
    expect(COMMAND_NOTES.unreachable.toLowerCase()).not.toContain("reload")
  })

  // A bare `init` opens the editor.
  it("tells a reader with no id that the command starts over in the editor", () => {
    expect(COMMAND_NOTES.refused).toContain("starts over in the editor")
    expect(COMMAND_NOTES.unreachable).toContain("starts over in the editor")
  })
})

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

  it("rounds a longer window up to whole minutes", () => {
    expect(limitReachedNote(61)).toBe(
      "rate limit reached — try again in 2 minutes"
    )
  })

  it("is told apart from a refusal that names no window", () => {
    expect(limitReachedNote(60)).not.toContain("unavailable")
  })

  it("speaks from the vocabulary the class gate holds", () => {
    expect(limitReachedNote(60)).toBe(`${COMMAND_NOTES.limited} 1 minute`)
  })
})
