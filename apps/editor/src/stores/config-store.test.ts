import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_CATALOG,
  cliMintedPayload,
  cliMintedStackPayload,
  freshlyPickedSkill,
  projectMintedPayload,
  projectOwnSkill,
} from "@workspace/api-mocks/fixtures"
import { STACKS, type SeedPayload } from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  liveAssignment,
  offAssignment,
  persistedConfig,
  savedConfigBlob,
  skillCarriedBy,
  skillEntry,
} from "@/__tests__/factories/config-selection-factories"
import {
  HOUSE_SKILL_ID,
  houseSkill,
} from "@/__tests__/factories/external-skill-factories"
import { summarize } from "@/features/configure/lib/derive"
import { heldGlobalOf } from "@/features/configure/lib/held-global"
import { adoptSeedPayload, recogniseStack } from "@/features/configure/lib/seed"
import { setAnalyticsSink } from "@/lib/analytics/track"
import { toastManager } from "@/lib/toast"

import {
  freshEntry,
  isEjectOnly,
  stackSelection,
  unknownSavedIds,
  useConfigStore,
  withoutWrites,
  type ConfigState,
} from "./config-store"
import { useCatalogStore } from "./catalog-store"
import { useHeldGlobalStore } from "./held-global-store"

import type { ReportingSink } from "@/lib/observability/report"
import type { PersistStorage, StorageValue } from "zustand/middleware"

import {
  AGENT_MODELS,
  PERSIST_VERSION,
  isAgentOn,
  restingAgentOptions,
  type PersistedConfig,
} from "./persisted-schema"
import { useUiStore } from "./ui-store"

type Held = { stackId: string | null }

const SLOT = "agents-inc:config:v1"

// Bound rather than written out: a blob at any other version is discarded
// before `merge`, so a stale literal would pass against an empty store.
const HELD: StorageValue<Held> = {
  state: { stackId: "nextjs" },
  version: PERSIST_VERSION,
}
const OTHER: StorageValue<Held> = {
  state: { stackId: "remix" },
  version: PERSIST_VERSION,
}

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

// The slot a shared configuration runs on: read, never written.
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

  // `clearStorage` reaches this door rather than `setItem`.
  it("swallows a removal too", () => {
    const slot = watchedSlot()

    withoutWrites(slot.storage).removeItem(SLOT)

    expect(slot.removals).toStrictEqual([])
    expect(slot.held()).toStrictEqual(HELD)
  })

  it("leaves the slot it wraps able to write", () => {
    const slot = watchedSlot()

    withoutWrites(slot.storage).setItem(SLOT, OTHER)
    slot.storage.setItem(SLOT, OTHER)

    expect(slot.held()).toStrictEqual(OTHER)
  })
})

const KNOWN_SKILL = "web-framework-react"
const KNOWN_AGENT = "web-developer"
const UNKNOWN_SKILL = "acme-web-widgets"

// Unknown to the vendored catalogue because a marketplace owns it.
const PRIVATE_CATALOG_SKILL = UNKNOWN_SKILL
const PRIVATE_CATALOG_STACK = "acme-house-stack"

// Persist reads the slot once at module scope, so the browser stands before the
// import; in node every assertion would pass vacuously.
const storeOnAWatchedSlot = async () => {
  const held = new Map<string, string>()
  // This store's slot alone: the UI store persists beside it.
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
  const { readSavedConfig, useConfigStore: store } =
    await import("./config-store")
  // Nothing is written to a slot before it has been read.
  await readSavedConfig()

  return { store, writes }
}

// An action the catalogue refuses must not reach `set`, which writes.
describe("an action the catalogue refuses", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The control: without it the rest pass against a slot nothing writes to.
  it("writes the slot when the catalogue can place the skill", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store.getState().toggleSkill(KNOWN_SKILL)

    expect(writes).toHaveLength(1)
  })

  it("writes nothing for a skill the catalogue cannot place", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    const before = store.getState()

    store.getState().toggleSkill(UNKNOWN_SKILL)

    expect(writes).toStrictEqual([])
    expect(store.getState()).toBe(before)
  })

  // Not the scope a fresh entry starts with: the check for a press already in
  // effect would answer that one before the catalogue is asked.
  it("writes nothing for an option set on a skill it cannot place", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    const before = store.getState()

    store.getState().setSkillOption(UNKNOWN_SKILL, { scope: "project" })

    expect(writes).toStrictEqual([])
    expect(store.getState()).toBe(before)
  })

  it("writes nothing for a row no selected skill holds", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    const before = store.getState()

    store.getState().toggleAssignmentEnabled(KNOWN_SKILL, KNOWN_AGENT)

    expect(writes).toStrictEqual([])
    expect(store.getState()).toBe(before)
  })
})

// A project skill on a global sub-agent cannot be installed, but the store
// refuses none of the three ways in: `summarize` gates Install and Share on it.
describe("the scope rule in the store", () => {
  const asProject = () => {
    const store = useConfigStore.getState()
    store.reset()
    store.toggleSkill(KNOWN_SKILL)
    store.setSkillOption(KNOWN_SKILL, { scope: "project" })
  }

  const assignments = () =>
    useConfigStore.getState().skills[KNOWN_SKILL]?.assignments ?? {}

  const unresolved = () =>
    summarize(useConfigStore.getState()).unscopedAgentCount

  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("gives a freshly picked skill sub-agents to lose", () => {
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)

    expect(Object.keys(assignments()).length).toBeGreaterThan(0)
    expect(unresolved()).toBe(0)
  })

  it("keeps every assignment when the skill moves to project", () => {
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)
    const before = assignments()

    useConfigStore.getState().setSkillOption(KNOWN_SKILL, { scope: "project" })

    expect(assignments()).toStrictEqual(before)
    expect(unresolved()).toBeGreaterThan(0)
  })

  it("keeps them when the sub-agent moves to global instead", () => {
    asProject()
    useConfigStore.getState().setAgentOption(KNOWN_AGENT, { scope: "project" })
    const before = assignments()

    useConfigStore.getState().setAgentOption(KNOWN_AGENT, { scope: "global" })

    expect(assignments()).toStrictEqual(before)
  })

  it("clears one sub-agent per scope word, from the sub-agent's side", () => {
    asProject()
    expect(isAgentOn(useConfigStore.getState(), KNOWN_AGENT)).toBe(true)
    const before = unresolved()
    expect(before).toBeGreaterThan(1)

    useConfigStore.getState().setAgentOption(KNOWN_AGENT, { scope: "project" })

    expect(isAgentOn(useConfigStore.getState(), KNOWN_AGENT)).toBe(true)
    expect(unresolved()).toBe(before - 1)
  })

  it("clears every sub-agent at once from the skill's side", () => {
    asProject()
    expect(unresolved()).toBeGreaterThan(1)

    useConfigStore.getState().setSkillOption(KNOWN_SKILL, { scope: "global" })

    expect(unresolved()).toBe(0)
  })

  it("assigns a project skill to a sub-agent resting at global", () => {
    asProject()
    // One the auto-assignment rule did not reach.
    const unassigned = "api-tester"
    expect(assignments()[unassigned]).toBeUndefined()

    useConfigStore.getState().cycleAssignment(KNOWN_SKILL, unassigned)

    expect(assignments()[unassigned]).toStrictEqual(liveAssignment("lazy"))
  })

  it("cycles an erroring row like any other", () => {
    asProject()
    const before = assignments()[KNOWN_AGENT]!

    useConfigStore.getState().cycleAssignment(KNOWN_SKILL, KNOWN_AGENT)

    expect(assignments()[KNOWN_AGENT]).not.toStrictEqual(before)
  })

  it("assigns freely once the sub-agent is pinned to the project", () => {
    asProject()
    useConfigStore.getState().setAgentOption("api-tester", { scope: "project" })

    useConfigStore.getState().cycleAssignment(KNOWN_SKILL, "api-tester")

    expect(assignments()["api-tester"]).toStrictEqual(liveAssignment("lazy"))
  })
})

// On Codex no unselected plugin skill rests at project. Only remembered
// plugin+project entries move; nothing moves back.
describe("remembered project plugins on Codex", () => {
  const EXCLUSIVE_SIBLING = "web-framework-vue-composition-api"
  const PLUGIN_PROJECT = "web-styling-tailwind"
  const EJECT_PROJECT = "web-styling-cva"
  const PLUGIN_GLOBAL = "web-state-zustand"

  const assigned = { assignments: { [KNOWN_AGENT]: liveAssignment() } }
  const pluginProject = skillEntry({ scope: "project", ...assigned })

  const rememberedScope = (skillId: string) =>
    useConfigStore.getState().remembered[skillId]?.scope

  afterEach(() => {
    useConfigStore.getState().reset()
    useUiStore.getState().setProvider("claude")
    vi.unstubAllGlobals()
  })

  it("moves only remembered plugin+project entries to global", () => {
    const before = persistedConfig({
      skills: { [KNOWN_SKILL]: pluginProject },
      remembered: {
        [PLUGIN_PROJECT]: pluginProject,
        [EJECT_PROJECT]: skillEntry({
          install: "eject",
          scope: "project",
          ...assigned,
        }),
        [PLUGIN_GLOBAL]: skillEntry(assigned),
      },
    })
    useConfigStore.getState().applySavedStack(before)

    useConfigStore.getState().moveRememberedPluginsToGlobal()

    const { skills, remembered } = useConfigStore.getState()
    expect(skills).toStrictEqual(before.skills)
    expect(remembered).toStrictEqual({
      ...before.remembered,
      [PLUGIN_PROJECT]: { ...pluginProject, scope: "global" },
    })
  })

  // The control: without it the next spec passes against a slot nothing writes
  // to.
  it("writes the slot when a remembered plugin moves to global", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store
      .getState()
      .applySavedStack(
        persistedConfig({ remembered: { [PLUGIN_PROJECT]: pluginProject } })
      )
    expect(writes).toHaveLength(1)

    store.getState().moveRememberedPluginsToGlobal()

    expect(writes).toHaveLength(2)
  })

  // `set` is what writes the slot, so a switch that moves nothing skips it.
  it("leaves the state untouched when no remembered plugin is at project", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().applySavedStack(
      persistedConfig({
        skills: { [KNOWN_SKILL]: pluginProject },
        remembered: {
          [EJECT_PROJECT]: skillEntry({
            install: "eject",
            scope: "project",
            ...assigned,
          }),
          [PLUGIN_GLOBAL]: skillEntry(assigned),
        },
      })
    )
    expect(writes).toHaveLength(1)
    const before = store.getState()

    before.moveRememberedPluginsToGlobal()

    expect(writes).toHaveLength(1)
    expect(store.getState()).toBe(before)
  })

  it("sets a skill deselected on Codex aside at global", () => {
    useConfigStore
      .getState()
      .applySavedStack(
        persistedConfig({ skills: { [KNOWN_SKILL]: pluginProject } })
      )
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)
    expect(rememberedScope(KNOWN_SKILL)).toBe("project")
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)

    useUiStore.getState().setProvider("codex")
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)

    expect(rememberedScope(KNOWN_SKILL)).toBe("global")
  })

  // An eviction is a deselection the visitor did not click.
  it("sets an exclusive sibling evicted on Codex aside at global", () => {
    useConfigStore
      .getState()
      .applySavedStack(
        persistedConfig({ skills: { [KNOWN_SKILL]: pluginProject } })
      )
    useConfigStore.getState().toggleSkill(EXCLUSIVE_SIBLING)
    expect(rememberedScope(KNOWN_SKILL)).toBe("project")
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)

    useUiStore.getState().setProvider("codex")
    useConfigStore.getState().toggleSkill(EXCLUSIVE_SIBLING)

    expect(rememberedScope(KNOWN_SKILL)).toBe("global")
  })
})

