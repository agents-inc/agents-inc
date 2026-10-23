import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MarketplaceRecovery } from "@/features/configure/lib/seat-catalog"

import {
  ROSTER_GROUP_BYS,
  persistedUiSchema,
  type PersistedUi,
} from "./persisted-schema"

// Unlike `config-store`, this store reports nothing when the parse fails, so a
// required key or a version bump would silently reset every visitor's
// arrangement.

const SLOT = "agents-inc:ui:v1"

// Never bumped: nothing migrates a slot written at it.
const SLOT_VERSION = 3

// Exactly what the slot may hold.
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
const uiStoreOnAStandingBrowser = async (held = new Map<string, string>()) => {
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

const slotHolding = (state: unknown) =>
  new Map([[SLOT, JSON.stringify({ state, version: SLOT_VERSION })]])

const writtenTo = (held: ReadonlyMap<string, string>) =>
  JSON.parse(held.get(SLOT)!) as { state: object; version: number }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("what the ui slot holds", () => {
  it("is written under a key of its own", async () => {
    const held = new Map<string, string>()
    const store = await uiStoreOnAStandingBrowser(held)

    store.getState().setRosterGroupBy("scope")

    expect([...held.keys()]).toStrictEqual([SLOT])
  })

  it("is version 3, and adding a field does not bump it", async () => {
    const held = new Map<string, string>()
    const store = await uiStoreOnAStandingBrowser(held)

    store.getState().setRosterGroupBy("scope")

    expect(writtenTo(held).version).toBe(SLOT_VERSION)
  })

  it("is exactly the arrangement fields", async () => {
    const held = new Map<string, string>()
    const store = await uiStoreOnAStandingBrowser(held)

    store.getState().setRosterGroupBy("scope")

    expect(Object.keys(writtenTo(held).state).sort()).toStrictEqual(
      [...PERSISTED_UI_KEYS].sort()
    )
  })
})

describe("restoring the ui slot", () => {
  it("keeps a blob written before the two new keys existed", async () => {
    const store = await uiStoreOnAStandingBrowser(
      slotHolding(BLOB_FROM_THE_PREVIOUS_SCHEMA)
    )
    const restored = store.getState()

    expect(restored.rosterCollapsed).toStrictEqual({ web: true })
    expect(restored.rosterGroupBy).toBe("domain")
    expect(restored.stackCollapsed).toBe(false)
    expect(restored.providerCollapsed).toBe(false)
    expect(restored.agentsCollapsed).toBe(false)
  })

  it("falls back one field at a time rather than discarding the blob", async () => {
    const store = await uiStoreOnAStandingBrowser(
      slotHolding({
        ...BLOB_FROM_THE_PREVIOUS_SCHEMA,
        rosterGroupBy: "nonsense",
      })
    )

    expect(store.getState().rosterCollapsed).toStrictEqual({ web: true })
    expect(store.getState().rosterGroupBy).toBe("domain")
  })

  // `system` is the fallback too, so only these two show a choice surviving.
  it.each(["light", "dark"] as const)(
    "brings back the %s palette chosen before the reload",
    async (theme) => {
      const held = new Map<string, string>()
      const before = await uiStoreOnAStandingBrowser(held)
      before.getState().setTheme(theme)

      const reloaded = await uiStoreOnAStandingBrowser(held)

      expect(reloaded.getState().theme).toBe(theme)
    }
  )

  // The control: shows restoring does fall back, so the tests above are about
  // the schema rather than the slot being refused whole.
  it("falls back to the defaults on a wholly unreadable blob", async () => {
    const store = await uiStoreOnAStandingBrowser(
      slotHolding("not an object at all")
    )

    expect(store.getState()).toStrictEqual(store.getInitialState())
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
    const held = new Map<string, string>()
    const store = await uiStoreOnAStandingBrowser(held)

    store.getState().toggleSkillsCollapsed()

    expect(writtenTo(held).state).not.toHaveProperty("skillsCollapsed")
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

  it("reads a blank palette as none, so the page follows the machine", () => {
    const parsed = persistedUiSchema.parse({
      ...BLOB_FROM_THE_PREVIOUS_SCHEMA,
      theme: "",
    })

    expect(parsed.theme).toBe("system")
  })

  it("offers exactly the two grouping modes, in declaration order", () => {
    expect(ROSTER_GROUP_BYS).toStrictEqual(["domain", "scope"])
  })
})

// What the recovery dialog finishes with; the endings are the caller's.
const RECOVERY: MarketplaceRecovery = {
  marketplace: "github:acme/skills",
  failure: { kind: "unreachable", error: "acme/skills is unreachable" },
  onSeated: () => undefined,
}

describe("the ui store's transient actions", () => {
  it("opens one skill's options panel and closes it again", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().openPanel("web-framework-react")
    expect(store.getState().openPanelSkillId).toBe("web-framework-react")

    store.getState().openPanel(null)
    expect(store.getState().openPanelSkillId).toBeNull()
  })

  it("toggles a panel shut, and moves an open one to the skill pressed", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().togglePanel("web-framework-react")
    expect(store.getState().openPanelSkillId).toBe("web-framework-react")

    store.getState().togglePanel("web-styling-tailwind")
    expect(store.getState().openPanelSkillId).toBe("web-styling-tailwind")

    store.getState().togglePanel("web-styling-tailwind")
    expect(store.getState().openPanelSkillId).toBeNull()
  })

  it("holds a stack switch for confirmation until it is dismissed", async () => {
    const store = await uiStoreOnAStandingBrowser()
    const request = { kind: "stack", stackId: "nextjs-fullstack" } as const

    store.getState().requestStack(request)
    expect(store.getState().pendingStack).toStrictEqual(request)

    store.getState().dismissStackRequest()
    expect(store.getState().pendingStack).toBeNull()
  })

  it("holds a marketplace switch for confirmation until it is dismissed", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().requestMarketplace(RECOVERY.marketplace)
    expect(store.getState().pendingMarketplace).toBe(RECOVERY.marketplace)

    store.getState().dismissMarketplaceRequest()
    expect(store.getState().pendingMarketplace).toBeNull()
  })

  it("shows an added skill's contents and puts them away", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().previewSkill("external-web-styling-house-styles")
    expect(store.getState().previewSkillId).toBe(
      "external-web-styling-house-styles"
    )

    store.getState().previewSkill(null)
    expect(store.getState().previewSkillId).toBeNull()
  })

  it("remembers the output preview's open row", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().selectOutputNode("./.claude/agents/web-developer.md")

    expect(store.getState().outputSelection).toBe(
      "./.claude/agents/web-developer.md"
    )
  })

  it("sets the palette", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().setTheme("dark")

    expect(store.getState().theme).toBe("dark")
  })

  it("parks a marketplace that could not be seated behind its dialog, in one step", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().parkCatalogue(RECOVERY, "Waiting for acme/skills")

    const { marketplaceRecovery, catalogueNotice, dialog } = store.getState()
    expect({ marketplaceRecovery, catalogueNotice, dialog }).toStrictEqual({
      marketplaceRecovery: RECOVERY,
      catalogueNotice: "Waiting for acme/skills",
      dialog: "marketplace",
    })
  })

  // An outcome ends whatever was parked.
  it("says what the seat came to and lets the parked recovery go", async () => {
    const store = await uiStoreOnAStandingBrowser()
    store.getState().parkCatalogue(RECOVERY, "Waiting for acme/skills")

    store.getState().sayCatalogue("Loaded acme/skills")

    expect(store.getState().catalogueNotice).toBe("Loaded acme/skills")
    expect(store.getState().marketplaceRecovery).toBeNull()
  })
})

