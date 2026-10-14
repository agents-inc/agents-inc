import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ROSTER_GROUP_BYS,
  persistedUiSchema,
  type PersistedUi,
} from "./persisted-schema"

// Unlike `config-store`, this store reports nothing when the parse fails, so a
// required key or a version bump would silently reset every visitor's
// arrangement.

const SLOT = "agents-inc:ui:v1"

// Exactly what `partialize` may write.
const PERSISTED_UI_KEYS = [
  "agentsCollapsed",
  "providerCollapsed",
  "rosterCollapsed",
  "rosterGroupBy",
  "stackCollapsed",
  "theme",
] as const

// A slot written before the newer keys existed.
const BLOB_FROM_THE_PREVIOUS_SCHEMA = { rosterCollapsed: { web: true } }

/**
 * zustand resolves its default storage once, at store creation, and with no
 * `window` it never attaches `api.persist`. So the stub has to exist before
 * the dynamic import.
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

  // The only thing enforcing the store's "never bumped" rule.
  it("is version 3, and adding a field does not bump it", async () => {
    const store = await uiStoreOnAStandingBrowser()

    expect(store.persist.getOptions().version).toBe(3)
  })

  it("writes exactly the arrangement fields", async () => {
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

    expect(merged.rosterCollapsed).toStrictEqual({ web: true })
    expect(merged.rosterGroupBy).toBe("domain")
    expect(merged.stackCollapsed).toBe(false)
    expect(merged.providerCollapsed).toBe(false)
    expect(merged.agentsCollapsed).toBe(false)
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

  // The control: shows `merge` does fall back, so the tests above are about
  // the schema rather than `merge` refusing everything.
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

  const FOLDS = [
    ["providerCollapsed", "toggleProviderCollapsed"],
    ["stackCollapsed", "toggleStackCollapsed"],
    ["agentsCollapsed", "toggleAgentsCollapsed"],
    ["skillsCollapsed", "toggleSkillsCollapsed"],
  ] as const

  for (const [fold, toggle] of FOLDS) {
    it(`toggles ${fold} shut and back open`, async () => {
      const store = await uiStoreOnAStandingBrowser()
      const others = () =>
        FOLDS.filter(([other]) => other !== fold).map(
          ([other]) => store.getState()[other]
        )

      expect(store.getState()[fold]).toBe(false)

      store.getState()[toggle]()
      expect(store.getState()[fold]).toBe(true)
      expect(others()).toStrictEqual([false, false, false])

      store.getState()[toggle]()
      expect(store.getState()[fold]).toBe(false)
    })
  }

  it("keeps the skills fold out of storage", async () => {
    const store = await uiStoreOnAStandingBrowser()
    store.getState().toggleSkillsCollapsed()

    const written = store.persist.getOptions().partialize!(store.getState())

    expect(written).not.toHaveProperty("skillsCollapsed")
  })

  it("opens the save dialog like any other", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().setDialog("save")

    expect(store.getState().dialog).toBe("save")
  })

  it("toggles the output preview between fullscreen and back", async () => {
    const store = await uiStoreOnAStandingBrowser()

    expect(store.getState().outputFullscreen).toBe(false)

    store.getState().toggleOutputFullscreen()
    expect(store.getState().outputFullscreen).toBe(true)

    store.getState().toggleOutputFullscreen()
    expect(store.getState().outputFullscreen).toBe(false)
  })

  it("leaves fullscreen without asking what state it was in", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().exitOutputFullscreen()
    expect(store.getState().outputFullscreen).toBe(false)

    store.getState().toggleOutputFullscreen()
    store.getState().exitOutputFullscreen()
    expect(store.getState().outputFullscreen).toBe(false)
  })

  it("clamps the tree width to the bounds neither pane may leave", async () => {
    const store = await uiStoreOnAStandingBrowser()

    expect(store.getState().outputTreeWidth).toBe(250)

    store.getState().setOutputTreeWidth(320)
    expect(store.getState().outputTreeWidth).toBe(320)

    store.getState().setOutputTreeWidth(20)
    expect(store.getState().outputTreeWidth).toBe(180)

    store.getState().setOutputTreeWidth(2000)
    expect(store.getState().outputTreeWidth).toBe(560)
  })

  // Disjoint because a domain id never contains a colon.
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

// `.catch()` rather than `.optional()`, so a missing key is filled in as well
// as an invalid one.
describe("persistedUiSchema", () => {
  it("fills every new key in from a blob that carries none of them", () => {
    const parsed = persistedUiSchema.parse(BLOB_FROM_THE_PREVIOUS_SCHEMA)

    expect(parsed).toStrictEqual({
      rosterCollapsed: { web: true },
      rosterGroupBy: "domain",
      stackCollapsed: false,
      providerCollapsed: false,
      agentsCollapsed: false,
      theme: "system",
    } satisfies PersistedUi)
  })

  it("catches an invalid grouping mode instead of failing the parse", () => {
    const parsed = persistedUiSchema.safeParse({
      rosterCollapsed: {},
      rosterGroupBy: "nonsense",
      stackCollapsed: "yes",
      providerCollapsed: 1,
      agentsCollapsed: null,
      theme: "sepia",
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data).toStrictEqual({
      rosterCollapsed: {},
      rosterGroupBy: "domain",
      stackCollapsed: false,
      providerCollapsed: false,
      agentsCollapsed: false,
      theme: "system",
    } satisfies PersistedUi)
  })

  it("offers exactly the two grouping modes, in declaration order", () => {
    expect(ROSTER_GROUP_BYS).toStrictEqual(["domain", "scope"])
  })
})