// Like `model`, only a non-resting choice is stored, and `inherit` is where it
// rests.
describe("a sub-agent's Codex model", () => {
  const PIN = "gpt-5.6-sol"

  const agentEntry = () => useConfigStore.getState().agents[KNOWN_AGENT]

  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("is stored beside the Claude pin", () => {
    const resting = restingAgentOptions(KNOWN_AGENT).model
    const claudePin = AGENT_MODELS.find((model) => model !== resting)!

    useConfigStore.getState().setAgentOption(KNOWN_AGENT, { model: claudePin })
    useConfigStore.getState().setAgentOption(KNOWN_AGENT, { codexModel: PIN })

    expect(agentEntry()).toStrictEqual({ model: claudePin, codexModel: PIN })
  })

  it("loses its key when set back to inherit", () => {
    useConfigStore
      .getState()
      .setAgentOption(KNOWN_AGENT, { codexModel: PIN, effort: "high" })
    expect(agentEntry()?.codexModel).toBe(PIN)

    useConfigStore
      .getState()
      .setAgentOption(KNOWN_AGENT, { codexModel: "inherit" })

    expect(agentEntry()).toStrictEqual({ effort: "high" })
  })

  it("drops an entry left saying nothing", () => {
    useConfigStore.getState().setAgentOption(KNOWN_AGENT, { codexModel: PIN })
    expect(agentEntry()).toBeDefined()

    useConfigStore
      .getState()
      .setAgentOption(KNOWN_AGENT, { codexModel: "inherit" })

    expect(agentEntry()).toBeUndefined()
  })
})

// Pressing the control already in effect must not reach `set`, which writes.
describe("setAgentOption", () => {
  const resting = restingAgentOptions(KNOWN_AGENT)
  const otherModel = AGENT_MODELS.find((model) => model !== resting.model)!

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The control: without it the rest pass against a slot nothing writes to.
  it("writes the slot when the pick changes", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store.getState().setAgentOption(KNOWN_AGENT, { model: otherModel })

    expect(writes).toHaveLength(1)
  })

  it.each([
    ["model", { model: resting.model }],
    ["scope", { scope: resting.scope }],
    ["effort", { effort: resting.effort }],
    ["Codex model", { codexModel: resting.codexModel }],
  ] as const)("writes nothing for the resting %s", async (_label, patch) => {
    const { store, writes } = await storeOnAWatchedSlot()
    const before = store.getState()

    store.getState().setAgentOption(KNOWN_AGENT, patch)

    expect(writes).toStrictEqual([])
    expect(store.getState()).toBe(before)
  })

  it.each([
    ["model", { model: otherModel }],
    ["scope", { scope: "project" }],
    ["Codex model", { codexModel: "gpt-5.6-terra" }],
  ] as const)(
    "writes nothing for a %s already stored",
    async (_label, patch) => {
      const { store, writes } = await storeOnAWatchedSlot()
      store.getState().setAgentOption(KNOWN_AGENT, patch)
      expect(writes).toHaveLength(1)
      const before = store.getState()

      store.getState().setAgentOption(KNOWN_AGENT, patch)

      expect(writes).toHaveLength(1)
      expect(store.getState()).toBe(before)
    }
  )

  it("writes when one field of the patch changes", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store
      .getState()
      .setAgentOption(KNOWN_AGENT, { model: resting.model, effort: "high" })

    expect(writes).toHaveLength(1)
  })
})

// The same rule for a skill. Configuring never selects, so an unselected skill
// has options in effect too: the ones its panel draws.
describe("setSkillOption", () => {
  const untouched = freshEntry(KNOWN_SKILL)

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The controls: without them the rest pass against a slot nothing writes to.
  it("writes the slot when a selected skill's pick changes", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().toggleSkill(KNOWN_SKILL)
    expect(writes).toHaveLength(1)

    store.getState().setSkillOption(KNOWN_SKILL, { scope: "project" })

    expect(writes).toHaveLength(2)
  })

  it("writes the slot when an unselected skill's pick changes", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store.getState().setSkillOption(KNOWN_SKILL, { install: "eject" })

    expect(writes).toHaveLength(1)
  })

  it.each([
    ["install mode", { install: untouched.install }],
    ["scope", { scope: untouched.scope }],
  ] as const)(
    "writes nothing for the %s a selected skill starts with",
    async (_label, patch) => {
      const { store, writes } = await storeOnAWatchedSlot()
      store.getState().toggleSkill(KNOWN_SKILL)
      expect(writes).toHaveLength(1)
      const before = store.getState()

      store.getState().setSkillOption(KNOWN_SKILL, patch)

      expect(writes).toHaveLength(1)
      expect(store.getState()).toBe(before)
    }
  )

  it.each([
    ["install mode", { install: untouched.install }],
    ["scope", { scope: untouched.scope }],
  ] as const)(
    "writes nothing for the %s an unselected skill starts with",
    async (_label, patch) => {
      const { store, writes } = await storeOnAWatchedSlot()
      const before = store.getState()

      store.getState().setSkillOption(KNOWN_SKILL, patch)

      expect(writes).toStrictEqual([])
      expect(store.getState()).toBe(before)
    }
  )

  it.each([
    ["install mode", { install: "eject" }],
    ["scope", { scope: "project" }],
  ] as const)(
    "writes nothing for the %s a selected skill already has",
    async (_label, patch) => {
      const { store, writes } = await storeOnAWatchedSlot()
      store.getState().toggleSkill(KNOWN_SKILL)
      store.getState().setSkillOption(KNOWN_SKILL, patch)
      expect(writes).toHaveLength(2)
      const before = store.getState()

      store.getState().setSkillOption(KNOWN_SKILL, patch)

      expect(writes).toHaveLength(2)
      expect(store.getState()).toBe(before)
    }
  )

  it.each([
    ["install mode", { install: "eject" }],
    ["scope", { scope: "project" }],
  ] as const)(
    "writes nothing for the %s an unselected skill already remembers",
    async (_label, patch) => {
      const { store, writes } = await storeOnAWatchedSlot()
      store.getState().setSkillOption(KNOWN_SKILL, patch)
      expect(writes).toHaveLength(1)
      const before = store.getState()

      store.getState().setSkillOption(KNOWN_SKILL, patch)

      expect(writes).toHaveLength(1)
      expect(store.getState()).toBe(before)
    }
  )

  it("writes when one field of the patch changes", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().toggleSkill(KNOWN_SKILL)
    expect(writes).toHaveLength(1)

    store.getState().setSkillOption(KNOWN_SKILL, {
      install: untouched.install,
      scope: "project",
    })

    expect(writes).toHaveLength(2)
  })
})

// A prune that drops nothing must not reach `set`, which writes.
describe("pruneToCatalog", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The control: without it the rest pass against a slot nothing writes to.
  it("writes the slot when the prune drops something", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().importConfig(
      persistedConfig({
        skills: {
          [UNKNOWN_SKILL]: skillEntry(),
          [KNOWN_SKILL]: skillEntry(),
        },
      })
    )
    expect(writes).toHaveLength(1)

    store.getState().pruneToCatalog()

    expect(writes).toHaveLength(2)
  })

  it("leaves the state untouched when the catalogue can place everything", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().toggleSkill(KNOWN_SKILL)
    expect(writes).toHaveLength(1)
    const before = store.getState()

    before.pruneToCatalog()

    expect(writes).toHaveLength(1)
    expect(store.getState()).toBe(before)
  })

  it("leaves an empty configuration untouched", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    const before = store.getState()

    before.pruneToCatalog()

    expect(writes).toStrictEqual([])
    expect(store.getState()).toBe(before)
  })
})

// What a prune cost, named for the person whose configuration came back
// smaller: the same three places `unknownPayloadIds` names.
describe("unknownSavedIds", () => {
  it("names the skill the catalogue could not place", () => {
    const before = persistedConfig({
      skills: { "acme-web-widgets": skillEntry(), react: skillEntry() },
    })

    expect(
      unknownSavedIds(
        before,
        persistedConfig({ skills: { react: skillEntry() } })
      )
    ).toStrictEqual(["acme-web-widgets"])
  })

  it("names a dropped agent and a dropped stack too", () => {
    const before = persistedConfig({
      stackId: "acme-house-stack",
      agents: { "acme-runner": {} },
    })

    expect(unknownSavedIds(before, persistedConfig())).toStrictEqual([
      "acme-runner",
      "acme-house-stack",
    ])
  })

  it("answers with nothing when the prune dropped nothing", () => {
    const kept = persistedConfig({
      stackId: "nextjs",
      skills: { react: skillEntry() },
    })

    expect(unknownSavedIds(kept, kept)).toStrictEqual([])
  })

  // A remembered setup was never going to be applied, so its loss shows nowhere.
  it("leaves a dropped remembered setup unnamed", () => {
    const before = persistedConfig({
      remembered: { "acme-web-widgets": skillEntry() },
    })

    expect(unknownSavedIds(before, persistedConfig())).toStrictEqual([])
  })
})

const sink = {
  issue: vi.fn<ReportingSink["issue"]>(),
  error: vi.fn<ReportingSink["error"]>(),
}

