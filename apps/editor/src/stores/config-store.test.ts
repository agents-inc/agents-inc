import { afterEach, describe, expect, it, vi } from "vitest"

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

// The ids the vendored public catalogue does and does not hold. `toggleSkill`
// and the option actions all ask it before they change anything, and what they
// do when the answer is no is what the block below is about.
const KNOWN_SKILL = "web-framework-react"
const KNOWN_AGENT = "web-developer"
const UNKNOWN_SKILL = "acme-web-widgets"

// The same id read the other way round: unknown to the VENDORED catalogue
// because it belongs to a marketplace's. A browser that loaded that
// marketplace has it seated, selects against it, and persists it verbatim.
const PRIVATE_CATALOG_SKILL = UNKNOWN_SKILL

// A marketplace's STACK id, and the same fact about it: `matrixStackSchema.id`
// is the catalogue's own vocabulary, so a stack saved on a marketplace and
// reopened against the vendored catalogue is pruned by a name the org chose.
// The spelling `MARKETPLACE_CATALOG` publishes, and the one the prune tests at
// the foot of this file already use as their dropped stack.
const PRIVATE_CATALOG_STACK = "acme-house-stack"

/**
 * The store built against a `localStorage` this suite can watch.
 *
 * `set` is what WRITES: persist wraps it as "call it, then `setItem()`", and
 * the `setItem()` half runs OUTSIDE zustand's own `Object.is` short-circuit. So
 * an updater arm returning an empty patch changes nothing and saves anyway —
 * which is a fact about the SLOT and not about the state, and the reason these
 * read the slot rather than asking the identity question `pruneToCatalog` above
 * asks. That question passes against the empty patch too, and is exactly how
 * this survived.
 *
 * The store's slot is `createJSONStorage(() => window.localStorage)`, read once
 * at module scope — so the browser has to be standing BEFORE the import, which
 * is what the reset and the dynamic import are for. This suite runs in node,
 * where persist otherwise finds no storage at all and takes its silent no-op
 * branch: nothing to watch, and every assertion below vacuously green.
 */
const storeOnAWatchedSlot = async () => {
  const held = new Map<string, string>()
  // This store's slot alone. `toggleSkill` also flashes the roster, and the UI
  // store persists to a slot of its own on the same `localStorage`.
  const writes: string[] = []

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === SLOT) writes.push(value)
        held.set(key, value)
      },
      removeItem: (key: string) => {
        held.delete(key)
      },
    },
  })

  vi.resetModules()
  const { useConfigStore: store } = await import("./config-store")

  return { store, writes }
}

// An action the catalogue refuses must not reach `set`.
//
// The refusals were written as arms INSIDE the updater — `return {}` reads as
// "change nothing" and is not: persist saves whatever the updater returned, so
// a click the catalogue turned down put the whole configuration back in the
// slot. Harmless while the slot holds what memory holds, and not harmless in
// the one window where it does not — a restore parked on a marketplace that
// would not load is finished by a press that arrives after the store has been
// written to at least once.
describe("an action the catalogue refuses", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The control, and it is not ceremony: without it every assertion below is
  // green against a slot nothing was ever going to write to.
  it("writes the slot when the catalogue can place the skill", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store.getState().toggleSkill(KNOWN_SKILL)

    expect(writes).toHaveLength(1)
  })

  it("writes nothing for a skill the catalogue cannot place", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store.getState().toggleSkill(UNKNOWN_SKILL)

    expect(writes).toStrictEqual([])
  })

  // The same arm one helper deeper: `configure` asks the catalogue the same
  // question for a skill that is not selected, and answered it the same way.
  it("writes nothing for an option set on a skill it cannot place", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store.getState().setSkillOption(UNKNOWN_SKILL, { scope: "global" })

    expect(writes).toStrictEqual([])
  })

  // And `patchAssignment`'s, which turns down a row no selected skill holds.
  it("writes nothing for a row no selected skill holds", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store.getState().toggleAssignmentEnabled(KNOWN_SKILL, KNOWN_AGENT)

    expect(writes).toStrictEqual([])
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

// The two doors onto the same slot that REPORT, and what each may name.
//
// Both are reached through the real persist middleware — a stubbed
// `localStorage` holding a blob, then `readSavedConfig()` — because what is
// under test is the reported payload and nothing pure produces one.

const sink = { issue: vi.fn(), error: vi.fn() }

const readingASlotHolding = async (blob: string) => {
  const held = new Map([["agents-inc:config:v1", blob]])

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => held.set(key, value),
      removeItem: (key: string) => held.delete(key),
    },
  })

  // Imported after the reset, not before. `resetModules` gives the store a
  // FRESH `report.ts` with a sink variable of its own, so a sink installed on
  // the statically imported copy would be set on a module nothing calls — and
  // every assertion here would read zero calls and pass by accident.
  //
  // The reset also reseats the catalogue: a fresh `catalog-store` is the
  // VENDORED one, which is what makes a marketplace's ids unknown below.
  vi.resetModules()
  const { setReportingSink } = await import("@/lib/observability/report")
  setReportingSink(sink)

  const { readSavedConfig } = await import("./config-store")
  await readSavedConfig()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// The discard door. A blob the current contract can no longer read becomes a
