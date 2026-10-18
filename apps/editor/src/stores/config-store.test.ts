import { STACKS } from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  liveAssignment,
  offAssignment,
  persistedConfig,
  savedConfigBlob,
  skillEntry,
} from "@/__tests__/factories/config-selection-factories"
import {
  HOUSE_SKILL_ID,
  houseSkill,
} from "@/__tests__/factories/external-skill-factories"
import { summarize } from "@/features/configure/lib/derive"
import { setAnalyticsSink } from "@/lib/analytics/track"

import {
  freshEntry,
  isEjectOnly,
  unknownSavedIds,
  useConfigStore,
  withoutWrites,
} from "./config-store"
import { useCatalogStore } from "./catalog-store"

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
  const { useConfigStore: store } = await import("./config-store")

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

    store.getState().toggleSkill(UNKNOWN_SKILL)

    expect(writes).toStrictEqual([])
  })

  it("writes nothing for an option set on a skill it cannot place", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store.getState().setSkillOption(UNKNOWN_SKILL, { scope: "global" })

    expect(writes).toStrictEqual([])
  })

  it("writes nothing for a row no selected skill holds", async () => {
    const { store, writes } = await storeOnAWatchedSlot()

    store.getState().toggleAssignmentEnabled(KNOWN_SKILL, KNOWN_AGENT)

    expect(writes).toStrictEqual([])
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

  // `set` is what writes the slot, so a switch that moves nothing skips it.
  it("leaves the state untouched when no remembered plugin is at project", () => {
    useConfigStore.getState().applySavedStack(
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
    const before = useConfigStore.getState()

    before.moveRememberedPluginsToGlobal()

    expect(useConfigStore.getState()).toBe(before)
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

    store.getState().setAgentOption(KNOWN_AGENT, patch)

    expect(writes).toStrictEqual([])
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

      store.getState().setAgentOption(KNOWN_AGENT, patch)

      expect(writes).toHaveLength(1)
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

// A prune that drops nothing must not reach `set`: it is reachable before the
// saved configuration has been read, and would write an empty store over it.
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

// The roster tints the sub-agents a selection just reached.
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
    const { useConfigStore: store, catalog, writes } = await readingASlot(null)
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
