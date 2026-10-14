import { afterEach, describe, expect, it, vi } from "vitest"

import {
  liveAssignment,
  persistedConfig,
  savedConfigBlob,
  skillEntry,
} from "@/__tests__/factories/config-selection-factories"
import { summarize } from "@/features/configure/lib/derive"

import { unknownSavedIds, useConfigStore, withoutWrites } from "./config-store"

import type { ReportingSink } from "@/lib/observability/report"
import type { PersistStorage, StorageValue } from "zustand/middleware"

import {
  AGENT_MODELS,
  PERSIST_VERSION,
  isAgentOn,
  restingAgentOptions,
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

// The slot a shared configuration runs on (EDITOR-37): read, never written.
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

// The store on a `localStorage` this suite can watch. `set` is what writes —
// persist calls `setItem` outside zustand's own `Object.is` short-circuit — so
// these read the slot. The browser stands before the import because the slot
// is read once at module scope; in node persist would otherwise find no
// storage and every assertion would pass vacuously.
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

// A project skill on a global sub-agent cannot be installed (the CLI throws
// on it), but the store refuses none of the three ways in: it is an error to
// resolve, and `summarize` gates Install and Share on it (EDITOR-08).
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

// v6 §2 rule 2: on Codex no unselected plugin skill rests at project. Only
// remembered plugin+project entries move; selected skills and ejected ones
// never do, and nothing moves back.
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
