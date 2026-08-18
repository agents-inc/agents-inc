import { describe, expect, it } from "vitest"

import { unknownSavedIds, useConfigStore, withoutWrites } from "./config-store"

import type { PersistStorage, StorageValue } from "zustand/middleware"

import type { PersistedConfig, SkillEntry } from "./persisted-schema"

// The slot a shared configuration runs on.
//
// A shared link is its own URL with its own state (EDITOR-37), and the one
// thing opening one must never cost is the visitor's own saved configuration —
// not on arrival, and not through the first thing they change afterwards.
// Guarding every write would be a rule every action in the store has to keep;
// taking the pen away is one statement, made once.
//
// Kept pure so it can be exercised without a browser, which is the arrangement
// `readSavedMarketplaces` established: the browser half is proved end to end,
// where a real localStorage is.

type Held = { stackId: string | null }

const SLOT = "agents-inc:config:v1"

const HELD: StorageValue<Held> = { state: { stackId: "nextjs" }, version: 8 }
const OTHER: StorageValue<Held> = { state: { stackId: "remix" }, version: 8 }

// A slot that records what it was asked to do, so "the write never happened" is
// observable rather than inferred from what a later read came back with.
const watchedSlot = () => {
  let held: StorageValue<Held> | null = HELD
  const writes: StorageValue<Held>[] = []
  const removals: string[] = []

  const storage: PersistStorage<Held> = {
    getItem: () => held,
    setItem: (_name, value) => {
      writes.push(value)
      held = value
    },
    removeItem: (name) => {
      removals.push(name)
      held = null
    },
  }

  return { storage, writes, removals, held: () => held }
}

describe("withoutWrites", () => {
  it("answers with what the slot holds", () => {
    const slot = watchedSlot()

    expect(withoutWrites(slot.storage).getItem(SLOT)).toStrictEqual(HELD)
  })

  it("swallows a write, leaving what was there", () => {
    const slot = watchedSlot()

    withoutWrites(slot.storage).setItem(SLOT, OTHER)

    expect(slot.writes).toStrictEqual([])
    expect(slot.held()).toStrictEqual(HELD)
  })

  // A slot emptied is a slot written. `clearStorage` reaches this door rather
  // than the one above, so leaving it open would be the same loss by a
  // different verb.
  it("swallows a removal too", () => {
    const slot = watchedSlot()

    withoutWrites(slot.storage).removeItem(SLOT)

    expect(slot.removals).toStrictEqual([])
    expect(slot.held()).toStrictEqual(HELD)
  })

  // The wrapper is a second handle on one slot, not a replacement for it: the
  // real one has to keep writing, or coming back to the visitor's own
  // configuration would leave them unable to save anything again.
  it("leaves the slot it wraps able to write", () => {
    const slot = watchedSlot()

    withoutWrites(slot.storage).setItem(SLOT, OTHER)
    slot.storage.setItem(SLOT, OTHER)

    expect(slot.held()).toStrictEqual(OTHER)
  })
})

// A prune that drops nothing must not be a change.
//
// `set` is what writes: persist wraps it, so a store action that replaces the
// state with an equal copy still puts that copy in the slot. Harmless in every
// case but one — this is reachable BEFORE the saved configuration has been
// read at all. A restore parked on a marketplace that would not load is
// finished by the same press that seats one, and seating one prunes; an empty
// store written over the slot first is the very configuration that press was
// about to restore.
//
// Asked as identity rather than by watching a slot, because identity is the
// fact underneath: no new state object means no `set`, and no `set` means no
// write, whatever storage happens to be attached.
describe("pruneToCatalog", () => {
  it("leaves the state untouched when the catalogue can place everything", () => {
    const before = useConfigStore.getState()

    before.pruneToCatalog()

    expect(useConfigStore.getState()).toBe(before)
  })

  it("leaves an empty configuration untouched", () => {
    useConfigStore.getState().reset()
    const before = useConfigStore.getState()

    before.pruneToCatalog()

    expect(useConfigStore.getState()).toBe(before)
  })
})

// What a prune actually cost, named rather than counted.
//
// `reportPruning` beside it counts the drops for observability; these are for
// the person whose configuration just came back smaller, and the screen says
// them in the words the shared-link door already uses for a payload's. The same
// three places `unknownPayloadIds` names — the skills asked for, the agents
// asked for, and the stack — which is what keeps the two doors saying one thing.
describe("unknownSavedIds", () => {
  const entry = (): SkillEntry => ({
    install: "plugin",
    scope: "project",
    assignments: {},
  })

  const config = (over: Partial<PersistedConfig> = {}): PersistedConfig => ({
    stackId: null,
    skills: {},
    remembered: {},
    agents: {},
    ...over,
  })

  it("names the skill the catalogue could not place", () => {
    const before = config({
      skills: { "acme-web-widgets": entry(), react: entry() },
    })

    expect(
      unknownSavedIds(before, config({ skills: { react: entry() } }))
    ).toStrictEqual(["acme-web-widgets"])
  })

  // One id like any other, both of them: an agent that no longer exists and a
  // stack that no longer exists are lost work exactly as a skill is.
  it("names a dropped agent and a dropped stack too", () => {
    const before = config({
      stackId: "acme-house-stack",
      agents: { "acme-runner": {} },
    })

    expect(unknownSavedIds(before, config())).toStrictEqual([
      "acme-runner",
      "acme-house-stack",
    ])
  })

  it("answers with nothing when the prune dropped nothing", () => {
    const kept = config({ stackId: "nextjs", skills: { react: entry() } })

    expect(unknownSavedIds(kept, kept)).toStrictEqual([])
  })

  // A deselected skill's remembered setup was never going to be applied, so
  // naming it under "not applied" would describe a loss nothing on screen can
  // show — and would name an id the visitor has no way to connect to anything.
  it("leaves a dropped remembered setup unnamed", () => {
    const before = config({ remembered: { "acme-web-widgets": entry() } })

    expect(unknownSavedIds(before, config())).toStrictEqual([])
  })
})
