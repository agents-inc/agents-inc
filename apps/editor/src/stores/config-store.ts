import type {
  AssignmentTarget,
  SkillId,
  StackExpansion,
} from "@workspace/matrix"
import { create } from "zustand"
import {
  createJSONStorage,
  persist,
  type PersistStorage,
} from "zustand/middleware"

import {
  defaultAssignmentsFor,
  stackAgentPins,
} from "@/features/configure/lib/default-assignments"
import { track } from "@/lib/analytics/track"
import { reportIssue } from "@/lib/observability/report"
import {
  activeCatalog,
  activeExternalSkill,
  activeSkillById,
  expandActiveStack,
} from "./catalog-store"
import {
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
  isAgentOn,
  isWorthRemembering,
  migrateConfig,
  persistedConfigSchema,
  pruneUnknownIds,
  resolveAgentOptions,
  restingAgentOptions,
  type AgentEntry,
  type AgentOptions,
  type Assignment,
  type PersistedConfig,
  type SkillEntry,
  type SkillOptions,
} from "./persisted-schema"
import { useUiStore } from "./ui-store"

type ConfigActions = {
  // Replaces the whole selection. `null` is "Start from scratch".
  applyStack: (stackId: string | null) => void
  toggleSkill: (skillId: string) => void
  setSkillOption: (skillId: string, patch: Partial<SkillOptions>) => void
  // empty → lazy → preloaded → empty, per the design's matrix cell. A row the
  // roster switched off counts as empty, so cycling it re-enables at lazy.
  cycleAssignment: (skillId: string, agentId: string) => void
  // The roster's row click: keep the assignment, flip whether it is live.
  toggleAssignmentEnabled: (skillId: string, agentId: string) => void
  // The roster's load word: pre ↔ lazy for that one agent.
  flipAssignmentLoad: (skillId: string, agentId: string) => void
  // Pins the agent to the opposite of what it derives to, in both directions.
  toggleAgentPin: (agentId: string) => void
  // Only non-resting choices are kept.
  setAgentOption: (agentId: string, patch: Partial<AgentOptions>) => void
  // For the switch to Codex: no unselected plugin skill rests at project.
  // Selected and ejected entries never move.
  moveRememberedPluginsToGlobal: () => void
  // A shared config replaces the selection wholesale.
  importConfig: (config: PersistedConfig) => void
  // As `importConfig`, without counting a share-link arrival.
  applySavedStack: (config: PersistedConfig) => void
  // Every door that seats a catalogue must call this.
  pruneToCatalog: () => void
  reset: () => void
}

export type ConfigState = PersistedConfig & ConfigActions

type SkillMap = PersistedConfig["skills"]
type AgentMap = PersistedConfig["agents"]
type Assignments = SkillEntry["assignments"]

const EMPTY: PersistedConfig = {
  stackId: null,
  skills: {},
  remembered: {},
  agents: {},
}

const withoutKey = <T>(record: Record<string, T>, key: string) => {
  const { [key]: _removed, ...rest } = record
  return rest
}

const partition = <T>(items: readonly T[], matches: (item: T) => boolean) => {
  const matched: T[] = []
  const rest: T[] = []

  for (const item of items) {
    if (matches(item)) matched.push(item)
    else rest.push(item)
  }

  return [matched, rest] as const
}

// Counted so a prune's silent drops are observable.
const countIds = (config: PersistedConfig) => {
  const entries = [
    ...Object.values(config.skills),
    ...Object.values(config.remembered),
  ]

  return (
    entries.length +
    Object.keys(config.agents).length +
    entries.reduce(
      (total, entry) => total + Object.keys(entry.assignments).length,
      0
    )
  )
}

const droppedAnything = (before: PersistedConfig, after: PersistedConfig) =>
  countIds(before) !== countIds(after) || before.stackId !== after.stackId

const reportPruning = (before: PersistedConfig, after: PersistedConfig) => {
  if (!droppedAnything(before, after)) return

  const droppedIds = countIds(before) - countIds(after)
  const droppedStack = before.stackId !== null && after.stackId === null

  // No id of any kind: on a marketplace, a stack id is a word the org chose.
  reportIssue("Pruned saved ids the catalog no longer knows", {
    droppedIds,
    droppedStack,
  })
}