const readingASlotHolding = async (blob: string) => {
  const held = new Map([[SLOT, blob]])

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => held.get(key) ?? null,
      setItem: (key: string, value: string) => held.set(key, value),
      removeItem: (key: string) => held.delete(key),
    },
  })

  // After the reset: the store gets a fresh `report.ts`, so the sink has to
  // be installed on that copy. The reset also reseats the vendored catalogue.
  vi.resetModules()
  const { setReportingSink } = await import("@/lib/observability/report")
  setReportingSink(sink)

  const { readSavedConfig, useConfigStore: store } =
    await import("./config-store")
  await readSavedConfig()
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// A marketplace's keys are the org's, and the report ends at Sentry, so it
// names the field and the code and nothing deeper.
describe("the unreadable-configuration door", () => {
  // Current version, so `migrateConfig` never sees it; one field unparseable.
  const UNREADABLE_AT_THIS_VERSION = savedConfigBlob({
    ...persistedConfig(),
    skills: {
      [PRIVATE_CATALOG_SKILL]: {
        ...skillEntry({ scope: "project" }),
        install: 7,
      },
    },
  })

  it("names no skill of the marketplace's own in what it reports", async () => {
    await readingASlotHolding(UNREADABLE_AT_THIS_VERSION)

    expect(sink.issue).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(sink.issue.mock.calls)).not.toContain(
      PRIVATE_CATALOG_SKILL
    )
  })

  it("still says which field and which code", async () => {
    await readingASlotHolding(UNREADABLE_AT_THIS_VERSION)

    expect(sink.issue).toHaveBeenCalledWith(
      "Discarded unreadable saved configuration",
      expect.objectContaining({ issues: ["skills: invalid_value"] })
    )
  })
})

// The prune reports a value rather than a path, and a stack id is the org's too.
describe("the pruned-ids door", () => {
  const SAVED_ON_A_MARKETPLACE = savedConfigBlob(
    persistedConfig({ stackId: PRIVATE_CATALOG_STACK })
  )

  it("names no stack of the marketplace's own in what it reports", async () => {
    await readingASlotHolding(SAVED_ON_A_MARKETPLACE)

    expect(sink.issue).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(sink.issue.mock.calls)).not.toContain(
      PRIVATE_CATALOG_STACK
    )
  })

  it("still says a stack was dropped, and how many ids went with it", async () => {
    await readingASlotHolding(SAVED_ON_A_MARKETPLACE)

    expect(sink.issue).toHaveBeenCalledWith(
      "Pruned saved ids the catalog no longer knows",
      { droppedIds: 0, droppedStack: true }
    )
  })
})

// A saved configuration holding the bad pair arrives intact and stops being
// installable, rather than losing the assignment on the way in.
describe("a saved configuration holding the bad pair", () => {
  const HOLDS_A_PROJECT_SKILL_ON_A_GLOBAL_AGENT = savedConfigBlob(
    persistedConfig({
      skills: {
        [KNOWN_SKILL]: skillEntry({
          scope: "project",
          assignments: { [KNOWN_AGENT]: liveAssignment("preloaded") },
        }),
      },
    })
  )

  it("keeps the assignment rather than dropping it on the way in", async () => {
    const store = await readingASlotHolding(
      HOLDS_A_PROJECT_SKILL_ON_A_GLOBAL_AGENT
    )

    expect(store.getState().skills[KNOWN_SKILL]?.assignments).toStrictEqual({
      [KNOWN_AGENT]: liveAssignment("preloaded"),
    })
  })

  it("arrives as an error to resolve rather than as an absence", async () => {
    const store = await readingASlotHolding(
      HOLDS_A_PROJECT_SKILL_ON_A_GLOBAL_AGENT
    )

    expect(isAgentOn(store.getState(), KNOWN_AGENT)).toBe(true)
    expect(summarize(store.getState()).unscopedAgentCount).toBe(1)
  })
})

const EXCLUSIVE_SIBLING = "web-framework-vue-composition-api"
const OTHER_CATEGORY_SKILL = "web-styling-tailwind"
const OTHER_AGENT = "api-tester"
const STACK_ID = STACKS[0]!.id

// Applied wholesale, so each spec states its own starting selection.
const startingFrom = (config: Parameters<typeof persistedConfig>[0]) => {
  useConfigStore.getState().applySavedStack(persistedConfig(config))
}

const held = () => useConfigStore.getState()

describe("picking a skill whose category takes one", () => {
  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("sets aside only the sibling it replaces, keeping a skill of another category", () => {
    const configured = skillEntry({
      assignments: { [KNOWN_AGENT]: liveAssignment() },
    })
    startingFrom({
      skills: { [KNOWN_SKILL]: configured, [OTHER_CATEGORY_SKILL]: configured },
    })

    useConfigStore.getState().toggleSkill(EXCLUSIVE_SIBLING)

    expect(Object.keys(held().skills)).toStrictEqual([
      OTHER_CATEGORY_SKILL,
      EXCLUSIVE_SIBLING,
    ])
    expect(held().remembered).toStrictEqual({ [KNOWN_SKILL]: configured })
  })
})

describe("deselecting a skill", () => {
  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("keeps the setup of a skill that reached a sub-agent", () => {
    const configured = skillEntry({
      assignments: { [KNOWN_AGENT]: liveAssignment() },
    })
    startingFrom({ skills: { [KNOWN_SKILL]: configured } })

    useConfigStore.getState().toggleSkill(KNOWN_SKILL)

    expect(held().remembered).toStrictEqual({ [KNOWN_SKILL]: configured })
  })

  // Restoring it would equal picking it fresh, so there is nothing to keep.
  it("forgets a skill left as a fresh pick of it would start, minus its sub-agents", () => {
    startingFrom({ skills: { [KNOWN_SKILL]: skillEntry() } })

    useConfigStore.getState().toggleSkill(KNOWN_SKILL)

    expect(held().skills).toStrictEqual({})
    expect(held().remembered).toStrictEqual({})
  })
})

// A third-party skill always installs as a copy: a plugin would serve their
// repository without our metadata.
describe("an added skill's install mode", () => {
  const events: unknown[] = []

  beforeEach(() => {
    useCatalogStore.getState().addExternal([houseSkill()])
    setAnalyticsSink((event) => events.push(event))
  })

  afterEach(() => {
    useConfigStore.getState().reset()
    useCatalogStore.getState().reset()
    setAnalyticsSink(() => undefined)
    events.length = 0
  })

  it("counts an added skill as eject-only and a catalogue skill as not", () => {
    expect(isEjectOnly(HOUSE_SKILL_ID)).toBe(true)
    expect(isEjectOnly(KNOWN_SKILL)).toBe(false)
  })

  it("starts an added skill as eject and a catalogue skill as a plugin", () => {
    expect(freshEntry(HOUSE_SKILL_ID).install).toBe("eject")
    expect(freshEntry(KNOWN_SKILL).install).toBe("plugin")
  })

  it("keeps an added skill at eject when plugin is asked for, and says so", () => {
    useConfigStore.getState().toggleSkill(HOUSE_SKILL_ID)

    useConfigStore
      .getState()
      .setSkillOption(HOUSE_SKILL_ID, { install: "plugin" })

    expect(held().skills[HOUSE_SKILL_ID]?.install).toBe("eject")
    expect(
      events.filter(
        (event) => (event as { name: string }).name === "skill_configured"
      )
    ).toStrictEqual([
      {
        name: "skill_configured",
        skillId: HOUSE_SKILL_ID,
        field: "install",
        value: "eject",
      },
    ])
  })

  it("passes any other option on an added skill through untouched", () => {
    useConfigStore.getState().toggleSkill(HOUSE_SKILL_ID)

    useConfigStore
      .getState()
      .setSkillOption(HOUSE_SKILL_ID, { scope: "project" })

    expect(
      events.filter(
        (event) => (event as { name: string }).name === "skill_configured"
      )
    ).toStrictEqual([
      {
        name: "skill_configured",
        skillId: HOUSE_SKILL_ID,
        field: "scope",
        value: "project",
      },
    ])
  })

  it("lets a catalogue skill go back from eject to plugin", () => {
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)
    useConfigStore.getState().setSkillOption(KNOWN_SKILL, { install: "eject" })

    useConfigStore.getState().setSkillOption(KNOWN_SKILL, { install: "plugin" })

    expect(held().skills[KNOWN_SKILL]?.install).toBe("plugin")
  })
})

describe("the pulse a selection sends through the roster", () => {
  const pulsing = () => useUiStore.getState().flashedAgentIds

  afterEach(() => {
    useConfigStore.getState().reset()
    useUiStore.getState().clearFlash()
  })

  it("pulses every sub-agent a picked skill reaches", () => {
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)

    expect(pulsing()).toStrictEqual(
      Object.keys(freshEntry(KNOWN_SKILL).assignments)
    )
  })

  it("leaves out a row the roster switched off when a set-aside skill comes back", () => {
    startingFrom({
      remembered: {
        [KNOWN_SKILL]: skillEntry({
          assignments: {
            [KNOWN_AGENT]: liveAssignment(),
            [OTHER_AGENT]: offAssignment(),
          },
        }),
      },
    })

    useConfigStore.getState().toggleSkill(KNOWN_SKILL)

    expect(pulsing()).toStrictEqual([KNOWN_AGENT])
  })

  // Whatever was pulsing belonged to the selection being replaced.
  it.each([
    ["applying a stack", () => useConfigStore.getState().applyStack(STACK_ID)],
    ["starting from scratch", () => useConfigStore.getState().applyStack(null)],
    [
      "applying a saved stack",
      () => useConfigStore.getState().applySavedStack(persistedConfig()),
    ],
    [
      "importing a shared configuration",
      () => useConfigStore.getState().importConfig(persistedConfig()),
    ],
    [
      "pruning to the catalogue",
      () => useConfigStore.getState().pruneToCatalog(),
    ],
    ["resetting", () => useConfigStore.getState().reset()],
  ])("stops on %s", (_label, replace) => {
    useUiStore.getState().flashAgents([KNOWN_AGENT])

    replace()

    expect(pulsing()).toStrictEqual([])
  })
})

describe("replacing the whole selection", () => {
  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("empties it on Start from scratch", () => {
    useConfigStore.getState().applyStack(STACK_ID)
    expect(held().stackId).toBe(STACK_ID)

    useConfigStore.getState().applyStack(null)

    expect({
      stackId: held().stackId,
      skills: held().skills,
      remembered: held().remembered,
      agents: held().agents,
    }).toStrictEqual(persistedConfig())
  })

  it("takes a shared configuration as it arrives", () => {
    const shared = persistedConfig({
      stackId: STACK_ID,
      skills: { [KNOWN_SKILL]: skillEntry() },
    })

    useConfigStore.getState().importConfig(shared)

    expect(held().stackId).toBe(STACK_ID)
    expect(held().skills).toStrictEqual(shared.skills)
  })
})

