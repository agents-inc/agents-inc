import {
  CATALOG,
  expandStack,
  skillById,
  type AssignmentTarget,
  type SkillId,
  type StackExpansion,
} from "@workspace/matrix"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import { defaultAssignmentsFor } from "@/features/configure/lib/default-assignments"
import { track } from "@/lib/analytics/track"
import { reportIssue } from "@/lib/observability/report"
import { useAddedSkillsStore } from "./added-skills-store"
import {
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
  isAgentOn,
  isWorthRemembering,
  migrateConfig,
  persistedConfigSchema,
  pruneUnknownIds,
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
  // The roster's agent click: pin the agent to the opposite of what it
  // currently derives to. Explicit in both directions, exactly like the design
  // — a pinned-off agent stays off as skills arrive, a pinned-on one installs
  // bare.
  toggleAgentPin: (agentId: string) => void
  // The roster's model word and effort meter. Only non-resting choices are
  // kept, so cycling a field back to the agent's own default removes it again.
  setAgentOption: (agentId: string, patch: Partial<AgentOptions>) => void
  // The inbound half of sharing: a fetched config replaces the selection
  // wholesale, exactly as applying a stack does.
  importConfig: (config: PersistedConfig) => void
  // The saved snapshot, restored. The same wholesale replacement, but sourced
  // from this browser rather than from a link — so it is deliberately not
  // `importConfig`, whose event counts share-link arrivals as their own cohort.
  applySavedStack: (config: PersistedConfig) => void
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

// ── Plain helpers ────────────────────────────────────────────────────────

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

// `pruneUnknownIds` dropping an id is correct and completely invisible: the
// user gets a smaller configuration back and no explanation. Counting the
// difference is what turns catalog drift into something observable, without
// changing the pure function or the tests that cover it.
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

const reportPruning = (before: PersistedConfig, after: PersistedConfig) => {
  const droppedIds = countIds(before) - countIds(after)
  const droppedStack = before.stackId !== null && after.stackId === null

  if (droppedIds === 0 && !droppedStack) return

  // Catalog slugs and counts — nothing here describes the user.
  reportIssue("Pruned saved ids the catalog no longer knows", {
    droppedIds,
    droppedStackId: droppedStack ? before.stackId : undefined,
  })
}

// ── Catalog questions ────────────────────────────────────────────────────

// The catalog, or the session. The guard stops a stale id from a previous
// release surviving in storage; the session half lets an added skill be picked.
const isKnownSkill = (skillId: string) =>
  skillId in CATALOG.skillsById ||
  useAddedSkillsStore.getState().isAdded(skillId)

const isInCategory = (skillId: string, categoryId: string) =>
  skillById(skillId)?.categoryId === categoryId

// The skill's category, but only when picking one replaces the others.
const exclusiveCategoryOf = (skillId: string) => {
  const categoryId = skillById(skillId)?.categoryId
  if (!categoryId) return undefined

  return CATALOG.categoriesById[categoryId]?.exclusive ? categoryId : undefined
}

// ── Selection transforms ─────────────────────────────────────────────────

// Deselecting costs one click; the configuration behind it can be a dozen, so
// it is set aside rather than dropped. Empty entries are not worth keeping.
const setAside = (
  remembered: SkillMap,
  skillId: string,
  entry: SkillEntry | undefined
) => {
  if (!entry) return remembered
  if (!isWorthRemembering(entry)) return withoutKey(remembered, skillId)

  return { ...remembered, [skillId]: entry }
}

// `one of`: picking replaces rather than adds. An eviction is a deselection
// the user did not click, so it keeps the same promise — swap back and it returns.
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

const deselect = (
  state: PersistedConfig,
  skillId: string,
  entry: SkillEntry
) => ({
  skills: withoutKey(state.skills, skillId),
  remembered: setAside(state.remembered, skillId, entry),
})

// What a never-configured skill starts as: the rule's assignments, reaching
// its domain's core agents, which is what enables them. Exported because the
// cell shows this before the skill is selected — what you see in the ••• panel
// has to be what picking the skill would actually give you.
export const freshEntry = (skillId: string): SkillEntry => ({
  ...DEFAULT_SKILL_OPTIONS,
  assignments: defaultAssignmentsFor(skillId),
})

// A remembered skill restores exactly what it had instead; the rule must not
// overwrite a setup the user already shaped.
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

// The agents an entry actually reaches — a switched-off row does not pulse.
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

// Configuring a skill must not select it — the ••• and the badges are their
// own controls, not a way in. So an unselected skill's options go where a
// deselected one's already go, and `select` restores them verbatim when the
// skill is eventually picked. Entries that end up saying nothing are dropped
// rather than left behind.
const configure = (
  state: PersistedConfig,
  skillId: string,
  change: (entry: SkillEntry) => SkillEntry
) => {
  const selected = state.skills[skillId]
  if (selected) {
    return { skills: { ...state.skills, [skillId]: change(selected) } }
  }

  if (!isKnownSkill(skillId)) return {}

  // Starting from a fresh entry rather than a blank one, so a skill
  // configured before it is picked still arrives with its agents.
  const next = change(state.remembered[skillId] ?? freshEntry(skillId))
  return {
    remembered: isWorthRemembering(next)
      ? { ...state.remembered, [skillId]: next }
      : withoutKey(state.remembered, skillId),
  }
}

const patchAssignment = (
  state: PersistedConfig,
  skillId: string,
  agentId: string,
  change: (current: Assignment) => Assignment
) => {
  const entry = state.skills[skillId]
  const current = entry?.assignments[agentId]
  if (!entry || !current) return {}

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

// ── Agent decisions ──────────────────────────────────────────────────────

// The map holds choices, not state: a field set back to the agent's own
// resting value stops being a choice, so its key goes rather than being stored
// as "the default, explicitly". `on` is exempt — pinning to the state the
// assignments already imply is still a decision, and the pin is what holds it
// there as skills come and go.
const withoutRestingValues = (
  entry: AgentEntry,
  resting: AgentOptions
): AgentEntry => ({
  ...(entry.on !== undefined && { on: entry.on }),
  ...(entry.model !== undefined &&
    entry.model !== resting.model && { model: entry.model }),
  ...(entry.effort !== undefined &&
    entry.effort !== resting.effort && { effort: entry.effort }),
  ...(entry.scope !== undefined &&
    entry.scope !== resting.scope && { scope: entry.scope }),
})

// An agent record left saying nothing is dropped, exactly as an empty skill
// entry is — the map stays as sparse as what the user actually decided.
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

// ── Stack expansion ──────────────────────────────────────────────────────

// The expansion answers per (skill, sub-agent) — the stack says who carries the
// skill, the shared resolver says how each of them loads it — so a framework can
// arrive resident on its domain's developer and on demand on a summoner.
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

// ── Persistence ──────────────────────────────────────────────────────────

const onlyCatalogSkills = (skills: SkillMap) =>
  Object.fromEntries(
    Object.entries(skills).filter(([skillId]) => skillId in CATALOG.skillsById)
  )

export const useConfigStore = create<ConfigState>()(
  persist(
    (set, get) => ({
      ...EMPTY,

      applyStack: (stackId) => {
        // Whatever was pulsing belonged to the selection being replaced.
        useUiStore.getState().clearFlash()

        // Emitted from the actions rather than the components because these
        // are the app's verbs: one `toggleSkill` covers the cell, the stack
        // swap and the restore, where the components are three call sites that
        // would each have to remember. `track` imports no vendor, so this
        // costs the store nothing it did not already have.
        track({ name: "stack_applied", stackId })

        if (stackId === null) {
          set({ ...EMPTY })
          return
        }

        const expansion = expandStack(stackId)
        if (!expansion) return

        set({
          stackId,
          skills: toStackSkills(expansion),
          // The explicit start-over action, which already confirms first.
          remembered: {},
          agents: {},
        })
      },

      toggleSkill: (skillId) => {
        const selecting = !(skillId in get().skills)

        set((state) => {
          const current = state.skills[skillId]

          if (current) return deselect(state, skillId, current)
          if (!isKnownSkill(skillId)) return {}

          return select(state, skillId)
        })

        // The roster's pulse narrates the selection behind it, so a deselect
        // flashes nobody — which clears whatever was still running. Read back
        // rather than recomputed, so a restored entry flashes what it restored.
        const reached = selecting ? get().skills[skillId] : undefined
        useUiStore.getState().flashAgents(liveAgentIds(reached))

        // Read back rather than assumed: the catalog guard can refuse the
        // toggle outright, and an event for a selection that never happened
        // is worse than no event at all.
        const nowSelected = skillId in get().skills
        if (nowSelected !== selecting) return

        track({
          name: "skill_toggled",
          skillId,
          // Session-added skills have no catalog entry and so no domain.
          domainId: skillById(skillId)?.domainId ?? "added",
          selected: nowSelected,
        })
      },

      setSkillOption: (skillId, patch) => {
        set((state) =>
          configure(state, skillId, (entry) => ({ ...entry, ...patch }))
        )

        // One event per field, so "does anyone ever leave the defaults" is a
        // question the data can answer per segment rather than in aggregate.
        for (const [field, value] of Object.entries(patch)) {
          track({
            name: "skill_configured",
            skillId,
            field,
            value: String(value),
          })
        }
      },

      cycleAssignment: (skillId, agentId) => {
        set((state) =>
          configure(state, skillId, (entry) => ({
            ...entry,
            assignments: cycled(entry.assignments, agentId),
          }))
        )

        track({ name: "assignment_cycled", skillId, agentId })
      },

      toggleAssignmentEnabled: (skillId, agentId) =>
        set((state) =>
          patchAssignment(state, skillId, agentId, (current) => ({
            ...current,
            enabled: !current.enabled,
          }))
        ),

      flipAssignmentLoad: (skillId, agentId) =>
        set((state) =>
          patchAssignment(state, skillId, agentId, (current) => ({
            ...current,
            load: current.load === "preloaded" ? "lazy" : "preloaded",
          }))
        ),

      toggleAgentPin: (agentId) => {
        const on = !isAgentOn(get(), agentId)

        // Spread rather than replaced: the same record holds this agent's
        // model and effort, and switching it off must not forget what it
        // would install with — the roster keeps showing both, recessed.
        set((state) => ({
          agents: {
            ...state.agents,
            [agentId]: { ...state.agents[agentId], on },
          },
        }))

        track({ name: "agent_pinned", agentId, on })
      },

      setAgentOption: (agentId, patch) => {
        set((state) => ({
          agents: configureAgent(state.agents, agentId, patch),
        }))

        // One event per field, for the same reason `skill_configured` emits
        // one: "does anyone ever leave the resting value" is a question per
        // control, not in aggregate.
        for (const [field, value] of Object.entries(patch)) {
          track({
            name: "agent_configured",
            agentId,
            field,
            value: String(value),
          })
        }
      },

      importConfig: (config) => {
        useUiStore.getState().clearFlash()
        set({ ...config })

        // Arrivals via a share link are a distinct cohort — they did not build
        // this configuration, so their funnel starts partway through.
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

      reset: () => {
        useUiStore.getState().clearFlash()
        set({ ...EMPTY })
      },
    }),
    {
      name: "agents-inc:config:v1",
      version: PERSIST_VERSION,
      migrate: migrateConfig,
      // Session-added skills have no catalog entry, so a persisted selection
      // for one would resurrect a skill the next session cannot describe.
      partialize: ({ stackId, skills, remembered, agents }) => ({
        stackId,
        skills: onlyCatalogSkills(skills),
        remembered: onlyCatalogSkills(remembered),
        agents,
      }),
      // The one untrusted boundary: anything unparseable is discarded in
      // favour of empty state rather than crashing the app.
      merge: (persisted, current) => {
        // Zustand runs `merge` after every load, including the ones that found
        // an empty storage — those arrive as `undefined`, exactly as a blob
        // `migrateConfig` refused does. Neither is a configuration this failed
        // to read, and calling them one filed the warning below against every
        // visitor who had never saved anything.
        if (persisted === undefined) return current

        const parsed = persistedConfigSchema.safeParse(persisted)
        if (!parsed.success) {
          // The app's only *silent* failure: an afternoon of configuration
          // becomes empty state, and nothing on screen says so. Paths and
          // codes only — the issues must never carry the values themselves.
          reportIssue("Discarded unreadable saved configuration", {
            persistVersion: PERSIST_VERSION,
            issues: parsed.error.issues.map(
              (issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`
            ),
          })
          return current
        }

        const pruned = pruneUnknownIds(parsed.data)
        reportPruning(parsed.data, pruned)

        return { ...current, ...pruned }
      },
    }
  )
)

export type { SkillId }