const lostKeys = (before: object, after: object) =>
  Object.keys(before).filter((id) => !(id in after))

const lostStack = (before: string | null, after: string | null) =>
  before !== null && after === null ? [before] : []

// The saved ids a prune could not place, for the visitor. `remembered` is left
// out: nothing shows its loss.
export const unknownSavedIds = (
  before: PersistedConfig,
  after: PersistedConfig
): string[] => [
  ...lostKeys(before.skills, after.skills),
  ...lostKeys(before.agents, after.agents),
  ...lostStack(before.stackId, after.stackId),
]

// The loaded catalogue only, so a stale id cannot survive in storage.
const isKnownSkill = (skillId: string) => skillId in activeCatalog().skillsById

const isInCategory = (skillId: string, categoryId: string) =>
  activeSkillById(skillId)?.categoryId === categoryId

// The skill's category, but only when picking one replaces the others.
const exclusiveCategoryOf = (skillId: string) => {
  const categoryId = activeSkillById(skillId)?.categoryId
  if (!categoryId) return undefined

  return activeCatalog().categoriesById[categoryId]?.exclusive
    ? categoryId
    : undefined
}

// A deselected skill's setup is set aside rather than dropped.
const setAside = (
  remembered: SkillMap,
  skillId: string,
  entry: SkillEntry | undefined
) => {
  if (!entry) return remembered
  if (!isWorthRemembering(entry)) return withoutKey(remembered, skillId)

  return { ...remembered, [skillId]: entry }
}

// `one of`: picking replaces. An eviction is set aside like a deselection.
const clearExclusiveSiblings = (
  { skills, remembered }: PersistedConfig,
  skillId: string
) => {
  const categoryId = exclusiveCategoryOf(skillId)
  if (!categoryId) return { skills, remembered }

  const [evicted, kept] = partition(Object.entries(skills), ([id]) =>
    isInCategory(id, categoryId)
  )

  return {
    skills: Object.fromEntries(kept),
    remembered: evicted.reduce(
      (memory, [id, entry]) => setAside(memory, id, entry),
      remembered
    ),
  }
}

const isProjectPlugin = (entry: SkillEntry) =>
  entry.install === "plugin" && entry.scope === "project"

const atGlobalIfProjectPlugin = (entry: SkillEntry): SkillEntry =>
  isProjectPlugin(entry) ? { ...entry, scope: "global" } : entry

// The same map back when nothing moves, so the caller can skip `set`.
const withProjectPluginsAtGlobal = (remembered: SkillMap): SkillMap => {
  if (!Object.values(remembered).some(isProjectPlugin)) return remembered

  return Object.fromEntries(
    Object.entries(remembered).map(([skillId, entry]) => [
      skillId,
      atGlobalIfProjectPlugin(entry),
    ])
  )
}

const deselect = (
  state: PersistedConfig,
  skillId: string,
  entry: SkillEntry
) => ({
  skills: withoutKey(state.skills, skillId),
  remembered: setAside(state.remembered, skillId, entry),
})

// A third-party skill is always eject: a plugin would serve their repository
// without our metadata.
export const isEjectOnly = (skillId: string) =>
  activeExternalSkill(skillId) !== undefined

const installModeFor = (skillId: string): SkillOptions["install"] =>
  isEjectOnly(skillId) ? "eject" : DEFAULT_SKILL_OPTIONS.install

// What a never-configured skill starts as. Exported because the cell shows it
// before the skill is selected.
export const freshEntry = (skillId: string): SkillEntry => ({
  ...DEFAULT_SKILL_OPTIONS,
  install: installModeFor(skillId),
  assignments: defaultAssignmentsFor(skillId),
})

// A remembered skill restores exactly what it had.
const select = (state: PersistedConfig, skillId: string) => {
  const { skills, remembered } = clearExclusiveSiblings(state, skillId)

  return {
    skills: {
      ...skills,
      [skillId]: remembered[skillId] ?? freshEntry(skillId),
    },
    remembered: withoutKey(remembered, skillId),
  }
}

