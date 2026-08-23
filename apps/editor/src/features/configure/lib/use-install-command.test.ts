import { describe, expect, it } from "vitest"

import { COMMAND_NOTES } from "./use-install-command"

// The install dialog is the SECOND door on `createSharedConfig`, and the line
// under the command is the only thing it has to say anything with. It had the
// same defect the Share button had: three refusals, one sentence between them
// ("id unavailable — this command starts a fresh wizard"), so the one a reload
// fixes read exactly like the two nothing fixes.
//
// The words rather than the hook, for the reason the sibling suite gives: the
// editor's unit suite runs in node with no DOM, and the decision worth pinning
// is pure anyway — an ending in, a sentence out.

const notes = Object.values(COMMAND_NOTES)

describe("what the install command's note says", () => {
  // The class gate, and the same one that holds the Share button. A seventh
  // ending added without words of its own fails here rather than silently
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
})