// What `applyStack` writes, so a stack recognised elsewhere opens as applied.
describe("stackSelection", () => {
  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("is the selection applying the stack leaves", () => {
    useConfigStore.getState().applyStack(STACK_ID)
    const { stackId, skills, remembered, agents, description } = held()

    expect(stackSelection(STACK_ID)).toStrictEqual({
      stackId,
      skills,
      remembered,
      agents,
      description,
    })
  })

  it("names nothing for a stack the catalogue does not carry", () => {
    expect(stackSelection("retired-stack")).toBeUndefined()
  })
})

const selectionOf = (state: PersistedConfig) => ({
  stackId: state.stackId,
  skills: state.skills,
  remembered: state.remembered,
  agents: state.agents,
  description: state.description,
})

// Applying the selection already in effect must not reach `set`, which writes.
// The grid can ask it to: under a save of a stack, the save's cell is the lit
// one and the stack's can still be pressed.
describe("applyStack", () => {
  const OTHER_STACK_ID = STACKS[1]!.id

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The controls: without them the rest pass against a slot nothing writes to.
  it("writes the slot when a different stack is applied", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().applyStack(STACK_ID)
    expect(writes).toHaveLength(1)

    store.getState().applyStack(OTHER_STACK_ID)

    expect(writes).toHaveLength(2)
    expect(selectionOf(store.getState())).toStrictEqual(
      stackSelection(OTHER_STACK_ID)
    )
  })

  // Each leaves the stack's id in place, and the last two its skills and pins
  // as well, so only the whole selection tells them from the stack's.
  it.each([
    [
      "a skill picked on top of it",
      (store: typeof useConfigStore) =>
        store.getState().toggleSkill(OTHER_CATEGORY_SKILL),
    ],
    [
      "a skill set aside",
      (store: typeof useConfigStore) => {
        store.getState().toggleSkill(OTHER_CATEGORY_SKILL)
        store
          .getState()
          .setSkillOption(OTHER_CATEGORY_SKILL, { scope: "project" })
        store.getState().toggleSkill(OTHER_CATEGORY_SKILL)
      },
    ],
    [
      "a description of its own",
      (store: typeof useConfigStore) =>
        store.getState().importConfig({
          ...stackSelection(STACK_ID)!,
          description: "The house web app, as installed.",
        }),
    ],
  ])(
    "writes the slot when the stack is applied over %s",
    async (_label, departFromIt) => {
      const { store, writes } = await storeOnAWatchedSlot()
      store.getState().applyStack(STACK_ID)
      departFromIt(store)
      const written = writes.length

      store.getState().applyStack(STACK_ID)

      expect(writes).toHaveLength(written + 1)
      expect(selectionOf(store.getState())).toStrictEqual(
        stackSelection(STACK_ID)
      )
    }
  )

  it("writes nothing for the stack already in effect", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().applyStack(STACK_ID)
    expect(writes).toHaveLength(1)
    const before = store.getState()

    store.getState().applyStack(STACK_ID)

    expect(writes).toHaveLength(1)
    expect(store.getState()).toBe(before)
  })

  // The link's global skill stays beside the stack's, so what is in effect is
  // the stack as the link keeps it, not the stack's own selection.
  it("writes nothing for the stack already in effect inside a project's link", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    const { useHeldGlobalStore: heldGlobal } =
      await import("./held-global-store")
    const payload = projectMintedPayload({
      [OTHER_CATEGORY_SKILL]: freshlyPickedSkill(OTHER_CATEGORY_SKILL),
    })
    const opened = recogniseStack(payload, adoptSeedPayload(payload))
    store.getState().importConfig(opened)
    heldGlobal.getState().hold(heldGlobalOf(payload, opened))
    store.getState().applyStack(STACK_ID)
    expect(writes).toHaveLength(2)
    expect(Object.keys(store.getState().skills)).toContain(OTHER_CATEGORY_SKILL)
    const before = store.getState()

    store.getState().applyStack(STACK_ID)

    expect(writes).toHaveLength(2)
    expect(store.getState()).toBe(before)
  })

  it("writes the slot on Start from scratch over a selection", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().toggleSkill(KNOWN_SKILL)
    expect(writes).toHaveLength(1)

    store.getState().applyStack(null)

    expect(writes).toHaveLength(2)
    expect(selectionOf(store.getState())).toStrictEqual({
      ...persistedConfig(),
      description: undefined,
    })
  })

  it("writes nothing on Start from scratch with nothing selected", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    const before = store.getState()

    store.getState().applyStack(null)

    expect(writes).toStrictEqual([])
    expect(store.getState()).toBe(before)
  })
})

// The same rule for a save. Each application is handed a fresh copy, as each
// read of a save adopts one, so only its value says it is already in effect.
describe("applySavedStack", () => {
  const saved = () =>
    persistedConfig({
      skills: { [KNOWN_SKILL]: skillCarriedBy([KNOWN_AGENT]) },
    })
  const otherSaved = () =>
    persistedConfig({
      skills: { [OTHER_CATEGORY_SKILL]: skillCarriedBy([KNOWN_AGENT]) },
    })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // The controls: without them the rest pass against a slot nothing writes to.
  it("writes the slot when a different saved stack is applied", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().applySavedStack(saved())
    expect(writes).toHaveLength(1)

    store.getState().applySavedStack(otherSaved())

    expect(writes).toHaveLength(2)
    expect(selectionOf(store.getState())).toStrictEqual({
      ...otherSaved(),
      description: undefined,
    })
  })

  // The last two leave the save's skills and pins as they were, so only the
  // whole selection tells them from the save.
  it.each([
    [
      "a skill picked on top of it",
      (store: typeof useConfigStore) =>
        store.getState().toggleSkill(OTHER_CATEGORY_SKILL),
    ],
    [
      "a skill set aside",
      (store: typeof useConfigStore) => {
        store.getState().toggleSkill(OTHER_CATEGORY_SKILL)
        store
          .getState()
          .setSkillOption(OTHER_CATEGORY_SKILL, { scope: "project" })
        store.getState().toggleSkill(OTHER_CATEGORY_SKILL)
      },
    ],
    [
      "a description of its own",
      (store: typeof useConfigStore) =>
        store.getState().importConfig({
          ...saved(),
          description: "The house web app, as installed.",
        }),
    ],
  ])(
    "writes the slot when the saved stack is applied over %s",
    async (_label, departFromIt) => {
      const { store, writes } = await storeOnAWatchedSlot()
      store.getState().applySavedStack(saved())
      departFromIt(store)
      const written = writes.length

      store.getState().applySavedStack(saved())

      expect(writes).toHaveLength(written + 1)
      expect(selectionOf(store.getState())).toStrictEqual({
        ...saved(),
        description: undefined,
      })
    }
  )

  it("writes nothing for the saved stack already in effect", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    store.getState().applySavedStack(saved())
    expect(writes).toHaveLength(1)
    const before = store.getState()

    store.getState().applySavedStack(saved())

    expect(writes).toHaveLength(1)
    expect(store.getState()).toBe(before)
  })

  // As for a stack: what is in effect is the save as the link keeps it.
  it("writes nothing for the saved stack already in effect inside a project's link", async () => {
    const { store, writes } = await storeOnAWatchedSlot()
    const { useHeldGlobalStore: heldGlobal } =
      await import("./held-global-store")
    const payload = projectMintedPayload({
      [OTHER_CATEGORY_SKILL]: freshlyPickedSkill(OTHER_CATEGORY_SKILL),
    })
    const opened = recogniseStack(payload, adoptSeedPayload(payload))
    store.getState().importConfig(opened)
    heldGlobal.getState().hold(heldGlobalOf(payload, opened))
    store.getState().applySavedStack(saved())
    expect(writes).toHaveLength(2)
    expect(Object.keys(store.getState().skills)).toStrictEqual([
      KNOWN_SKILL,
      OTHER_CATEGORY_SKILL,
    ])
    const before = store.getState()

    store.getState().applySavedStack(saved())

    expect(writes).toHaveLength(2)
    expect(store.getState()).toBe(before)
  })
})

type ConfigAction = Exclude<keyof ConfigState, keyof PersistedConfig>

type SecondCall =
  // Returns before `set`, which writes, once its input is in effect.
  | "writes nothing"
  // A toggle, cycle or flip: pressed again, it changes the selection again.
  | "changes it again"
  // Its next state is its argument alone, so the return is not owed: that is
  // for an action computing its next state from the current one.
  | "sets it from its argument"

type SecondCallRow = {
  secondCall: SecondCall
  // What the store holds first, so the first call is a change.
  arrange?: (store: typeof useConfigStore) => void
  apply: (store: typeof useConfigStore) => void
}