// The agents an entry reaches; a switched-off row does not pulse.
const liveAgentIds = (entry: SkillEntry | undefined) =>
  Object.entries(entry?.assignments ?? {})
    .filter(([, assignment]) => assignment.enabled)
    .map(([agentId]) => agentId)

const cycled = (assignments: Assignments, agentId: string): Assignments => {
  const current = assignments[agentId]

  if (!current || !current.enabled)
    return { ...assignments, [agentId]: { load: "lazy", enabled: true } }
  if (current.load === "lazy")
    return { ...assignments, [agentId]: { load: "preloaded", enabled: true } }

  return withoutKey(assignments, agentId)
}

// Configuring never selects: an unselected skill's options go to
// `remembered`. `undefined` is "the catalogue turned this down", so the caller
// can skip `set`, which writes.
const configure = (
  state: PersistedConfig,
  skillId: string,
  change: (entry: SkillEntry) => SkillEntry
) => {
  const selected = state.skills[skillId]
  if (selected) {
    return { skills: { ...state.skills, [skillId]: change(selected) } }
  }

  if (!isKnownSkill(skillId)) return undefined

  const next = change(state.remembered[skillId] ?? freshEntry(skillId))
  return {
    remembered: isWorthRemembering(next)
      ? { ...state.remembered, [skillId]: next }
      : withoutKey(state.remembered, skillId),
  }
}

// `undefined` for a row nothing selected holds, as `configure` answers.
const patchAssignment = (
  state: PersistedConfig,
  skillId: string,
  agentId: string,
  change: (current: Assignment) => Assignment
) => {
  const entry = state.skills[skillId]
  const current = entry?.assignments[agentId]
  if (!entry || !current) return undefined

  return {
    skills: {
      ...state.skills,
      [skillId]: {
        ...entry,
        assignments: { ...entry.assignments, [agentId]: change(current) },
      },
    },
  }
}

// A field back at its resting value loses its key. `on` is exempt: a pin is a
// decision even where it matches what the assignments imply.
const withoutRestingValues = (
  entry: AgentEntry,
  resting: AgentOptions
): AgentEntry => ({
  ...(entry.on !== undefined && { on: entry.on }),
  ...(entry.model !== undefined &&
    entry.model !== resting.model && { model: entry.model }),
  ...(entry.codexModel !== undefined &&
    entry.codexModel !== resting.codexModel && {
      codexModel: entry.codexModel,
    }),
  ...(entry.effort !== undefined &&
    entry.effort !== resting.effort && { effort: entry.effort }),
  ...(entry.scope !== undefined &&
    entry.scope !== resting.scope && { scope: entry.scope }),
})

const alreadyInEffect = (
  options: AgentOptions,
  patch: Partial<AgentOptions>
) => {
  const current: Record<string, unknown> = options
  return Object.entries(patch).every(
    ([field, value]) => current[field] === value
  )
}

const configureAgent = (
  agents: AgentMap,
  agentId: string,
  patch: Partial<AgentOptions>
): AgentMap => {
  const next = withoutRestingValues(
    { ...agents[agentId], ...patch },
    restingAgentOptions(agentId)
  )

  return Object.keys(next).length === 0
    ? withoutKey(agents, agentId)
    : { ...agents, [agentId]: next }
}

// Per (skill, sub-agent): the stack says who carries it, the resolver how.
const toAssignments = (targets: readonly AssignmentTarget[]): Assignments =>
  Object.fromEntries(
    targets.map(({ agentId, load }) => [agentId, { load, enabled: true }])
  )

const toStackSkills = (expansion: StackExpansion): SkillMap => {
  const entryFor = (skillId: string): SkillEntry => ({
    ...DEFAULT_SKILL_OPTIONS,
    assignments: toAssignments(expansion.assignmentsBySkill[skillId] ?? []),
  })

  return Object.fromEntries(
    expansion.skillIds.map((skillId) => [skillId, entryFor(skillId)])
  )
}

// What the last read could not place. Beside the store rather than in it,
// because a `set` writes the slot.
let unknownOnLastRead: string[] = []

