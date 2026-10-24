import type { AssignmentTarget, StackExpansion } from "@workspace/matrix"
import { create, type StoreApi } from "zustand"
import {
  createJSONStorage,
  persist,
  type PersistStorage,
} from "zustand/middleware"

import {
  agentSwitchNotices,
  agentSwitchOffNotices,
} from "@/features/configure/lib/agent-switches"
import {
  defaultAssignmentsFor,
  stackAgentIds,
  stackAgentPins,
} from "@/features/configure/lib/default-assignments"
import {
  agentAsHeld,
  agentOptionRefusal,
  agentPinRefusal,
  assignmentRefusal,
  keepingHeld,
  offHeldAgents,
  skillAsHeld,
  skillOptionRefusal,
  skillToggleRefusal,
  type HeldGlobal,
} from "@/features/configure/lib/held-global"
import { track } from "@/lib/analytics/track"
import { reportIssue, reportableIssues } from "@/lib/observability/report"
import { sayInToasts } from "@/lib/toast"
import {
  activeCatalog,
  activeExternalSkill,
  activeMarketplace,
  activeSkillById,
  expandActiveStack,
} from "./catalog-store"
import { activeHeldGlobal, useHeldGlobalStore } from "./held-global-store"
import {
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
  isAgentOn,
  isKnownSkill,
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
  // Replaces the whole selection but what a project's link holds. `null` is
  // "Start from scratch".
  applyStack: (stackId: string | null) => void
  toggleSkill: (skillId: string) => void
  // One toast for the lot, as the composer applies a proposal.
  toggleSkills: (skillIds: readonly string[]) => void
  setSkillOption: (skillId: string, patch: Partial<SkillOptions>) => void
  // empty → lazy → preloaded → empty, per the design's matrix cell. A row the
  // roster switched off counts as empty, so cycling it re-enables at lazy.
  cycleAssignment: (skillId: string, agentId: string) => void
  toggleAssignmentEnabled: (skillId: string, agentId: string) => void
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
  // As `applyStack`, for a saved stack.
  applySavedStack: (config: PersistedConfig) => void
  // Every door that seats a catalogue must call this, or read that
  // marketplace's own saved configuration.
  pruneToCatalog: () => void
  reset: () => void
}

export type ConfigState = PersistedConfig & ConfigActions

type SkillMap = PersistedConfig["skills"]
type AgentMap = PersistedConfig["agents"]
type Assignments = SkillEntry["assignments"]