// warning, and the warning is the only trace — the discard itself is silent on
// screen.
//
// What it may name is decided by `persistedConfigSchema` rather than by the
// handler: `skills`, `remembered` and `agents` are `z.record`s, and once a
// visitor loads a marketplace, `onlyPersistableSkills` persists that
// CATALOGUE's ids verbatim — it filters out ADDED external skills, not a
// marketplace's own. So on a private marketplace the keys are the org's, and
// `reportIssue` ends at Sentry through our own `/monitoring` tunnel.
describe("the unreadable-configuration door", () => {
  // A blob at the CURRENT version, which is the case `migrateConfig` never
  // sees: persist calls `migrate` only on a mismatch and hands everything else
  // straight to `merge`.
  const UNREADABLE_AT_THIS_VERSION = JSON.stringify({
    state: {
      stackId: null,
      skills: {
        [PRIVATE_CATALOG_SKILL]: {
          install: 7,
          scope: "project",
          assignments: {},
        },
      },
      remembered: {},
      agents: {},
    },
    version: 8,
  })

  // Asserted over the whole call log rather than over `issues`, because a check
  // on the reported field alone passes while the path leaks — the shape
  // `marketplace-store.test.ts` settled on for the same reason.
  it("names no skill of the marketplace's own in what it reports", async () => {
    await readingASlotHolding(UNREADABLE_AT_THIS_VERSION)

    expect(sink.issue).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(sink.issue.mock.calls)).not.toContain(
      PRIVATE_CATALOG_SKILL
    )
  })

  // Still worth reporting, and still worth locating: the top-level field and
  // the code say a saved configuration was lost and roughly where, which is the
  // whole reason this door is not silent.
  it("still says which field and which code", async () => {
    await readingASlotHolding(UNREADABLE_AT_THIS_VERSION)

    expect(sink.issue).toHaveBeenCalledWith(
      "Discarded unreadable saved configuration",
      expect.objectContaining({ issues: ["skills: invalid_value"] })
    )
  })
})

// The PRUNE door, and it is the one no `issue.path` grep can see: it reports a
// bare VALUE rather than a path, so the census that found the two joins above
// looks straight past it.
//
// A stack id is `matrixStackSchema.id` — as marketplace-owned as a skill id —
// and it reaches the same `/monitoring` tunnel. The blob below is a
// configuration saved on a marketplace and reopened with the vendored catalogue
// seated, which is what a visitor switching back does.
describe("the pruned-ids door", () => {
  const SAVED_ON_A_MARKETPLACE = JSON.stringify({
    state: {
      stackId: PRIVATE_CATALOG_STACK,
      skills: {},
      remembered: {},
      agents: {},
    },
    version: 8,
  })

  it("names no stack of the marketplace's own in what it reports", async () => {
    await readingASlotHolding(SAVED_ON_A_MARKETPLACE)

    expect(sink.issue).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(sink.issue.mock.calls)).not.toContain(
      PRIVATE_CATALOG_STACK
    )
  })

  // The whole signal survives the redaction: that a prune happened, how much it
  // took, and that a stack was among it. Only the org's word for the stack goes.
  it("still says a stack was dropped, and how many ids went with it", async () => {
    await readingASlotHolding(SAVED_ON_A_MARKETPLACE)

    expect(sink.issue).toHaveBeenCalledWith(
      "Pruned saved ids the catalog no longer knows",
      { droppedIds: 0, droppedStack: true }
    )
  })
})