// An added skill's content is not persisted, so its id is not either.
const onlyPersistableSkills = (skills: SkillMap) =>
  Object.fromEntries(
    Object.entries(skills).filter(
      ([skillId]) =>
        skillId in activeCatalog().skillsById &&
        activeExternalSkill(skillId) === undefined
    )
  )

// Persist's own default, named so `withoutWrites` has something to wrap.
// `undefined` where there is no localStorage.
const OWN_SLOT = createJSONStorage(() => window.localStorage)

// The same slot, read and never written: what a shared configuration runs on.
export const withoutWrites = <T>(
  storage: PersistStorage<T>
): PersistStorage<T> => ({
  ...storage,
  setItem: () => undefined,
  // `clearStorage` reaches this door rather than `setItem`.
  removeItem: () => undefined,
})

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      applyStack: (stackId) => {
        // Whatever was pulsing belonged to the selection being replaced.
        useUiStore.getState().clearFlash()

        track({ name: "stack_applied", stackId })

        if (stackId === null) {
          set({ ...EMPTY })
          return
        }

        const expansion = expandActiveStack(stackId)
        if (!expansion) return

        set({
          stackId,
          skills: toStackSkills(expansion),
          remembered: {},
          agents: stackAgentPins(expansion),
        })
      },

      toggleSkill: (skillId) => {
        const selecting = !(skillId in get().skills)

        // Ahead of `set`, which writes whatever its updater returns.
        if (selecting && !isKnownSkill(skillId)) return

        // A deselection or an eviction on Codex sets the entry aside at global.
        const onCodex = useUiStore.getState().provider === "codex"
        set((state) => {
          const current = state.skills[skillId]
          const next = current
            ? deselect(state, skillId, current)
            : select(state, skillId)

          return onCodex
            ? {
                ...next,
                remembered: withProjectPluginsAtGlobal(next.remembered),
              }
            : next
        })

        // A deselect flashes nobody; a restored entry flashes what it restored.
        const reached = selecting ? get().skills[skillId] : undefined
        useUiStore.getState().flashAgents(liveAgentIds(reached))

        track({
          name: "skill_toggled",
          skillId,
          domainId: activeSkillById(skillId)?.domainId ?? "unknown",
          selected: selecting,
        })
      },

      setSkillOption: (skillId, patch) => {
        // The panel cannot express plugin for an eject-only skill either.
        const allowed =
          isEjectOnly(skillId) && patch.install === "plugin"
            ? { ...patch, install: "eject" as const }
            : patch

        const configured = configure(get(), skillId, (entry) => ({
          ...entry,
          ...allowed,
        }))
        if (configured) set(configured)

        for (const [field, value] of Object.entries(allowed)) {
          track({
            name: "skill_configured",
            skillId,
            field,
            value: String(value),
          })
        }
      },

      cycleAssignment: (skillId, agentId) => {
        // No scope guard: a project skill on a global sub-agent is an error
        // `summarize` gates Install and Share on.
        const configured = configure(get(), skillId, (entry) => ({
          ...entry,
          assignments: cycled(entry.assignments, agentId),
        }))
        if (configured) set(configured)

        track({ name: "assignment_cycled", skillId, agentId })
      },

      toggleAssignmentEnabled: (skillId, agentId) => {
        const patched = patchAssignment(get(), skillId, agentId, (current) => ({
          ...current,
          enabled: !current.enabled,
        }))
        if (patched) set(patched)
      },

      flipAssignmentLoad: (skillId, agentId) => {
        const patched = patchAssignment(get(), skillId, agentId, (current) => ({
          ...current,
          load: current.load === "preloaded" ? "lazy" : "preloaded",
        }))
        if (patched) set(patched)
      },

      toggleAgentPin: (agentId) => {
        const on = !isAgentOn(get(), agentId)

        // Spread, so switching off keeps the agent's other choices.
        set((state) => ({
          agents: {
            ...state.agents,
            [agentId]: { ...state.agents[agentId], on },
          },
        }))

        track({ name: "agent_pinned", agentId, on })
      },

      setAgentOption: (agentId, patch) => {
        // Pressing the control already in effect must not write (`set` is the write).
        if (alreadyInEffect(resolveAgentOptions(get().agents, agentId), patch))
          return

        set((state) => ({
          agents: configureAgent(state.agents, agentId, patch),
        }))

        for (const [field, value] of Object.entries(patch)) {
          track({
            name: "agent_configured",
            agentId,
            field,
            value: String(value),
          })
        }
      },

      moveRememberedPluginsToGlobal: () => {
        const { remembered } = get()
        const moved = withProjectPluginsAtGlobal(remembered)
        if (moved !== remembered) set({ remembered: moved })
      },

      importConfig: (config) => {
        useUiStore.getState().clearFlash()
        set({ ...config })

        track({
          name: "config_imported",
          skillCount: Object.keys(config.skills).length,
        })
      },

      applySavedStack: (config) => {
        // Whatever was pulsing belonged to the selection being replaced.
        useUiStore.getState().clearFlash()
        set({ ...config })
      },

      pruneToCatalog: () => {
        useUiStore.getState().clearFlash()

        const pruned = pruneUnknownIds(get())
        // `set` writes, and this is reachable before the saved configuration
        // has been read: an equal copy would overwrite it with an empty store.
        if (!droppedAnything(get(), pruned)) return

        set(pruned)
      },

      reset: () => {
        useUiStore.getState().clearFlash()
        set({ ...EMPTY })
      },
    }),
    {
      name: "agents-inc:config:v1",
      version: PERSIST_VERSION,
      migrate: migrateConfig,
      storage: OWN_SLOT,
      // `merge` prunes against the loaded catalogue, so storage is read only
      // once `readSavedConfig` knows it settled.
      skipHydration: true,
      partialize: ({ stackId, skills, remembered, agents }) => ({
        stackId,
        skills: onlyPersistableSkills(skills),
        remembered: onlyPersistableSkills(remembered),
        agents,
      }),
      // The untrusted boundary: anything unparseable becomes empty state.
      merge: (persisted, current) => {
        // An empty slot and a blob `migrateConfig` refused both arrive here as
        // `undefined`; neither failed to parse.
        if (persisted === undefined) return current

        const parsed = persistedConfigSchema.safeParse(persisted)
        if (!parsed.success) {
          // The field and the code only: past the field, a path is a
          // catalogue id, and on a marketplace that is a name the org chose.
          reportIssue("Discarded unreadable saved configuration", {
            persistVersion: PERSIST_VERSION,
            issues: parsed.error.issues.map(
              (issue) => `${String(issue.path[0] ?? "(root)")}: ${issue.code}`
            ),
          })
          return current
        }

        const pruned = pruneUnknownIds(parsed.data)
        reportPruning(parsed.data, pruned)
        // The only place both the saved blob and its pruned form exist.
        unknownOnLastRead = unknownSavedIds(parsed.data, pruned)

        return { ...current, ...pruned }
      },
    }
  )
)

