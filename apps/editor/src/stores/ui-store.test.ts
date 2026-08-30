import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ROSTER_GROUP_BYS,
  persistedUiSchema,
  type PersistedUi,
} from "./persisted-schema"

// localStorage is untrusted input and `merge` is the boundary that reads it —
// but unlike `config-store` and `marketplace-store`, this store reports
// NOTHING when the parse fails. So every failure here is silent in both
// directions: a required key added to the schema resets everyone's collapsed
// bands, and a version bump discards them, with nothing on screen and nothing
// in the console to say either happened.
//
// Nothing covered this module at all before, and nothing pinned the version.

const SLOT = "agents-inc:ui:v1"

// Exactly what `partialize` may write. Named and compared WHOLE rather than
// counted: a count cannot see a swap, and one arrangement field traded for
// another is precisely the change a length assertion sleeps through.
const PERSISTED_UI_KEYS = [
  "rosterCollapsed",
  "rosterGroupBy",
  "stackCollapsed",
] as const

// What a visitor who last used the app before the two new keys existed has in
// their slot. Their arrangement has to survive the upgrade untouched.
const BLOB_FROM_THE_PREVIOUS_SCHEMA = { rosterCollapsed: { web: true } }

/**
 * The store, created with a browser already standing.
 *
 * This slot takes zustand's DEFAULT storage — `createJSONStorage(() =>
 * window.localStorage)` — and resolves it once, at store creation. In node
 * there is no `window`, and persist then takes a branch that returns before
 * ever attaching `api.persist`: no version, no `partialize`, no `merge`, and
 * nothing below reachable. So the browser has to exist BEFORE the import,
 * which is what the stub and the dynamic import are for.
 *
 * The same arrangement `storeOnAWatchedSlot` uses in `config-store.test.ts`,
 * one slot over — and for the same stated reason.
 */
const uiStoreOnAStandingBrowser = async () => {
  const held = new Map<string, string>()

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => {
        held.set(key, value)
      },
      removeItem: (key: string) => {
        held.delete(key)
      },
    },
  })

  vi.resetModules()
  const { useUiStore } = await import("./ui-store")

  return useUiStore
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("the ui slot's persist options", () => {
  it("declares its slot, a version, a partialize and a merge", async () => {
    const store = await uiStoreOnAStandingBrowser()
    const options = store.persist.getOptions()

    expect(options.name).toBe(SLOT)
    expect(options.version).toBeTypeOf("number")
    expect(options.partialize).toBeTypeOf("function")
    expect(options.merge).toBeTypeOf("function")
  })

  // Pinned, and the pin is the whole enforcement of the "do not bump" ruling.
  // There is no `migrate` on this store, so a bump is not a migration — it is
  // an unreported discard of every visitor's arrangement at once.
  it("is version 3, and adding a field does not bump it", async () => {
    const store = await uiStoreOnAStandingBrowser()

    expect(store.persist.getOptions().version).toBe(3)
  })

  it("writes exactly the three arrangement fields", async () => {
    const store = await uiStoreOnAStandingBrowser()
    const written = store.persist.getOptions().partialize!(
      store.getInitialState()
    )

    expect(Object.keys(written).sort()).toStrictEqual(
      [...PERSISTED_UI_KEYS].sort()
    )
  })
})

describe("the ui slot's merge", () => {
  it("keeps a blob written before the two new keys existed", async () => {
    const store = await uiStoreOnAStandingBrowser()

    const merged = store.persist.getOptions().merge!(
      BLOB_FROM_THE_PREVIOUS_SCHEMA,
      store.getInitialState()
    )

    // The regression this whole section exists for: the collapsed bands are
    // the visitor's own arrangement and a new key must not cost them.
    expect(merged.rosterCollapsed).toStrictEqual({ web: true })
    expect(merged.rosterGroupBy).toBe("domain")
    expect(merged.stackCollapsed).toBe(false)
  })

  it("falls back one field at a time rather than discarding the blob", async () => {
    const store = await uiStoreOnAStandingBrowser()

    const merged = store.persist.getOptions().merge!(
      { ...BLOB_FROM_THE_PREVIOUS_SCHEMA, rosterGroupBy: "nonsense" },
      store.getInitialState()
    )

    expect(merged.rosterCollapsed).toStrictEqual({ web: true })
    expect(merged.rosterGroupBy).toBe("domain")
  })

  // The channel: an unreadable slot really does reach `merge` and really does
  // come back as the defaults, so the two assertions above are about the
  // schema rather than about `merge` refusing everything it is handed.
  it("falls back to the defaults on a wholly unreadable blob", async () => {
    const store = await uiStoreOnAStandingBrowser()

    const merged = store.persist.getOptions().merge!(
      "not an object at all",
      store.getInitialState()
    )

    expect(merged).toStrictEqual(store.getInitialState())
  })
})

describe("the ui slot's arrangement actions", () => {
  it("sets the grouping mode", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().setRosterGroupBy("scope")
    expect(store.getState().rosterGroupBy).toBe("scope")

    store.getState().setRosterGroupBy("domain")
    expect(store.getState().rosterGroupBy).toBe("domain")
  })

  it("toggles the stack header shut and back open", async () => {
    const store = await uiStoreOnAStandingBrowser()

    expect(store.getState().stackCollapsed).toBe(false)

    store.getState().toggleStackCollapsed()
    expect(store.getState().stackCollapsed).toBe(true)

    store.getState().toggleStackCollapsed()
    expect(store.getState().stackCollapsed).toBe(false)
  })

  // Two key spaces in one record, disjoint by construction: a domain id can
  // never contain a colon, so switching modes cannot collapse a band the
  // other mode's visitor never shut. Neither mode resets the other's keys.
  it("keeps each mode's collapsed keys in its own space", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().toggleRosterDomain("web")
    store.getState().setRosterGroupBy("scope")
    store.getState().toggleRosterDomain("scope:global")

    expect(store.getState().rosterCollapsed).toStrictEqual({
      web: true,
      "scope:global": true,
    })
  })
})

// `.catch()` rather than `.optional()`, so a MISSING key is filled in as well
// as an invalid one and the `{ ...current, ...parsed.data }` spread never
// depends on whether Zod omitted an absent optional.
describe("persistedUiSchema", () => {
  it("fills both new keys in from a blob that carries neither", () => {
    const parsed = persistedUiSchema.parse(BLOB_FROM_THE_PREVIOUS_SCHEMA)

    expect(parsed).toStrictEqual({
      rosterCollapsed: { web: true },
      rosterGroupBy: "domain",
      stackCollapsed: false,
    } satisfies PersistedUi)
  })

  it("catches an invalid grouping mode instead of failing the parse", () => {
    const parsed = persistedUiSchema.safeParse({
      rosterCollapsed: {},
      rosterGroupBy: "nonsense",
      stackCollapsed: "yes",
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data).toStrictEqual({
      rosterCollapsed: {},
      rosterGroupBy: "domain",
      stackCollapsed: false,
    } satisfies PersistedUi)
  })

  // The menu reads these members and the schema reads the same array, so the
  // two cannot disagree about what a mode is. Members, not a count — a count
  // cannot tell a rename from a swap.
  it("offers exactly the two grouping modes, in declaration order", () => {
    expect(ROSTER_GROUP_BYS).toStrictEqual(["domain", "scope"])
  })
})