// Every action the store hands out, by what a second call with the same input
// does. Typed by the store's actions, and held against them below at runtime.
const SECOND_CALLS: Record<ConfigAction, SecondCallRow> = {
  applyStack: {
    secondCall: "writes nothing",
    apply: (store) => store.getState().applyStack(STACK_ID),
  },
  applySavedStack: {
    secondCall: "writes nothing",
    apply: (store) =>
      store.getState().applySavedStack(
        persistedConfig({
          skills: { [KNOWN_SKILL]: skillCarriedBy([KNOWN_AGENT]) },
        })
      ),
  },
  setSkillOption: {
    secondCall: "writes nothing",
    apply: (store) =>
      store.getState().setSkillOption(KNOWN_SKILL, { scope: "project" }),
  },
  setAgentOption: {
    secondCall: "writes nothing",
    apply: (store) =>
      store.getState().setAgentOption(KNOWN_AGENT, { effort: "high" }),
  },
  moveRememberedPluginsToGlobal: {
    secondCall: "writes nothing",
    arrange: (store) =>
      store.getState().applySavedStack(
        persistedConfig({
          remembered: {
            [OTHER_CATEGORY_SKILL]: skillEntry({
              scope: "project",
              assignments: { [KNOWN_AGENT]: liveAssignment() },
            }),
          },
        })
      ),
    apply: (store) => store.getState().moveRememberedPluginsToGlobal(),
  },
  pruneToCatalog: {
    secondCall: "writes nothing",
    // The slot never holds an unknown skill, so the stack is what it loses.
    arrange: (store) =>
      store.getState().importConfig(
        persistedConfig({
          stackId: PRIVATE_CATALOG_STACK,
          skills: {
            [UNKNOWN_SKILL]: skillEntry(),
            [KNOWN_SKILL]: skillEntry(),
          },
        })
      ),
    apply: (store) => store.getState().pruneToCatalog(),
  },
  toggleSkill: {
    secondCall: "changes it again",
    apply: (store) => store.getState().toggleSkill(KNOWN_SKILL),
  },
  toggleSkills: {
    secondCall: "changes it again",
    apply: (store) =>
      store.getState().toggleSkills([KNOWN_SKILL, OTHER_CATEGORY_SKILL]),
  },
  cycleAssignment: {
    secondCall: "changes it again",
    arrange: (store) => store.getState().toggleSkill(KNOWN_SKILL),
    apply: (store) =>
      store.getState().cycleAssignment(KNOWN_SKILL, OTHER_AGENT),
  },
  toggleAssignmentEnabled: {
    secondCall: "changes it again",
    arrange: (store) => store.getState().toggleSkill(KNOWN_SKILL),
    apply: (store) =>
      store.getState().toggleAssignmentEnabled(KNOWN_SKILL, KNOWN_AGENT),
  },
  flipAssignmentLoad: {
    secondCall: "changes it again",
    arrange: (store) => store.getState().toggleSkill(KNOWN_SKILL),
    apply: (store) =>
      store.getState().flipAssignmentLoad(KNOWN_SKILL, KNOWN_AGENT),
  },
  toggleAgentPin: {
    secondCall: "changes it again",
    apply: (store) => store.getState().toggleAgentPin(KNOWN_AGENT),
  },
  importConfig: {
    secondCall: "sets it from its argument",
    apply: (store) =>
      store
        .getState()
        .importConfig(
          persistedConfig({ skills: { [KNOWN_SKILL]: skillEntry() } })
        ),
  },
  reset: {
    secondCall: "sets it from its argument",
    apply: (store) => store.getState().reset(),
  },
}

const actionsOf = (state: object) =>
  Object.entries(state)
    .filter(([, value]) => typeof value === "function")
    .map(([action]) => action)
    .sort()

const whose = (secondCall: SecondCall) =>
  Object.entries(SECOND_CALLS).filter(
    ([, row]) => row.secondCall === secondCall
  )

