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

import { defaultAssignmentsFor } from "@/features/configure/lib/default-assignments"
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
  // Whatever the SEATED catalogue cannot place, dropped. Every door that seats
  // a catalogue owes this call, and WHY is in
  // `features/configure/lib/marketplace-switch.ts`, which owns the act and
  // counts the doors. Deliberately a pointer and not the reasoning: someone
  // writing a third door never opens this file, because they are not calling
  // this yet — and a warning readable only from inside the guard cannot reach
  // the door that lacks one.
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

// Whether a prune found anything at all. Both the report below and the action
// that prunes turn on it, and a question asked twice in two shapes is two
// answers waiting to disagree.
const droppedAnything = (before: PersistedConfig, after: PersistedConfig) =>
  countIds(before) !== countIds(after) || before.stackId !== after.stackId

const reportPruning = (before: PersistedConfig, after: PersistedConfig) => {
  if (!droppedAnything(before, after)) return

  const droppedIds = countIds(before) - countIds(after)
  const droppedStack = before.stackId !== null && after.stackId === null

  // Counts and a yes/no, and no id of any kind. "Catalog slugs describe nobody"
  // was true while there was one catalogue and ours; a stack id is
  // `matrixStackSchema.id`, so once a marketplace can be seated it is the ORG's
  // word — and this is the report a visitor who switched back off their
  // marketplace files, which is exactly when a stack gets pruned.
  //
  // `droppedStack` rather than `droppedStackId` costs nothing: the boolean is
  // the whole of what an observer can act on, since the id named a catalogue
  // this browser no longer has seated and could not be looked up anyway. The
  // same rule the two path reports keep, reached from the other direction —
  // there is no path here to truncate, only a value not to send.
  reportIssue("Pruned saved ids the catalog no longer knows", {
    droppedIds,
    droppedStack,
  })
}

// The keys the map on the left had and the one on the right no longer holds.
const lostKeys = (before: object, after: object) =>
  Object.keys(before).filter((id) => !(id in after))

// One id like any other, and losing it in silence is how a configuration comes
// back claiming to have been built from scratch.
const lostStack = (before: string | null, after: string | null) =>
  before !== null && after === null ? [before] : []

/**
 * The saved ids a prune could not place, named rather than counted.
 *
 * `reportPruning` above counts them for observability; these are for the person
 * whose configuration just came back smaller. A name they can go and look up is
 * the difference between a warning and a fact, which is the reason the
 * shared-link door has named a payload's since EDITOR-16 — and the screen says
 * both in the same words.
 *
 * The same three places `unknownPayloadIds` names, deliberately: the skills
 * asked for, the agents asked for, and the stack. `remembered` is not among
 * them — a deselected skill's setup was never going to be applied, so naming it
 * under "not applied" would describe a loss nothing on screen can show.
 */
export const unknownSavedIds = (
  before: PersistedConfig,
  after: PersistedConfig
): string[] => [
  ...lostKeys(before.skills, after.skills),
  ...lostKeys(before.agents, after.agents),
  ...lostStack(before.stackId, after.stackId),
]

// ── Catalog questions ────────────────────────────────────────────────────

// The loaded catalog, and nothing beside it. The guard stops a stale id from a
// previous release — or from another marketplace — surviving in storage. An
// added skill needs no second clause here: it is a real catalogue entry, so it
// answers this question the same way React does.
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

/**
 * Whether this skill has an install mode to choose at all.
 *
 * A third-party skill is ALWAYS eject — permanent rather than a v1 stopgap
 * (owner ruling 2026-08-09). A plugin install serves the third party's content
 * as-is, and we cannot write our generated metadata into their repository, so a
 * third-party skill can never be grid-native in plugin form; ejecting is the
 * only mode that lets the intake attach the confirmed category. There is no
 * convert-to-plugin path, so this is a property of the skill and not a default.
 */
