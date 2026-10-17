import {
  MATRIX_VERSION,
  SEED_VERSION,
  seedPayloadSchema,
  type SeedPayload,
} from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { readSavedStacks, useSavedStackStore } from "./saved-stack-store"

const SLOT = "agents-inc:saved-stacks:v1"
const RETIRED_SLOT = "agents-inc:saved-stack:v1"

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

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

const valid = (): SeedPayload => seedPayloadSchema.parse(payload())

const entry = (name: string, over: Record<string, unknown> = {}) => ({
  id: `id-${name}`,
  name,
  payload: payload(over),
})

const names = () => useSavedStackStore.getState().saves.map((s) => s.name)

// Persist resolves `window.localStorage` once, at store creation, so the
// browser has to stand before the import.
const storeOnABrowserHolding = async (held: Map<string, string>) => {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => held.set(key, value),
      removeItem: (key: string) => held.delete(key),
    },
  })

  vi.resetModules()
  const { useSavedStackStore: store } = await import("./saved-stack-store")
  return store
}

describe("readSavedStacks", () => {
  it("keeps every entry the contract recognises, in order", () => {
    const saves = [entry("B"), entry("A")]

    expect(readSavedStacks({ saves })).toStrictEqual(saves)
  })

  // Ids are the CLI's slugs; pruning them is `fromSeedPayload`'s job.
  it("keeps ids this catalog may no longer know", () => {
    const drifted = entry("A", {
      skills: {
        "skill-from-the-future": {
          install: "plugin",
          scope: "project",
          assignments: {},
        },
      },
    })

    expect(readSavedStacks({ saves: [drifted] })).toStrictEqual([drifted])
  })

  it("drops only the entry minted under an older contract", () => {
    const stale = entry("B", { v: SEED_VERSION - 1 })

    expect(
      readSavedStacks({ saves: [entry("C"), stale, entry("A")] })
    ).toStrictEqual([entry("C"), entry("A")])
  })

  it.each([
    ["an entry with no name", { id: "id-x", payload: payload() }],
    ["an entry with no id", { name: "X", payload: payload() }],
    ["an entry whose payload is not one", { ...entry("X"), payload: 7 }],
    ["a bare string", "a string"],
  ])("drops %s and keeps its neighbours", (_label, broken) => {
    expect(
      readSavedStacks({ saves: [entry("B"), broken, entry("A")] })
    ).toStrictEqual([entry("B"), entry("A")])
  })

  it.each([
    ["nothing at all", undefined],
    ["null", null],
    ["a slot that never held a list", {}],
    ["a list that is not one", { saves: "a string" }],
    ["the retired single slot's shape", { saved: payload() }],
  ])("reads %s as no saves", (_label, stored) => {
    expect(readSavedStacks(stored)).toStrictEqual([])
  })
})

describe("the saved stacks' slot", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("persists under a key of its own", async () => {
    const store = await storeOnABrowserHolding(new Map())

    expect(store.persist.getOptions().name).toBe(SLOT)
  })

  // The v1 slot is not read.
  it("ignores a stack under the retired single-slot key", async () => {
    const held = new Map([
      [
        RETIRED_SLOT,
        JSON.stringify({ state: { saved: payload() }, version: 0 }),
      ],
    ])

    const store = await storeOnABrowserHolding(held)

    expect(store.getState().saves).toStrictEqual([])
  })

  it("restores what it wrote", async () => {
    const held = new Map<string, string>()
    const writer = await storeOnABrowserHolding(held)
    writer.getState().save("Weekday", valid())
    const written = writer.getState().saves

    const reader = await storeOnABrowserHolding(held)

    expect(written.map((s) => s.name)).toStrictEqual(["Weekday"])
    expect(reader.getState().saves).toStrictEqual(written)
  })

  it("restores which saves it still owes the account", async () => {
    const held = new Map<string, string>()
    const writer = await storeOnABrowserHolding(held)
    writer.getState().save("Weekday", valid())
    const owed = writer.getState().saves.map((s) => s.id)
    writer.getState().setOwed(owed)

    const reader = await storeOnABrowserHolding(held)

    expect(reader.getState().owed).toStrictEqual(owed)
  })

  it("owes nothing when the slot never recorded it", async () => {
    const held = new Map([[SLOT, JSON.stringify({ state: { saves: [] } })]])

    const store = await storeOnABrowserHolding(held)

    expect(store.getState().owed).toStrictEqual([])
  })
})

describe("save", () => {
  beforeEach(() => {
    useSavedStackStore.setState({ saves: [] })
  })

  it("keeps every name, newest first", () => {
    useSavedStackStore.getState().save("A", valid())
    useSavedStackStore.getState().save("B", valid())

    expect(names()).toStrictEqual(["B", "A"])
  })

  it("answers ok with the entry it stored", () => {
    const saved = useSavedStackStore.getState().save("A", valid())

    expect(saved.ok).toBe(true)
    expect(useSavedStackStore.getState().saves[0]?.payload).toStrictEqual(
      payload()
    )
  })

  // An id derived from the name collides the moment names repeat.
  it("mints a fresh random id per save", () => {
    useSavedStackStore.getState().save("A", valid())
    useSavedStackStore.getState().save("B", valid())

    const [b, a] = useSavedStackStore.getState().saves
    expect(a?.id).toMatch(UUID)
    expect(b?.id).toMatch(UUID)
    expect(a?.id).not.toBe(b?.id)
  })

  it.each([
    ["in another case", "a"],
    ["padded", " B "],
  ])("refuses a name already saved %s, and writes nothing", (_label, name) => {
    useSavedStackStore.getState().save("A", valid())
    useSavedStackStore.getState().save("B", valid())

    const refused = useSavedStackStore.getState().save(name, valid())

    expect(refused.ok).toBe(false)
    expect(names()).toStrictEqual(["B", "A"])
  })
})