// Whether the slot is held open for a configuration that is not this browser's.
let heldOpen = false

// Holds this browser's saved configuration while a shared address is open;
// `readSavedConfig` hands it back.
export const detachSavedConfig = () => {
  if (heldOpen) return
  if (!OWN_SLOT) return

  heldOpen = true
  useConfigStore.persist.setOptions({ storage: withoutWrites(OWN_SLOT) })
}

// The slot back, answering whether it had been held.
const reattachSavedConfig = () => {
  if (!heldOpen) return false

  // What is in memory is somebody else's, and `merge` keeps it on an empty
  // slot. Cleared while writes are still off.
  useConfigStore.getState().reset()

  heldOpen = false
  useConfigStore.persist.setOptions({ storage: OWN_SLOT })
  return true
}

/**
 * Reads the saved configuration once its catalogue is seated, once per session
 * except on the way back from a shared address. Answers with the ids it could
 * not place.
 */
export const readSavedConfig = async (): Promise<string[]> => {
  const wasHeldOpen = reattachSavedConfig()
  if (!wasHeldOpen && useConfigStore.persist.hasHydrated()) return []

  // Emptied first, so the answer describes this read.
  unknownOnLastRead = []
  await useConfigStore.persist.rehydrate()
  return unknownOnLastRead
}

export type { SkillId }