export const isEjectOnly = (skillId: string) =>
  activeExternalSkill(skillId) !== undefined

const installModeFor = (skillId: string): SkillOptions["install"] =>
  isEjectOnly(skillId) ? "eject" : DEFAULT_SKILL_OPTIONS.install

// What a never-configured skill starts as: the rule's assignments, reaching
// its domain's core agents, which is what enables them. Exported because the
// cell shows this before the skill is selected — what you see in the ••• panel
// has to be what picking the skill would actually give you.
export const freshEntry = (skillId: string): SkillEntry => ({
  ...DEFAULT_SKILL_OPTIONS,
  install: installModeFor(skillId),
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
//
// `undefined` is "the catalogue turned this down", and it is not the same
// answer as an empty patch: the caller has to be able to skip `set` entirely,
// because `set` is what WRITES.
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

  // Starting from a fresh entry rather than a blank one, so a skill
  // configured before it is picked still arrives with its agents.
  const next = change(state.remembered[skillId] ?? freshEntry(skillId))
  return {
    remembered: isWorthRemembering(next)
      ? { ...state.remembered, [skillId]: next }
      : withoutKey(state.remembered, skillId),
  }
}

// `undefined` for a row nothing selected holds, for the reason `configure`
// answers with it: an empty patch would still reach `set`, and `set` writes.
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

// What the last read could not place, left where the call that asked for the
// read can pick it up.
//
// A variable rather than store state, and that is the whole constraint this
// sits under: every route out of the store is a `set`, persist wraps `set`, and
// a `set` therefore WRITES. Recording what a prune dropped through the store
// would put the pruned configuration in the slot as the price of mentioning it
// — which is the loss `pruneToCatalog`'s own early return exists to refuse. So
// the report travels beside the store rather than through it, exactly as
// `heldOpen` below does for the same reason.
let unknownOnLastRead: string[] = []

// What survives a reload. An external skill's content is not in localStorage —
// it is resolved at add time and lives for the session or travels in a payload
// — so a selection naming one would come back on the next visit pointing at a
// skill this browser can no longer describe or install.
const onlyPersistableSkills = (skills: SkillMap) =>
  Object.fromEntries(
    Object.entries(skills).filter(
      ([skillId]) =>
        skillId in activeCatalog().skillsById &&
        activeExternalSkill(skillId) === undefined
    )
  )

// The slot this browser saves into. Named rather than left to persist's own
// default because a shared configuration runs on a version of it that does not
// write, and there has to be something to make that version OF. Exactly the
// default it replaces, `undefined` included — which is what `createJSONStorage`
// answers where there is no localStorage at all, and what persist already reads
// as "no persistence here".
const OWN_SLOT = createJSONStorage(() => window.localStorage)

/**
 * The same slot, read and never written.
 *
 * What a configuration that is not this browser's runs on. Guarding every write
 * would be a rule that every action in the store — and every action added to it
 * later — has to keep; taking the pen away is one statement, made once. Reads
 * stay live because handing the slot back has to find what was in it.
 *
 * Kept pure so it can be exercised without a browser, which is the arrangement
 * `readSavedMarketplaces` established.
 */
export const withoutWrites = <T>(
  storage: PersistStorage<T>
): PersistStorage<T> => ({
  ...storage,
  setItem: () => undefined,
  // A slot emptied is a slot written, and `clearStorage` reaches this door
  // rather than the one above.
  removeItem: () => undefined,
})

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

        const expansion = expandActiveStack(stackId)
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

        // The catalog guard, ahead of `set` rather than inside its updater.
        // An arm answering `{}` reads as "change nothing" and is not one:
        // persist wraps `set` as "call it, then write", and the write half runs
        // whatever the updater returned — so a click the catalogue turned down
        // put the whole configuration back in the slot. `applyStack` above
        // makes the same return for the same reason.
        if (selecting && !isKnownSkill(skillId)) return

        set((state) => {
          const current = state.skills[skillId]

          return current
            ? deselect(state, skillId, current)
            : select(state, skillId)
        })

        // The roster's pulse narrates the selection behind it, so a deselect
        // flashes nobody — which clears whatever was still running. Read back
        // rather than recomputed, so a restored entry flashes what it restored.
        const reached = selecting ? get().skills[skillId] : undefined
        useUiStore.getState().flashAgents(liveAgentIds(reached))

        // `selecting` rather than a read-back, now that the refusal happens
        // before any of this: every toggle that reaches here lands, so what the
        // click asked for IS what happened. The read-back existed because the
        // guard used to sit inside the updater, where the event had to be told
        // apart from a selection that never happened.
        track({
          name: "skill_toggled",
          skillId,
          // Every skill on the grid has a domain now, added ones included. A
          // miss is an id the catalogue dropped between the click and this
          // read, which is not a domain anything can name.
          domainId: activeSkillById(skillId)?.domainId ?? "unknown",
          selected: selecting,
        })
      },

      setSkillOption: (skillId, patch) => {
        // Enforced twice and neither half a fallback: the panel cannot express
        // plugin for an eject-only skill, and this refuses it if anything else
        // ever tries. The same shape the CLI's own eject-only rule takes.
        const allowed =
          isEjectOnly(skillId) && patch.install === "plugin"
            ? { ...patch, install: "eject" as const }
            : patch

        // Computed, guarded, then set — the shape `pruneToCatalog` below takes,
        // and for the same reason: `set` is what writes, so an action with
        // nothing to change must not reach it at all.
        const configured = configure(get(), skillId, (entry) => ({
          ...entry,
          ...allowed,
        }))
        if (configured) set(configured)

        // One event per field, so "does anyone ever leave the defaults" is a
        // question the data can answer per segment rather than in aggregate.
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

      pruneToCatalog: () => {
        // Whatever was pulsing may have belonged to a skill that just went.
        useUiStore.getState().clearFlash()

        const pruned = pruneUnknownIds(get())
        // A prune that drops nothing is not a change, and `set` is what WRITES
        // — persist wraps it, so replacing the state with an equal copy still
        // puts that copy in the slot. Harmless everywhere but the one place
        // this is reached before the saved configuration has been read at all:
        // a restore parked on a marketplace that would not load is finished by
        // the same press that seats one, and seating one prunes. An empty store
        // written over the slot first is the configuration that press was about
        // to restore. The same early return `addExternal` makes for the same
        // reason — an action that changes nothing does nothing.
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
      // Deferred rather than read at module import, and that ordering is the
      // whole of EDITOR-31 on this side. `merge` below prunes against the
      // LOADED catalogue, and at import time the loaded catalogue is always the
      // vendored public one — no fetch can have resolved yet — so a selection
      // made on a marketplace met a catalogue that has never heard of its ids
      // and came back empty. Nothing reads storage until `readSavedConfig` is
      // called, which is the one place that knows the catalogue has settled.
      skipHydration: true,
      // An added skill's directory is not persisted, so a selection naming one
      // would resurrect a skill the next session cannot install. Saving the
      // stack is what carries it across a reload — the slot holds a payload,
      // and a payload carries the content.
      partialize: ({ stackId, skills, remembered, agents }) => ({
        stackId,
        skills: onlyPersistableSkills(skills),
        remembered: onlyPersistableSkills(remembered),
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
          //
          // The FIELD and the code, and nothing past them, because `skills`,
          // `remembered` and `agents` are `z.record`s and it is the SCHEMA that
          // decides how deep a path may be reported. Their keys are the seated
          // catalogue's ids, and `onlyPersistableSkills` persists a
          // MARKETPLACE's ids verbatim — it filters out added external skills,
          // not a marketplace's own — so on a private catalogue every key is a
          // name the org chose. This report is the discard's only trace and it
          // has no reader on screen, so its one destination is Sentry through
          // our own `/monitoring` tunnel. The same truncation
          // `readSavedMarketplaces` makes, for the same reason.
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
        // The one place both halves exist at once: the blob as it was saved,
        // and the configuration it pruned to. Nothing downstream can ask this
        // question again — by the time the store holds the answer, what was
        // dropped is gone — so it is answered here and left for the read.
        unknownOnLastRead = unknownSavedIds(parsed.data, pruned)

        return { ...current, ...pruned }
      },
    }
  )
)