describe("an action given the same input twice", () => {
  // The watched store is a fresh import, with its own copy of `track`.
  const storeOnAWatchedSlotAndSink = async () => {
    const watched = await storeOnAWatchedSlot()
    const { setAnalyticsSink: listen } = await import("@/lib/analytics/track")
    const events: unknown[] = []
    listen((event) => events.push(event))

    return { ...watched, events }
  }

  // A stack applied inside a project's link, whose global skill the link keeps.
  const holdingAStackInsideALink = async (store: typeof useConfigStore) => {
    const { useHeldGlobalStore: heldGlobal } =
      await import("./held-global-store")
    const payload = projectMintedPayload({
      [OTHER_CATEGORY_SKILL]: freshlyPickedSkill(OTHER_CATEGORY_SKILL),
    })
    const opened = recogniseStack(payload, adoptSeedPayload(payload))
    store.getState().importConfig(opened)
    heldGlobal.getState().hold(heldGlobalOf(payload, opened))
    store.getState().applyStack(STACK_ID)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("has a row for every action the store hands out, and for no other", () => {
    expect(actionsOf(useConfigStore.getState())).toStrictEqual(
      Object.keys(SECOND_CALLS).sort()
    )
  })

  // The control: the census above sees an action that has no row.
  it("notices an action that has no row", () => {
    const grown = {
      ...useConfigStore.getState(),
      renameSelection: () => undefined,
    }

    expect(actionsOf(grown)).toStrictEqual(
      [...Object.keys(SECOND_CALLS), "renameSelection"].sort()
    )
  })

  // The control: "reports nothing" needs a sink the watched store calls.
  it("hears what the watched store reports", async () => {
    const { store, events } = await storeOnAWatchedSlotAndSink()

    store.getState().applyStack(STACK_ID)

    expect(events).toStrictEqual([{ name: "stack_applied", stackId: STACK_ID }])
  })

  it.each(whose("writes nothing"))(
    "%s writes nothing and reports nothing the second time",
    async (_action, { arrange, apply }) => {
      const { store, writes, events } = await storeOnAWatchedSlotAndSink()
      arrange?.(store)
      const arranged = writes.length
      // The control: the first call is a change, and the slot takes it.
      apply(store)
      expect(writes).toHaveLength(arranged + 1)
      const written = [...writes]
      const reported = [...events]
      const before = store.getState()

      apply(store)

      expect(writes).toStrictEqual(written)
      expect(store.getState()).toBe(before)
      expect(events).toStrictEqual(reported)
    }
  )

  it.each(whose("changes it again"))(
    "%s changes the selection again the second time",
    async (_action, { arrange, apply }) => {
      const { store, writes } = await storeOnAWatchedSlot()
      arrange?.(store)
      apply(store)
      const written = writes.length
      const first = selectionOf(store.getState())

      apply(store)

      expect(selectionOf(store.getState())).not.toStrictEqual(first)
      expect(writes.length).toBeGreaterThan(written)
    }
  )

  it.each(whose("sets it from its argument"))(
    "%s leaves the same selection whatever it is applied over",
    async (_action, { apply }) => {
      const overNothing = await storeOnAWatchedSlot()
      apply(overNothing.store)
      const fromNothing = selectionOf(overNothing.store.getState())

      const { store } = await storeOnAWatchedSlot()
      await holdingAStackInsideALink(store)
      expect(store.getState().stackId).toBe(STACK_ID)
      expect(Object.keys(store.getState().skills)).toContain(
        OTHER_CATEGORY_SKILL
      )

      apply(store)

      expect(selectionOf(store.getState())).toStrictEqual(fromNothing)
    }
  )
})

// The configuration's own words, which `init --from` writes into config.ts.
describe("the description a configuration carries", () => {
  const DESCRIPTION = "The house web app, as installed."

  const described = () =>
    persistedConfig({
      skills: { [KNOWN_SKILL]: skillEntry() },
      description: DESCRIPTION,
    })

  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("arrives with a shared configuration", () => {
    useConfigStore.getState().importConfig(described())

    expect(held().description).toBe(DESCRIPTION)
  })

  it("arrives with a saved stack", () => {
    useConfigStore.getState().applySavedStack(described())

    expect(held().description).toBe(DESCRIPTION)
  })

  it("stays through an edit to the selection", () => {
    useConfigStore.getState().importConfig(described())

    useConfigStore.getState().toggleSkill(OTHER_CATEGORY_SKILL)

    expect(held().description).toBe(DESCRIPTION)
  })

  it.each([
    ["applying a stack", () => useConfigStore.getState().applyStack(STACK_ID)],
    ["Start from scratch", () => useConfigStore.getState().applyStack(null)],
    [
      "a configuration arriving without one",
      () => useConfigStore.getState().importConfig(persistedConfig()),
    ],
    [
      "a saved stack without one",
      () => useConfigStore.getState().applySavedStack(persistedConfig()),
    ],
  ])("goes with %s", (_label, replace) => {
    useConfigStore.getState().importConfig(described())

    replace()

    expect(held().description).toBeUndefined()
  })

  it("is kept in this browser's slot and read back", async () => {
    const first = await readingASlot(null)
    await first.readSavedConfig()
    first.useConfigStore.getState().applySavedStack(described())

    const second = await readingASlot(first.writes.at(-1)!)
    await second.readSavedConfig()

    expect(second.useConfigStore.getState().description).toBe(DESCRIPTION)
  })
})

// empty → lazy → preloaded → empty; a switched-off row counts as empty.
describe("cycling a sub-agent's cell", () => {
  const cellAfterOneCycle = (start: ReturnType<typeof liveAssignment>) => {
    startingFrom({
      skills: {
        [KNOWN_SKILL]: skillEntry({ assignments: { [KNOWN_AGENT]: start } }),
      },
    })
    useConfigStore.getState().cycleAssignment(KNOWN_SKILL, KNOWN_AGENT)
    return held().skills[KNOWN_SKILL]?.assignments
  }

  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("re-enables a switched-off row at lazy", () => {
    expect(cellAfterOneCycle(offAssignment("preloaded"))).toStrictEqual({
      [KNOWN_AGENT]: liveAssignment("lazy"),
    })
  })

  it("moves a lazy row to preloaded", () => {
    expect(cellAfterOneCycle(liveAssignment("lazy"))).toStrictEqual({
      [KNOWN_AGENT]: liveAssignment("preloaded"),
    })
  })

  it("empties a preloaded row", () => {
    expect(cellAfterOneCycle(liveAssignment("preloaded"))).toStrictEqual({})
  })
})

// Configuring never selects: the options wait in `remembered`.
describe("an option set on a skill nobody selected", () => {
  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("is kept for when the skill is picked, without picking it", () => {
    useConfigStore.getState().setSkillOption(KNOWN_SKILL, { scope: "project" })

    expect(held().skills).toStrictEqual({})
    expect(held().remembered).toStrictEqual({
      [KNOWN_SKILL]: { ...freshEntry(KNOWN_SKILL), scope: "project" },
    })
  })
})

describe("a row the roster holds", () => {
  const rowAfter = (
    start: ReturnType<typeof liveAssignment>,
    change: "toggleAssignmentEnabled" | "flipAssignmentLoad"
  ) => {
    startingFrom({
      skills: {
        [KNOWN_SKILL]: skillEntry({ assignments: { [KNOWN_AGENT]: start } }),
      },
    })
    useConfigStore.getState()[change](KNOWN_SKILL, KNOWN_AGENT)
    return held().skills[KNOWN_SKILL]?.assignments
  }

  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("switches off, keeping its load", () => {
    expect(
      rowAfter(liveAssignment("preloaded"), "toggleAssignmentEnabled")
    ).toStrictEqual({ [KNOWN_AGENT]: offAssignment("preloaded") })
  })

  it("switches back on, keeping its load", () => {
    expect(
      rowAfter(offAssignment("preloaded"), "toggleAssignmentEnabled")
    ).toStrictEqual({ [KNOWN_AGENT]: liveAssignment("preloaded") })
  })

  it("flips from lazy to preloaded", () => {
    expect(
      rowAfter(liveAssignment("lazy"), "flipAssignmentLoad")
    ).toStrictEqual({ [KNOWN_AGENT]: liveAssignment("preloaded") })
  })

  it("flips from preloaded to lazy", () => {
    expect(
      rowAfter(liveAssignment("preloaded"), "flipAssignmentLoad")
    ).toStrictEqual({ [KNOWN_AGENT]: liveAssignment("lazy") })
  })
})

describe("the toast a change to the selection raises", () => {
  const TESTER = "web-tester"
  const TESTER_OFF = "web tester switched off: Tailwind CSS removed"
  const HONO = "api-framework-hono"

  const raised = vi.spyOn(toastManager, "add")
  const said = () => raised.mock.calls.map(([toast]) => toast.title)

  const testerCarryingTailwind = (load: "lazy" | "preloaded" = "lazy") =>
    startingFrom({
      skills: { [OTHER_CATEGORY_SKILL]: skillCarriedBy([TESTER], load) },
    })

  afterEach(() => {
    useConfigStore.getState().reset()
    raised.mockClear()
  })

  it("names the sub-agents a picked skill switched on", () => {
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)

    expect(said()).toStrictEqual([
      "web developer, web researcher, web tester and 2 more switched on: React added",
    ])
  })

  it("names a sub-agent whose last skill was deselected, and why", () => {
    testerCarryingTailwind()

    useConfigStore.getState().toggleSkill(OTHER_CATEGORY_SKILL)

    expect(said()).toStrictEqual([TESTER_OFF])
  })

  it("says the same when the roster takes the skill off the sub-agent", () => {
    testerCarryingTailwind()

    useConfigStore
      .getState()
      .toggleAssignmentEnabled(OTHER_CATEGORY_SKILL, TESTER)

    expect(said()).toStrictEqual([TESTER_OFF])
  })

  it("says the same when the options panel empties the sub-agent's cell", () => {
    testerCarryingTailwind("preloaded")

    useConfigStore.getState().cycleAssignment(OTHER_CATEGORY_SKILL, TESTER)

    expect(said()).toStrictEqual([TESTER_OFF])
  })

  it("says nothing when the roster switches the sub-agent's row back on", () => {
    startingFrom({
      skills: {
        [OTHER_CATEGORY_SKILL]: skillEntry({
          assignments: { [TESTER]: offAssignment() },
        }),
      },
    })
    expect(isAgentOn(held(), TESTER)).toBe(false)

    useConfigStore
      .getState()
      .toggleAssignmentEnabled(OTHER_CATEGORY_SKILL, TESTER)

    expect(isAgentOn(held(), TESTER)).toBe(true)
    expect(said()).toStrictEqual([])
  })

  it("says nothing when the options panel fills the sub-agent's empty cell", () => {
    startingFrom({ skills: { [OTHER_CATEGORY_SKILL]: skillEntry() } })
    expect(isAgentOn(held(), TESTER)).toBe(false)

    useConfigStore.getState().cycleAssignment(OTHER_CATEGORY_SKILL, TESTER)

    expect(isAgentOn(held(), TESTER)).toBe(true)
    expect(said()).toStrictEqual([])
  })

  it("says nothing when the sub-agent itself is clicked off", () => {
    testerCarryingTailwind()

    useConfigStore.getState().toggleAgentPin(TESTER)

    expect(isAgentOn(held(), TESTER)).toBe(false)
    expect(said()).toStrictEqual([])
  })

  it("keeps a stack's sub-agent on, saying nothing, when its last skill goes", () => {
    useConfigStore.getState().applyStack(STACK_ID)
    const carried = Object.entries(held().skills)
      .filter(([, entry]) => entry.assignments[KNOWN_AGENT]?.enabled)
      .map(([skillId]) => skillId)
    expect(carried).not.toStrictEqual([])

    for (const skillId of carried)
      useConfigStore.getState().toggleAssignmentEnabled(skillId, KNOWN_AGENT)

    expect(isAgentOn(held(), KNOWN_AGENT)).toBe(true)
    expect(said()).toStrictEqual([])
  })

  it("says it once for a batch the composer applies", () => {
    useConfigStore.getState().toggleSkills([KNOWN_SKILL, HONO])

    expect(said()).toStrictEqual([
      "web developer, web researcher, web tester and 5 more switched on: React and Hono added",
    ])
  })

  // Whoever switched it on, a link or a click.
  describe("for a sub-agent whose last skill goes", () => {
    const API_DEV = "api-developer"
    const HONO_OFF =
      "api developer, api researcher, api tester and 2 more switched off: Hono removed"
    const API_DEV_OFF = "api developer switched off: Hono removed"

    // As the editor opens a link: adopted, recognised, its global entries held.
    const opening = (payload: SeedPayload) => {
      const opened = recogniseStack(payload, adoptSeedPayload(payload))
      useConfigStore.getState().importConfig(opened)
      useHeldGlobalStore.getState().hold(heldGlobalOf(payload, opened))
      raised.mockClear()
    }

    // `share` run inside a project: its own sub-agents, and no mark.
    const sharedFromAProject = () => {
      const { fromProject: _unmarked, ...shared } = projectMintedPayload(
        { [HONO]: projectOwnSkill([API_DEV]) },
        [API_DEV]
      )
      return shared
    }

    const madeInAProject = () =>
      projectMintedPayload(
        {
          [KNOWN_SKILL]: freshlyPickedSkill(KNOWN_SKILL),
          [HONO]: projectOwnSkill([API_DEV]),
        },
        [API_DEV]
      )

    afterEach(() => {
      useHeldGlobalStore.getState().release()
    })

    it("goes off with the toast on a link the CLI minted from a global install", () => {
      opening(cliMintedPayload({ [HONO]: freshlyPickedSkill(HONO) }))
      expect(isAgentOn(held(), API_DEV)).toBe(true)

      useConfigStore.getState().toggleSkill(HONO)

      expect(isAgentOn(held(), API_DEV)).toBe(false)
      expect(said()).toStrictEqual([HONO_OFF])
    })

    it("goes off with the toast on a link shared from a project", () => {
      opening(sharedFromAProject())
      expect(isAgentOn(held(), API_DEV)).toBe(true)

      useConfigStore.getState().toggleSkill(HONO)

      expect(isAgentOn(held(), API_DEV)).toBe(false)
      expect(said()).toStrictEqual([API_DEV_OFF])
    })

    it("comes back with its skill, keeping its other choices", () => {
      opening(sharedFromAProject())
      useConfigStore.getState().toggleSkill(HONO)

      expect(held().agents[API_DEV]).toStrictEqual({ scope: "project" })

      useConfigStore.getState().toggleSkill(HONO)

      expect(isAgentOn(held(), API_DEV)).toBe(true)
    })

    it("goes off with the toast on a link a bare edit made inside a project", () => {
      opening(madeInAProject())
      expect(isAgentOn(held(), API_DEV)).toBe(true)

      useConfigStore.getState().toggleSkill(HONO)

      expect(isAgentOn(held(), API_DEV)).toBe(false)
      expect(said()).toStrictEqual([API_DEV_OFF])
    })

    // Moved to project, its rows change; the global install still holds it.
    it("stays on, saying nothing, where the project's link holds it", () => {
      opening(madeInAProject())
      useConfigStore
        .getState()
        .setAgentOption(KNOWN_AGENT, { scope: "project" })

      useConfigStore
        .getState()
        .toggleAssignmentEnabled(KNOWN_SKILL, KNOWN_AGENT)

      expect(
        held().skills[KNOWN_SKILL]?.assignments[KNOWN_AGENT]?.enabled
      ).toBe(false)
      expect(isAgentOn(held(), KNOWN_AGENT)).toBe(true)
      expect(said()).toStrictEqual([])
    })

    it("goes off with the toast when the roster takes it off a link the CLI minted", () => {
      opening(
        cliMintedPayload({
          [OTHER_CATEGORY_SKILL]: freshlyPickedSkill(OTHER_CATEGORY_SKILL),
        })
      )

      useConfigStore
        .getState()
        .toggleAssignmentEnabled(OTHER_CATEGORY_SKILL, TESTER)

      expect(isAgentOn(held(), TESTER)).toBe(false)
      expect(said()).toStrictEqual([TESTER_OFF])
    })

    it("goes off with the toast when the options panel empties its cell on a link the CLI minted", () => {
      opening(
        cliMintedPayload({ [KNOWN_SKILL]: freshlyPickedSkill(KNOWN_SKILL) })
      )
      expect(
        held().skills[KNOWN_SKILL]?.assignments[KNOWN_AGENT]
      ).toStrictEqual(liveAssignment("preloaded"))

      useConfigStore.getState().cycleAssignment(KNOWN_SKILL, KNOWN_AGENT)

      expect(isAgentOn(held(), KNOWN_AGENT)).toBe(false)
      expect(said()).toStrictEqual([
        "web developer switched off: React removed",
      ])
    })

    it("goes off with the toast when it was clicked on", () => {
      useConfigStore.getState().toggleAgentPin(TESTER)
      useConfigStore.getState().toggleSkill(OTHER_CATEGORY_SKILL)
      raised.mockClear()

      useConfigStore.getState().toggleSkill(OTHER_CATEGORY_SKILL)

      expect(isAgentOn(held(), TESTER)).toBe(false)
      expect(said()).toStrictEqual([
        "web developer, web researcher, web tester and 2 more switched off: Tailwind CSS removed",
      ])
    })

    it("stays off, saying nothing, when it was clicked off and its last skill goes and comes back", () => {
      testerCarryingTailwind()
      useConfigStore.getState().toggleAgentPin(TESTER)
      useConfigStore.getState().toggleSkill(OTHER_CATEGORY_SKILL)
      raised.mockClear()

      useConfigStore.getState().toggleSkill(OTHER_CATEGORY_SKILL)

      expect(held().agents[TESTER]).toStrictEqual({ on: false })
      expect(isAgentOn(held(), TESTER)).toBe(false)
      expect(said()).toStrictEqual([])
    })

    it("stays on when it was clicked on and never held a skill", () => {
      useConfigStore.getState().toggleAgentPin(TESTER)
      useConfigStore.getState().toggleSkill(HONO)
      raised.mockClear()

      useConfigStore.getState().toggleSkill(HONO)

      expect(isAgentOn(held(), TESTER)).toBe(true)
      expect(said()).toStrictEqual([HONO_OFF])
    })

    it("stays on, saying nothing, on a link that is a built-in stack", () => {
      opening(cliMintedStackPayload(STACK_ID))
      expect(held().stackId).toBe(STACK_ID)
      const carried = Object.entries(held().skills)
        .filter(([, entry]) => entry.assignments[KNOWN_AGENT]?.enabled)
        .map(([skillId]) => skillId)
      expect(carried).not.toStrictEqual([])

      for (const skillId of carried)
        useConfigStore.getState().toggleAssignmentEnabled(skillId, KNOWN_AGENT)

      expect(isAgentOn(held(), KNOWN_AGENT)).toBe(true)
      expect(said()).toStrictEqual([])
    })
  })
})