// How long the roster tints a sub-agent a selection reached.
const PULSE_MS = 2600

describe("the pulse through the roster", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("starts with nobody pulsing", async () => {
    const store = await uiStoreOnAStandingBrowser()

    expect(store.getState().flashedAgentIds).toStrictEqual([])
  })

  it("pulses the sub-agents it is given, then fades", async () => {
    const store = await uiStoreOnAStandingBrowser()

    store.getState().flashAgents(["web-developer", "pm"])
    expect(store.getState().flashedAgentIds).toStrictEqual([
      "web-developer",
      "pm",
    ])

    vi.advanceTimersByTime(PULSE_MS - 1)
    expect(store.getState().flashedAgentIds).toStrictEqual([
      "web-developer",
      "pm",
    ])

    vi.advanceTimersByTime(1)
    expect(store.getState().flashedAgentIds).toStrictEqual([])
  })

  it("lets a new pulse replace the last and run its own full length", async () => {
    const store = await uiStoreOnAStandingBrowser()
    store.getState().flashAgents(["web-developer"])
    vi.advanceTimersByTime(PULSE_MS - 100)

    store.getState().flashAgents(["pm"])
    vi.advanceTimersByTime(200)

    expect(store.getState().flashedAgentIds).toStrictEqual(["pm"])
  })

  it("stops a pulse at once when asked, so its fade cannot cut a later one short", async () => {
    const store = await uiStoreOnAStandingBrowser()
    store.getState().flashAgents(["web-developer"])

    store.getState().clearFlash()
    expect(store.getState().flashedAgentIds).toStrictEqual([])

    vi.advanceTimersByTime(PULSE_MS - 100)
    store.getState().flashAgents(["pm"])
    vi.advanceTimersByTime(200)
    expect(store.getState().flashedAgentIds).toStrictEqual(["pm"])
  })
})