// Whether the slot is being held open for a configuration that is not this
// browser's. No second source of truth to disagree with: it IS whether
// `setItem` is the real one.
let heldOpen = false

/**
 * Holds this browser's saved configuration open, for a configuration that is
 * not its own.
 *
 * A shared link is its own address with its own state (EDITOR-37), and the one
 * thing opening one must never cost is what the visitor had. Not on arrival,
 * and not through the first thing they change afterwards either — a guarantee
 * that lasts until they touch something is not a guarantee — so the slot is
 * held for as long as the shared address is, rather than only across the
 * import.
 *
 * Handed back by `readSavedConfig`, which is the only thing that ever wants it.
 */
export const detachSavedConfig = () => {
  if (heldOpen) return
  // Nowhere to write is already nothing to protect.
  if (!OWN_SLOT) return

  heldOpen = true
  useConfigStore.persist.setOptions({ storage: withoutWrites(OWN_SLOT) })
}

// The slot back, answering whether it had been held — which is the same
// question as "is what is in memory this browser's?".
const reattachSavedConfig = () => {
  if (!heldOpen) return false

  // And the answer being "no" is why what is in memory goes first.
  //
  // Emptying it cannot be left to the read that follows: `merge` meets an empty
  // slot as `undefined` and an unreadable one as a refusal, and both answer by
  // KEEPING what is already there. Correct where that is empty state, which is
  // every startup — and on the way back from a shared address it is somebody
  // else's configuration, which a visitor who had saved nothing would then
  // adopt as their own the moment they touched anything (EDITOR-42).
  //
  // Cleared while the pen is still away, so emptying it is not itself a write:
  // a visitor who HAS saved something must get their own back, not the blank
  // this leaves behind.
  useConfigStore.getState().reset()

  heldOpen = false
  useConfigStore.persist.setOptions({ storage: OWN_SLOT })
  return true
}