// Only a non-resting choice is stored; a pin is kept whatever it says.
describe("a sub-agent's stored choices", () => {
  const resting = restingAgentOptions(KNOWN_AGENT)
  const otherModel = AGENT_MODELS.find((model) => model !== resting.model)!

  const storedFor = () => held().agents[KNOWN_AGENT]

  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("stores a model and nothing beside it", () => {
    useConfigStore.getState().setAgentOption(KNOWN_AGENT, { model: otherModel })

    expect(storedFor()).toStrictEqual({ model: otherModel })
  })

  it("keeps a pin beside a choice made after it", () => {
    useConfigStore.getState().toggleAgentPin(KNOWN_AGENT)

    useConfigStore.getState().setAgentOption(KNOWN_AGENT, { model: otherModel })

    expect(storedFor()).toStrictEqual({ on: true, model: otherModel })
  })

  it("keeps a choice beside a pin made after it", () => {
    useConfigStore.getState().setAgentOption(KNOWN_AGENT, { model: otherModel })

    useConfigStore.getState().toggleAgentPin(KNOWN_AGENT)

    expect(storedFor()).toStrictEqual({ model: otherModel, on: true })
  })

  it.each([
    ["model", { model: otherModel }, { model: resting.model }],
    ["effort", { effort: "high" }, { effort: resting.effort }],
    ["scope", { scope: "project" }, { scope: resting.scope }],
  ] as const)(
    "loses the %s once it is set back to where it rests",
    (_label, chosen, back) => {
      useConfigStore.getState().setAgentOption(KNOWN_AGENT, chosen)
      expect(storedFor()).toStrictEqual(chosen)

      useConfigStore.getState().setAgentOption(KNOWN_AGENT, back)

      expect(storedFor()).toBeUndefined()
    }
  )
})

describe("what the store tells analytics", () => {
  const events: unknown[] = []

  beforeEach(() => {
    setAnalyticsSink((event) => events.push(event))
  })

  afterEach(() => {
    useConfigStore.getState().reset()
    setAnalyticsSink(() => undefined)
    events.length = 0
  })

  it("reports each option a skill was given as its own event", () => {
    useConfigStore
      .getState()
      .setSkillOption(KNOWN_SKILL, { scope: "project", install: "eject" })

    expect(events).toStrictEqual([
      {
        name: "skill_configured",
        skillId: KNOWN_SKILL,
        field: "scope",
        value: "project",
      },
      {
        name: "skill_configured",
        skillId: KNOWN_SKILL,
        field: "install",
        value: "eject",
      },
    ])
  })

  it("reports the option a press changed on a selected skill", () => {
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)
    const before = [...events]

    useConfigStore.getState().setSkillOption(KNOWN_SKILL, { scope: "project" })

    expect(events).toStrictEqual([
      ...before,
      {
        name: "skill_configured",
        skillId: KNOWN_SKILL,
        field: "scope",
        value: "project",
      },
    ])
  })

  it("reports nothing for the option a selected skill already has", () => {
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)
    const before = [...events]

    useConfigStore
      .getState()
      .setSkillOption(KNOWN_SKILL, { scope: freshEntry(KNOWN_SKILL).scope })

    expect(events).toStrictEqual(before)
  })

  it("reports nothing for the option an unselected skill starts with", () => {
    useConfigStore
      .getState()
      .setSkillOption(KNOWN_SKILL, { install: freshEntry(KNOWN_SKILL).install })

    expect(events).toStrictEqual([])
  })

  // As for an option: a press that changes nothing is not reported.
  it("reports the stack a press applies", () => {
    useConfigStore.getState().applyStack(STACK_ID)

    expect(events).toStrictEqual([{ name: "stack_applied", stackId: STACK_ID }])
  })

  it("reports Start from scratch over a selection", () => {
    useConfigStore.getState().toggleSkill(KNOWN_SKILL)
    const before = [...events]

    useConfigStore.getState().applyStack(null)

    expect(events).toStrictEqual([
      ...before,
      { name: "stack_applied", stackId: null },
    ])
  })

  it("reports nothing for the stack already in effect", () => {
    useConfigStore.getState().applyStack(STACK_ID)
    const before = [...events]

    useConfigStore.getState().applyStack(STACK_ID)

    expect(events).toStrictEqual(before)
  })

  it("reports nothing for Start from scratch with nothing selected", () => {
    useConfigStore.getState().applyStack(null)

    expect(events).toStrictEqual([])
  })

  it("reports each choice made for a sub-agent as its own event", () => {
    useConfigStore
      .getState()
      .setAgentOption(KNOWN_AGENT, { effort: "high", scope: "project" })

    expect(events).toStrictEqual([
      {
        name: "agent_configured",
        agentId: KNOWN_AGENT,
        field: "effort",
        value: "high",
      },
      {
        name: "agent_configured",
        agentId: KNOWN_AGENT,
        field: "scope",
        value: "project",
      },
    ])
  })

  // An imported id the catalogue cannot place has no domain to name.
  it("names no domain for a skill the catalogue cannot place", () => {
    useConfigStore
      .getState()
      .importConfig(
        persistedConfig({ skills: { [UNKNOWN_SKILL]: skillEntry() } })
      )

    useConfigStore.getState().toggleSkill(UNKNOWN_SKILL)

    expect(events.at(-1)).toStrictEqual({
      name: "skill_toggled",
      skillId: UNKNOWN_SKILL,
      domainId: "unknown",
      selected: false,
    })
  })
})

describe("pruneToCatalog on a selection the catalogue cannot place", () => {
  afterEach(() => {
    useConfigStore.getState().reset()
  })

  it("drops what it cannot place and keeps the rest", () => {
    useConfigStore.getState().importConfig(
      persistedConfig({
        skills: {
          [UNKNOWN_SKILL]: skillEntry(),
          [KNOWN_SKILL]: skillEntry(),
        },
      })
    )

    useConfigStore.getState().pruneToCatalog()

    expect(Object.keys(held().skills)).toStrictEqual([KNOWN_SKILL])
  })
})

// The answer `readSavedConfig` gives, beside the store it read into.
const readingASlot = async (blob: string | null) => {
  const slot = new Map<string, string>()
  if (blob !== null) slot.set(SLOT, blob)
  const writes: string[] = []

  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => slot.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (key === SLOT) writes.push(value)
        slot.set(key, value)
      },
      removeItem: (key: string) => slot.delete(key),
    },
  })

  vi.resetModules()
  const { setReportingSink } = await import("@/lib/observability/report")
  setReportingSink(sink)

  const configStore = await import("./config-store")
  const { useCatalogStore: catalog } = await import("./catalog-store")

  return { ...configStore, catalog, slot, writes }
}

const SAVED_REACT = savedConfigBlob(
  persistedConfig({ skills: { [KNOWN_SKILL]: skillEntry() } })
)
const SAVED_TAILWIND = savedConfigBlob(
  persistedConfig({ skills: { [OTHER_CATEGORY_SKILL]: skillEntry() } })
)

describe("reading the saved configuration", () => {
  afterEach(() => {
    sink.issue.mockClear()
  })

  // Hydration prunes against the catalogue, which is not seated at import.
  it("reads nothing until it is asked to", async () => {
    const { useConfigStore: store, readSavedConfig } =
      await readingASlot(SAVED_REACT)

    expect(store.getState().skills).toStrictEqual({})

    await readSavedConfig()

    expect(Object.keys(store.getState().skills)).toStrictEqual([KNOWN_SKILL])
  })

  it("reads it once per session, answering with nothing the second time", async () => {
    const holdingAnUnknownSkill = savedConfigBlob(
      persistedConfig({
        skills: { [KNOWN_SKILL]: skillEntry(), [UNKNOWN_SKILL]: skillEntry() },
      })
    )
    const {
      useConfigStore: store,
      readSavedConfig,
      slot,
    } = await readingASlot(holdingAnUnknownSkill)
    expect(await readSavedConfig()).toStrictEqual([UNKNOWN_SKILL])
    slot.set(SLOT, SAVED_TAILWIND)

    expect(await readSavedConfig()).toStrictEqual([])
    expect(Object.keys(store.getState().skills)).toStrictEqual([KNOWN_SKILL])
  })

  it("answers with nothing for an empty slot, and reports nothing", async () => {
    const { readSavedConfig } = await readingASlot(null)

    expect(await readSavedConfig()).toStrictEqual([])
    expect(sink.issue).not.toHaveBeenCalled()
  })

  it("reports nothing for a configuration the catalogue places whole", async () => {
    const { readSavedConfig } = await readingASlot(SAVED_REACT)

    await readSavedConfig()

    expect(sink.issue).not.toHaveBeenCalled()
  })

  // A blob that is not an object at all fails at the root, with no field.
  it("names the root when the saved state is not a configuration at all", async () => {
    const { readSavedConfig } = await readingASlot(
      savedConfigBlob("not a configuration")
    )

    await readSavedConfig()

    expect(sink.issue).toHaveBeenCalledWith(
      "Discarded unreadable saved configuration",
      expect.objectContaining({ issues: ["(root): invalid_type"] })
    )
  })
})

// Each skill, each of its rows and each sub-agent is one id.
describe("the count the pruned-ids door reports", () => {
  afterEach(() => {
    sink.issue.mockClear()
  })

  it("counts a dropped skill, its rows and a dropped sub-agent, beside a stack it kept", async () => {
    const { readSavedConfig } = await readingASlot(
      savedConfigBlob(
        persistedConfig({
          stackId: STACK_ID,
          skills: {
            [KNOWN_SKILL]: skillEntry(),
            [UNKNOWN_SKILL]: skillEntry({
              assignments: {
                [KNOWN_AGENT]: liveAssignment(),
                [OTHER_AGENT]: liveAssignment(),
              },
            }),
          },
          agents: { "acme-runner": {} },
        })
      )
    )

    await readSavedConfig()

    expect(sink.issue).toHaveBeenCalledWith(
      "Pruned saved ids the catalog no longer knows",
      { droppedIds: 4, droppedStack: false }
    )
  })

  it("says no stack was dropped for a configuration that applied none", async () => {
    const { readSavedConfig } = await readingASlot(
      savedConfigBlob(
        persistedConfig({ skills: { [UNKNOWN_SKILL]: skillEntry() } })
      )
    )

    await readSavedConfig()

    expect(sink.issue).toHaveBeenCalledWith(
      "Pruned saved ids the catalog no longer knows",
      { droppedIds: 1, droppedStack: false }
    )
  })
})

