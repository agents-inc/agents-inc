import { MATRIX_VERSION, SEED_VERSION } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { readSavedStack } from "./saved-stack-store"

// The saved slot is a second untrusted read, and a quieter one than the config
// store's: nothing on screen explains an empty grid cell, so what matters is
// that only a payload this app can actually apply ever gets past here.
//
// Its version seam is the payload's own `v` rather than `PERSIST_VERSION`,
// which is the whole point of the slot being separate — a snapshot someone
// made on purpose must survive a bump of the browser state it was saved from,
// and must not survive a change to the contract it is written in.

const payload = (over: Record<string, unknown> = {}) => ({
  v: SEED_VERSION,
  matrixVersion: MATRIX_VERSION,
  stackId: null,
  skills: {
    "web-framework-react": {
      install: "plugin",
      scope: "project",
      assignments: { "web-developer": "preloaded" },
    },
  },
  agents: { "web-developer": { scope: "global" } },
  ...over,
})

const slot = (saved: unknown) => ({ saved })

describe("readSavedStack", () => {
  it("returns a payload the contract still recognises", () => {
    expect(readSavedStack(slot(payload()))).toEqual(payload())
  })

  // Ids are the CLI's slugs and are never checked here: pruning what this
  // catalog has moved past is `fromSeedPayload`'s job, on the way in.
  it("keeps ids this catalog may no longer know", () => {
    const drifted = payload({
      skills: {
        "skill-from-the-future": {
          install: "plugin",
          scope: "project",
          assignments: {},
        },
      },
    })

    expect(readSavedStack(slot(drifted))).toEqual(drifted)
  })

  // The version seam. A payload minted under an older contract is discarded
  // rather than guessed at — the same discard-don't-migrate policy the config
  // store follows, decided here by the payload rather than by the browser.
  it("discards a payload minted under an older contract", () => {
    expect(readSavedStack(slot(payload({ v: SEED_VERSION - 1 })))).toBe(null)
  })

  // The same seam pinned against a literal, because the test above follows
  // `SEED_VERSION` wherever it goes and so can never say WHICH contract moved.
  // Every stack saved before v4 sits in a browser in this shape; this is the
  // read that throws all of them away, and it has to answer `null` rather than
  // throw — nothing on screen explains an empty cell, but a broken page is not
  // an explanation either.
  it("discards a stack saved under the v3 contract", () => {
    expect(readSavedStack(slot(payload({ v: 3 })))).toBe(null)
  })

  it.each([
    ["an empty slot", undefined],
    ["nothing at all", null],
    ["a slot that never held a payload", {}],
    ["a slot holding something else entirely", slot("a string")],
    ["a payload with no envelope", slot({ skills: {} })],
    ["a payload whose skills are not a map", slot(payload({ skills: 7 }))],
  ])("discards %s", (_label, stored) => {
    expect(readSavedStack(stored)).toBe(null)
  })
})