/**
 * Reads the configuration this browser saved, once the catalogue it was saved
 * against is seated.
 *
 * The counterpart to `skipHydration` above, and it is deliberately a call
 * rather than an effect: what has to be true before it runs — the right
 * catalogue is loaded — is not something this store can observe, so the
 * decision belongs to whoever sequences the opening.
 *
 * Once per session and not once per mount. Leaving the screen and coming back
 * must not re-read storage, because by then what is in memory includes the
 * things `partialize` deliberately never wrote — an added skill's selection
 * among them, which a second read would silently drop.
 *
 * Coming back from a shared address is the exception, and taking the slot back
 * is what says so: what is in memory then is somebody else's configuration, so
 * this browser's really does have to be read again.
 *
 * Answers with the saved ids the seated catalogue could not place, so the
 * opening can say what the read cost. A read that did not happen cost nothing,
 * which is what the early return below answers with.
 */
export const readSavedConfig = async (): Promise<string[]> => {
  const wasHeldOpen = reattachSavedConfig()
  if (!wasHeldOpen && useConfigStore.persist.hasHydrated()) return []

  // Emptied before rather than after, so the answer describes THIS read: a
  // `merge` that meets an empty slot or refuses an unreadable one drops
  // nothing and files nothing, and would otherwise leave the last read's
  // casualties standing as its own.
  unknownOnLastRead = []
  await useConfigStore.persist.rehydrate()
  return unknownOnLastRead
}

export type { SkillId }