describe("what the saved slot holds", () => {
  const lastSaved = (writes: string[]) =>
    (JSON.parse(writes.at(-1)!) as { state: PersistedConfig }).state

  it("holds the catalogue's skills, never an added one or one it cannot place", async () => {
    const {
      useConfigStore: store,
      catalog,
      readSavedConfig,
      writes,
    } = await readingASlot(null)
    await readSavedConfig()
    catalog.getState().addExternal([houseSkill()])
    store.getState().importConfig(
      persistedConfig({
        skills: { [UNKNOWN_SKILL]: skillEntry(), [KNOWN_SKILL]: skillEntry() },
        remembered: {
          [OTHER_CATEGORY_SKILL]: skillEntry({ scope: "project" }),
        },
      })
    )

    store.getState().toggleSkill(HOUSE_SKILL_ID)
    store.getState().toggleSkill(HOUSE_SKILL_ID)

    expect(Object.keys(lastSaved(writes).skills)).toStrictEqual([KNOWN_SKILL])
    expect(Object.keys(lastSaved(writes).remembered)).toStrictEqual([
      OTHER_CATEGORY_SKILL,
    ])
  })
})

// A shared address runs on this browser's slot without writing it, and hands
// the saved configuration back on the way home.
describe("holding the slot for a shared configuration", () => {
  const SHARED = persistedConfig({
    skills: { [OTHER_CATEGORY_SKILL]: skillEntry() },
  })

  it("writes nothing to the slot while the shared configuration is open", async () => {
    const {
      useConfigStore: store,
      detachSavedConfig,
      writes,
    } = await readingASlot(null)

    detachSavedConfig()
    store.getState().toggleSkill(KNOWN_SKILL)

    expect(writes).toStrictEqual([])
  })

  it("writes again once it is home", async () => {
    const {
      useConfigStore: store,
      detachSavedConfig,
      readSavedConfig,
      writes,
    } = await readingASlot(null)
    detachSavedConfig()
    await readSavedConfig()

    store.getState().toggleSkill(KNOWN_SKILL)

    expect(writes).not.toStrictEqual([])
  })

  it("holds a second shared address as it held the first", async () => {
    const {
      useConfigStore: store,
      detachSavedConfig,
      readSavedConfig,
      writes,
    } = await readingASlot(null)
    detachSavedConfig()
    await readSavedConfig()
    const writtenAtHome = [...writes]

    detachSavedConfig()
    store.getState().toggleSkill(KNOWN_SKILL)

    expect(writes).toStrictEqual(writtenAtHome)
  })

  it("hands this browser's saved configuration back on the way home", async () => {
    const {
      useConfigStore: store,
      detachSavedConfig,
      readSavedConfig,
    } = await readingASlot(SAVED_REACT)
    await readSavedConfig()
    detachSavedConfig()
    store.getState().importConfig(SHARED)

    await readSavedConfig()

    expect(Object.keys(store.getState().skills)).toStrictEqual([KNOWN_SKILL])
  })

  // With nothing saved, the read keeps what is in memory, which is not ours.
  it("drops the shared configuration on the way home to an empty slot", async () => {
    const {
      useConfigStore: store,
      detachSavedConfig,
      readSavedConfig,
    } = await readingASlot(null)
    detachSavedConfig()
    store.getState().importConfig(SHARED)

    await readSavedConfig()

    expect(store.getState().skills).toStrictEqual({})
  })
})

// Each marketplace keeps its own saved configuration, so loading another
// leaves the one on screen where it was saved.
describe("a saved configuration per marketplace", () => {
  // Mirrored, not imported: the slot's name is what is under test.
  const ACME_SLOT = `${SLOT}@${MARKETPLACE_CANONICAL_REF}`
  const SAVED_ACME = savedConfigBlob(
    persistedConfig({ skills: { [PRIVATE_CATALOG_SKILL]: skillEntry() } })
  )

  const everything = () =>
    persistedConfig({
      stackId: STACK_ID,
      skills: { [KNOWN_SKILL]: skillEntry() },
      remembered: { [OTHER_CATEGORY_SKILL]: skillEntry({ scope: "project" }) },
      agents: { [KNOWN_AGENT]: { on: true } },
      description: "The house web app, as installed.",
    })

  const holding = (slots: Record<string, string>) => async () => {
    const opened = await readingASlot(slots[SLOT] ?? null)
    for (const [key, blob] of Object.entries(slots)) opened.slot.set(key, blob)

    const seatAcme = () =>
      opened.catalog
        .getState()
        .load(MARKETPLACE_CATALOG, MARKETPLACE_CANONICAL_REF)
    const seatPublic = () => opened.catalog.getState().reset()

    return { ...opened, seatAcme, seatPublic }
  }

  const skillIds = (state: PersistedConfig) => Object.keys(state.skills)

  it("reads the seated marketplace's own slot", async () => {
    const {
      useConfigStore: store,
      readSavedConfig,
      seatAcme,
    } = await holding({ [SLOT]: SAVED_REACT, [ACME_SLOT]: SAVED_ACME })()

    seatAcme()
    await readSavedConfig()

    expect(skillIds(store.getState())).toStrictEqual([PRIVATE_CATALOG_SKILL])
  })

  it("opens a marketplace with nothing saved as a new configuration", async () => {
    const {
      useConfigStore: store,
      readSavedConfig,
      seatAcme,
    } = await holding({ [SLOT]: savedConfigBlob(everything()) })()
    await readSavedConfig()

    seatAcme()
    await readSavedConfig()

    const { stackId, skills, remembered, agents, description } =
      store.getState()
    expect({ stackId, skills, remembered, agents, description }).toStrictEqual({
      ...persistedConfig(),
      description: undefined,
    })
  })

  it("leaves the last marketplace's configuration where it was saved", async () => {
    const { readSavedConfig, seatAcme, slot } = await holding({
      [SLOT]: SAVED_REACT,
    })()
    await readSavedConfig()

    seatAcme()
    await readSavedConfig()

    expect(slot.get(SLOT)).toBe(SAVED_REACT)
  })

  it("writes the new marketplace's selection to its own slot", async () => {
    const {
      useConfigStore: store,
      readSavedConfig,
      seatAcme,
      slot,
    } = await holding({ [SLOT]: SAVED_REACT })()
    await readSavedConfig()
    seatAcme()
    await readSavedConfig()

    store.getState().toggleSkill(PRIVATE_CATALOG_SKILL)

    expect(slot.get(SLOT)).toBe(SAVED_REACT)
    expect(slot.get(ACME_SLOT)).toContain(PRIVATE_CATALOG_SKILL)
  })

  it("reopens a marketplace's configuration untouched", async () => {
    const {
      useConfigStore: store,
      readSavedConfig,
      seatAcme,
      seatPublic,
    } = await holding({ [SLOT]: SAVED_REACT })()
    await readSavedConfig()
    seatAcme()
    await readSavedConfig()
    store.getState().toggleSkill(PRIVATE_CATALOG_SKILL)

    seatPublic()
    await readSavedConfig()
    expect(skillIds(store.getState())).toStrictEqual([KNOWN_SKILL])

    seatAcme()
    await readSavedConfig()
    expect(skillIds(store.getState())).toStrictEqual([PRIVATE_CATALOG_SKILL])
  })

  // A toggle on the catalogue drawn while a saved one waits unread must not
  // land in any slot.
  it("writes nothing before a slot has been read", async () => {
    const { useConfigStore: store, writes } = await readingASlot(SAVED_REACT)

    store.getState().toggleSkill(OTHER_CATEGORY_SKILL)

    expect(writes).toStrictEqual([])
  })

  // The control is "hands this browser's saved configuration back on the way
  // home", in "holding the slot for a shared configuration".
  it("leaves the visitor's own untouched when a shared one gives way to another marketplace", async () => {
    const {
      useConfigStore: store,
      detachSavedConfig,
      readSavedConfig,
      seatAcme,
      slot,
    } = await holding({ [SLOT]: SAVED_REACT })()
    await readSavedConfig()
    detachSavedConfig()
    store.getState().importConfig(everything())

    seatAcme()
    await readSavedConfig()
    store.getState().toggleSkill(PRIVATE_CATALOG_SKILL)

    expect(slot.get(SLOT)).toBe(SAVED_REACT)
    expect(skillIds(store.getState())).toStrictEqual([PRIVATE_CATALOG_SKILL])
  })

  it("leaves no shared configuration open", async () => {
    const {
      detachSavedConfig,
      isSharedConfigurationOpen,
      readSavedConfig,
      seatAcme,
    } = await holding({})()
    detachSavedConfig()
    expect(isSharedConfigurationOpen()).toBe(true)

    seatAcme()
    await readSavedConfig()

    expect(isSharedConfigurationOpen()).toBe(false)
  })

  describe("after a link a bare edit made inside a project", () => {
    const madeInAProject = () =>
      projectMintedPayload({
        [KNOWN_SKILL]: freshlyPickedSkill(KNOWN_SKILL),
      })

    // As the editor opens a link: adopted, recognised, its global entries held.
    const opening = (
      configStore: typeof useConfigStore,
      heldGlobal: typeof useHeldGlobalStore,
      payload: SeedPayload
    ) => {
      const opened = recogniseStack(payload, adoptSeedPayload(payload))
      configStore.getState().importConfig(opened)
      heldGlobal.getState().hold(heldGlobalOf(payload, opened))
    }

    afterEach(() => {
      useHeldGlobalStore.getState().release()
      useConfigStore.getState().reset()
    })

    // The control: Start from scratch keeps what the link holds.
    it("keeps the global skill through Start from scratch", () => {
      opening(useConfigStore, useHeldGlobalStore, madeInAProject())

      useConfigStore.getState().applyStack(null)

      expect(Object.keys(held().skills)).toStrictEqual([KNOWN_SKILL])
    })

    it("lets go of the held entries once this browser's own is read", async () => {
      const opened = await holding({})()
      const { useHeldGlobalStore: heldGlobal } =
        await import("./held-global-store")
      opened.detachSavedConfig()
      opening(opened.useConfigStore, heldGlobal, madeInAProject())
      expect(heldGlobal.getState().held).not.toBeNull()

      opened.seatAcme()
      await opened.readSavedConfig()

      expect(heldGlobal.getState().held).toBeNull()
      expect(skillIds(opened.useConfigStore.getState())).toStrictEqual([])
    })
  })
})