// `description` is named so that replacing the selection clears it: `set`
// merges, and an absent key would keep the last one.
const EMPTY: PersistedConfig = {
  stackId: null,
  skills: {},
  remembered: {},
  agents: {},
  description: undefined,
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

const isInCategory = (skillId: string, categoryId: string) =>
  activeSkillById(skillId)?.categoryId === categoryId

const exclusiveCategoryOf = (skillId: string) => {
  const categoryId = activeSkillById(skillId)?.categoryId
  if (!categoryId) return undefined

  return activeCatalog().categoriesById[categoryId]?.exclusive
    ? categoryId
    : undefined
}

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

// What a never-configured skill starts as.
export const freshEntry = (skillId: string): SkillEntry => ({
  ...DEFAULT_SKILL_OPTIONS,
  install: installModeFor(skillId),
  assignments: defaultAssignmentsFor(skillId),
})

// A remembered skill restores exactly what it had.
const select = (
  state: PersistedConfig,
  skillId: string,
  held: HeldGlobal | null
) => {
  const { skills, remembered } = clearExclusiveSiblings(state, skillId)
  const entry = remembered[skillId] ?? freshEntry(skillId)

  return {
    skills: { ...skills, [skillId]: offHeldAgents(held, state, entry) },
    remembered: withoutKey(remembered, skillId),
  }
}

// A deselection or an eviction on Codex sets the entry aside at global.
const toggled = (
  state: PersistedConfig,
  skillId: string,
  onCodex: boolean,
  held: HeldGlobal | null
) => {
  const current = state.skills[skillId]
  const next = current
    ? deselect(state, skillId, current)
    : select(state, skillId, held)

  return onCodex
    ? { ...next, remembered: withProjectPluginsAtGlobal(next.remembered) }
    : next
}

// The panel cannot express plugin for an eject-only skill either.
const withOfferedInstall = (
  skillId: string,
  patch: Partial<SkillOptions>
): Partial<SkillOptions> =>
  isEjectOnly(skillId) && patch.install === "plugin"
    ? { ...patch, install: "eject" }
    : patch

const holdsLiveSkill = (config: PersistedConfig, agentId: string) =>
  Object.values(config.skills).some(
    (entry) => entry.assignments[agentId]?.enabled
  )

const lostItsLastSkill = (
  before: PersistedConfig,
  after: PersistedConfig,
  agentId: string
) => holdsLiveSkill(before, agentId) && !holdsLiveSkill(after, agentId)

// Whoever pinned it on, a link or a click. A stack's stay on, and a project's
// link can't switch off one it holds.
const emptiedPins = (
  before: PersistedConfig,
  after: PersistedConfig,
  held: HeldGlobal | null
) => {
  const declared = stackAgentIds(after.stackId)
  const keepsItsPin = (agentId: string) =>
    declared.includes(agentId) ||
    agentPinRefusal(held, after, agentId) !== undefined

  return Object.entries(after.agents).filter(
    ([agentId, entry]) =>
      entry.on === true &&
      lostItsLastSkill(before, after, agentId) &&
      !keepsItsPin(agentId)
  )
}

// Unpinned rather than pinned off, so the skill coming back brings it back.
const unpinning = (
  agents: AgentMap,
  [agentId, { on: _pin, ...choices }]: [string, AgentEntry]
): AgentMap =>
  Object.keys(choices).length === 0
    ? withoutKey(agents, agentId)
    : { ...agents, [agentId]: choices }

/** A sub-agent the change leaves without a live skill goes off with it. */
const offOnceEmptied = (
  before: PersistedConfig,
  change: Partial<PersistedConfig>,
  held: HeldGlobal | null
): Partial<PersistedConfig> => {
  const after = { ...before, ...change }
  const emptied = emptiedPins(before, after, held)
  if (emptied.length === 0) return change

  return { ...change, agents: emptied.reduce(unpinning, after.agents) }
}

// The agents an entry reaches; a switched-off row does not pulse.
const liveAgentIds = (entry: SkillEntry | undefined) =>
  Object.entries(entry?.assignments ?? {})
    .filter(([, assignment]) => assignment.enabled)
    .map(([agentId]) => agentId)

// Says what a change switched, replacing what the last one said.
const saying =
  (noticesOf: typeof agentSwitchNotices) =>
  (read: () => PersistedConfig, change: () => void) => {
    const before = read()
    change()
    sayInToasts(noticesOf(before, read(), useUiStore.getState().provider))
  }

const sayingWhatItSwitches = saying(agentSwitchNotices)

// A press on the sub-agent's own row or cell switches it on in plain sight.
const sayingWhatItSwitchesOff = saying(agentSwitchOffNotices)

const toggleOneSkill = (
  set: StoreApi<ConfigState>["setState"],
  get: () => ConfigState,
  skillId: string
) => {
  const selecting = !(skillId in get().skills)

  // Ahead of `set`, which writes whatever its updater returns.
  if (selecting && !isKnownSkill(skillId)) return
  const held = activeHeldGlobal()
  if (skillToggleRefusal(held, get(), skillId)) return

  const onCodex = useUiStore.getState().provider === "codex"
  set((state) =>
    offOnceEmptied(state, toggled(state, skillId, onCodex, held), held)
  )

  // A deselect flashes nobody; a restored entry flashes what it restored.
  const reached = selecting ? get().skills[skillId] : undefined
  useUiStore.getState().flashAgents(liveAgentIds(reached))

  track({
    name: "skill_toggled",
    skillId,
    domainId: activeSkillById(skillId)?.domainId ?? "unknown",
    selected: selecting,
  })
}

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

const isNonResting = <T>(value: T | undefined, resting: T): value is T =>
  value !== undefined && value !== resting

// A field back at its resting value loses its key. `on` is exempt: a pin is a
// decision even where it matches what the assignments imply.
const withoutRestingValues = (
  entry: AgentEntry,
  resting: AgentOptions
): AgentEntry => ({
  ...(entry.on !== undefined && { on: entry.on }),
  ...(isNonResting(entry.model, resting.model) && { model: entry.model }),
  ...(isNonResting(entry.codexModel, resting.codexModel) && {
    codexModel: entry.codexModel,
  }),
  ...(isNonResting(entry.effort, resting.effort) && { effort: entry.effort }),
  ...(isNonResting(entry.scope, resting.scope) && { scope: entry.scope }),
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null

// By value: a record built in another key order holds the same.
const sameValue = (a: unknown, b: unknown): boolean =>
  Object.is(a, b) || (isRecord(a) && isRecord(b) && sameRecords(a, b))

const sameRecords = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(
    ([key, value]) => Object.hasOwn(b, key) && sameValue(value, b[key])
  )

// Whether `set(patch)` would change nothing.
const alreadyInEffect = <T extends Record<string, unknown>>(
  current: T,
  patch: Partial<T>
) =>
  Object.entries(patch).every(([field, value]) =>
    sameValue(current[field], value)
  )

// What the cell and its panel draw, so a press is judged against what was seen.
const skillOptionsInEffect = (state: PersistedConfig, skillId: string) =>
  state.skills[skillId] ?? state.remembered[skillId] ?? freshEntry(skillId)

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

/**
 * The whole selection applying a stack leaves: its skills, and its pins. The
 * description goes, since the stack's own is what the install writes.
 */
export const stackSelection = (
  stackId: string
): PersistedConfig | undefined => {
  const expansion = expandActiveStack(stackId)
  if (!expansion) return undefined

  return {
    ...EMPTY,
    stackId,
    skills: toStackSkills(expansion),
    agents: stackAgentPins(expansion),
  }
}

// What the last read could not place. Beside the store rather than in it,
// because a `set` writes the slot.
let unknownOnLastRead: string[] = []

// An added skill's content is not persisted, so its id is not either.
const isPersistable = (skillId: string) =>
  isKnownSkill(skillId) && activeExternalSkill(skillId) === undefined

const onlyPersistableSkills = (skills: SkillMap) =>
  Object.fromEntries(
    Object.entries(skills).filter(([skillId]) => isPersistable(skillId))
  )

// Persist's own default, named so `withoutWrites` has something to wrap.
// `undefined` where there is no localStorage.
const OWN_SLOT = createJSONStorage(() => window.localStorage)

const PUBLIC_SLOT_NAME = "agents-inc:config:v1"

// One saved configuration per marketplace, so loading another leaves this one
// where it was saved. The public catalogue's keeps the original name.
const slotNameFor = (marketplace: string) =>
  marketplace === "" ? PUBLIC_SLOT_NAME : `${PUBLIC_SLOT_NAME}@${marketplace}`

// The same slot, read and never written: what a shared configuration runs on.
export const withoutWrites = <T>(
  storage: PersistStorage<T>
): PersistStorage<T> => ({
  ...storage,
  setItem: () => undefined,
  // `clearStorage` reaches this door rather than `setItem`.
  removeItem: () => undefined,
})

// Until a slot is read, so a pick on the catalogue drawn meanwhile lands in
// none.
const UNWRITTEN_SLOT = OWN_SLOT && withoutWrites(OWN_SLOT)

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      applyStack: (stackId) => {
        // Whatever was pulsing belonged to the selection being replaced.
        useUiStore.getState().clearFlash()

        const applied = stackId === null ? EMPTY : stackSelection(stackId)
        if (!applied) return

        const next = keepingHeld(activeHeldGlobal(), get(), applied)
        // `set` writes, and a press that changes nothing is not reported.
        if (alreadyInEffect(get(), next)) return

        track({ name: "stack_applied", stackId })
        set(next)
      },

      toggleSkill: (skillId) => get().toggleSkills([skillId]),

      toggleSkills: (skillIds) =>
        sayingWhatItSwitches(get, () => {
          for (const skillId of skillIds) toggleOneSkill(set, get, skillId)
        }),

      setSkillOption: (skillId, patch) => {
        // As `setAgentOption`. Judged as pressed, not as offered, so plugin
        // pressed on an eject-only skill still reports that it stays eject.
        if (alreadyInEffect(skillOptionsInEffect(get(), skillId), patch)) return

        const held = activeHeldGlobal()
        if (skillOptionRefusal(held, get(), skillId, patch)) return

        const allowed = withOfferedInstall(skillId, patch)
        const configured = configure(get(), skillId, (entry) =>
          skillAsHeld(held, get(), skillId, { ...entry, ...allowed })
        )
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
        const held = activeHeldGlobal()
        if (assignmentRefusal(held, get(), skillId, agentId)) return

        // No scope guard: a project skill on a global sub-agent is an error
        // `summarize` gates Install and Share on.
        const configured = configure(get(), skillId, (entry) => ({
          ...entry,
          assignments: cycled(entry.assignments, agentId),
        }))
        if (configured)
          sayingWhatItSwitchesOff(get, () =>
            set(offOnceEmptied(get(), configured, held))
          )

        track({ name: "assignment_cycled", skillId, agentId })
      },

      toggleAssignmentEnabled: (skillId, agentId) => {
        const held = activeHeldGlobal()
        if (assignmentRefusal(held, get(), skillId, agentId)) return

        const patched = patchAssignment(get(), skillId, agentId, (current) => ({
          ...current,
          enabled: !current.enabled,
        }))
        if (patched)
          sayingWhatItSwitchesOff(get, () =>
            set(offOnceEmptied(get(), patched, held))
          )
      },

      flipAssignmentLoad: (skillId, agentId) => {
        if (assignmentRefusal(activeHeldGlobal(), get(), skillId, agentId))
          return

        const patched = patchAssignment(get(), skillId, agentId, (current) => ({
          ...current,
          load: current.load === "preloaded" ? "lazy" : "preloaded",
        }))
        if (patched) set(patched)
      },

      toggleAgentPin: (agentId) => {
        if (agentPinRefusal(activeHeldGlobal(), get(), agentId)) return

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

        const held = activeHeldGlobal()
        if (agentOptionRefusal(held, get(), agentId, patch)) return

        set((state) =>
          agentAsHeld(
            held,
            {
              skills: state.skills,
              agents: configureAgent(state.agents, agentId, patch),
            },
            agentId
          )
        )

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
        set({ ...EMPTY, ...config })

        track({
          name: "config_imported",
          skillCount: Object.keys(config.skills).length,
        })
      },

      applySavedStack: (config) => {
        // Whatever was pulsing belonged to the selection being replaced.
        useUiStore.getState().clearFlash()

        const next = keepingHeld(activeHeldGlobal(), get(), {
          ...EMPTY,
          ...config,
        })
        if (alreadyInEffect(get(), next)) return

        set(next)
      },

      pruneToCatalog: () => {
        useUiStore.getState().clearFlash()

        const pruned = pruneUnknownIds(get())
        // `set` writes, so a prune that drops nothing must not reach it.
        if (!droppedAnything(get(), pruned)) return

        set(pruned)
      },

      reset: () => {
        useUiStore.getState().clearFlash()
        set({ ...EMPTY })
      },
    }),
    {
      name: PUBLIC_SLOT_NAME,
      version: PERSIST_VERSION,
      migrate: migrateConfig,
      storage: UNWRITTEN_SLOT,
      // `merge` prunes against the loaded catalogue, so storage is read only
      // once `readSavedConfig` knows it settled.
      skipHydration: true,
      partialize: ({ stackId, skills, remembered, agents, description }) => ({
        stackId,
        skills: onlyPersistableSkills(skills),
        remembered: onlyPersistableSkills(remembered),
        agents,
        description,
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
            issues: reportableIssues(parsed.error),
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

// Read as `activeMarketplace` is: the payload carries it, no derivation does.
export const activeDescription = () => useConfigStore.getState().description

// Whether the slot is held open for a configuration that is not this browser's.
let heldOpen = false

// The marketplace whose saved configuration is in memory; `null` before the
// first read and while a shared one is open.
let openSlot: string | null = null

/** Whether a shared configuration is on screen in place of this browser's own. */
export const isSharedConfigurationOpen = () => heldOpen

/** The marketplace whose saved configuration is on screen; `null` when none is. */
export const savedConfigurationOnScreen = () => openSlot

// Holds this browser's saved configurations while a shared address is open;
// `readSavedConfig` hands one back.
export const detachSavedConfig = () => {
  if (heldOpen) return
  if (!UNWRITTEN_SLOT) return

  heldOpen = true
  openSlot = null
  useConfigStore.persist.setOptions({ storage: UNWRITTEN_SLOT })
}

// What is in memory belongs to another configuration, and `merge` keeps it on
// an empty slot. Cleared while writes are off, so no slot takes it.
const clearBeforeReading = (unwritten: PersistStorage<unknown>) => {
  useConfigStore.persist.setOptions({ storage: unwritten })
  useConfigStore.getState().reset()
  useHeldGlobalStore.getState().release()
}

// Reads and writes go to that marketplace's slot from here on.
const openTheSlotOf = (marketplace: string, slot: PersistStorage<unknown>) => {
  heldOpen = false
  openSlot = marketplace
  useConfigStore.persist.setOptions({
    name: slotNameFor(marketplace),
    storage: slot,
  })
}

/**
 * Reads the seated marketplace's saved configuration, once its catalogue is
 * seated. Each marketplace keeps its own, so whatever was on screen stays
 * where it was saved, and a link's held entries go with it. Read once while
 * it stays open. Answers with the ids it could not place.
 */
export const readSavedConfig = async (): Promise<string[]> => {
  const marketplace = activeMarketplace() ?? ""
  if (openSlot === marketplace) return []
  if (!OWN_SLOT || !UNWRITTEN_SLOT) return []

  clearBeforeReading(UNWRITTEN_SLOT)
  openTheSlotOf(marketplace, OWN_SLOT)

  // Emptied first, so the answer describes this read.
  unknownOnLastRead = []
  await useConfigStore.persist.rehydrate()
  return unknownOnLastRead
}
