// Everything the screen shows that is not stored. All pure — (catalog, config,
// search) in, view data out — so nothing here can cache a stale copy.

import {
  CATALOG,
  SUB_AGENT_GROUPS,
  expandStack,
  type CatalogCategory,
  type CatalogDomain,
  type CatalogSkill,
  type SkillRequirement,
  type SubAgent,
} from "@workspace/matrix"

import type { ConfigureSearch } from "@/routes/search"
import type { AddedSkill } from "@/stores/added-skills-store"
import {
  DEFAULT_SKILL_OPTIONS,
  isAgentOn,
  resolveAgentOptions,
  type AgentEffort,
  type AgentModel,
  type AgentScope,
  type LoadState,
  type PersistedConfig,
  type SkillEntry,
} from "@/stores/persisted-schema"

// The selection and nothing else. Narrower than `PersistedConfig` on purpose:
// a remembered skill is not selected, so no derivation may see one.
export type ConfigSelection = Pick<
  PersistedConfig,
  "stackId" | "skills" | "agents"
>

// Catalog and session-added skills flattened to one shape, so the cell never
// branches on provenance — only on `added`, which draws the tag.
export type GridSkill = {
  id: string
  displayName: string
  description: string
  monogram: string
  // Catalog skills carry a slug for the logo lookup; added ones do not.
  slug?: string
  added: boolean
}

export type SkillCellView = {
  skill: GridSkill
  entry: SkillEntry | undefined
  selected: boolean
  // Ruled out by the current selection, directly or through what it implies —
  // rendered disabled, never hidden.
  incompatible: boolean
  incompatibleReason?: string
  agentCount: number
}

export type CategoryView = {
  id: string
  displayName: string
  exclusive: boolean
  cells: SkillCellView[]
}

export type DomainView = {
  id: string
  label: string
  categories: CategoryView[]
}

// Two letters: first letter of each of the first two words, else the first two.
export const monogramOf = (displayName: string) => {
  const words = displayName.split(/[\s.+&_-]+/).filter(Boolean)
  return (
    words.length > 1
      ? `${words[0]?.charAt(0) ?? ""}${words[1]?.charAt(0) ?? ""}`
      : displayName.slice(0, 2)
  ).toUpperCase()
}

const toGridSkill = (skill: CatalogSkill): GridSkill => ({
  id: skill.id,
  displayName: skill.displayName,
  description: skill.description,
  monogram: monogramOf(skill.displayName),
  slug: skill.slug,
  added: false,
})

const addedToGridSkill = (skill: AddedSkill): GridSkill => ({
  id: skill.id,
  displayName: skill.displayName,
  description: skill.description,
  monogram: skill.monogram,
  added: true,
})

const matchesQuery = (skill: GridSkill, query: string) => {
  if (!query) return true
  const needle = query.toLowerCase()
  return (
    skill.displayName.toLowerCase().includes(needle) ||
    (skill.slug?.toLowerCase().includes(needle) ?? false) ||
    skill.description.toLowerCase().includes(needle)
  )
}

const isRecommended = (skillId: string) =>
  CATALOG.skillsById[skillId]?.isRecommended ?? false

// Every framework conflicts with every other, so counting a sibling would
// disable them all the moment you pick one, with no way back.
const isExclusiveSibling = (conflictId: string, category: CatalogCategory) =>
  category.exclusive &&
  CATALOG.skillsById[conflictId]?.categoryId === category.id

// Conflicts are stored on both sides, so one direction is enough.
//
// Which conflicts count depends on *how* the other skill got there. A conflict
// with something the user actually selected is forgiven inside an exclusive
// category, because clicking this cell would swap the two. A conflict with
// something merely *implied* is not: no swap inside this category can remove
// whatever is implying it, so the invalid pair would survive the click.
const findConflict = (
  skill: CatalogSkill,
  category: CatalogCategory,
  selectedIds: Set<string>,
  reachedIds: Set<string>
) =>
  skill.conflictsWith.find((conflictId) =>
    selectedIds.has(conflictId)
      ? !isExclusiveSibling(conflictId, category)
      : reachedIds.has(conflictId)
  )

// ── Reachability ─────────────────────────────────────────────────────────

export type Reachability = {
  // Selected, plus everything the selection necessarily brings with it.
  reached: Set<string>
  // Ruled out by that.
  outOfReach: Set<string>
}

const allSkills = () => Object.values(CATALOG.skillsById)

// A group offering a choice commits the user to none of the options: "Pinia
// needs Vue *or* Nuxt" cannot say which, so it implies neither.
const isAmbiguous = (requirement: SkillRequirement) =>
  requirement.needsAny && requirement.skillIds.length > 1

// What choosing this skill necessarily also chooses.
const directlyImpliedBy = (skillId: string) =>
  (CATALOG.skillsById[skillId]?.requires ?? [])
    .filter((requirement) => !isAmbiguous(requirement))
    .flatMap((requirement) => requirement.skillIds)

// What the selection drags in behind it. Choosing Next.js is choosing React
// whether or not React was ever clicked, so a conflict with React is a
// conflict with the selection — this is the half that catches Angular.
const withImplied = (selectedIds: Set<string>) => {
  const reached = new Set(selectedIds)

  for (let settled = false; !settled;) {
    settled = true

    for (const skillId of [...reached]) {
      for (const required of directlyImpliedBy(skillId)) {
        if (reached.has(required)) continue
        reached.add(required)
        settled = false
      }
    }
  }

  return reached
}

const conflictsWithAny = (skill: CatalogSkill, reachedIds: Set<string>) =>
  skill.conflictsWith.some((conflictId) => reachedIds.has(conflictId))

// A group is met while any candidate is still reachable — for `needsAny`,
// one is enough; otherwise every candidate has to survive.
const isUnmet = (
  requirement: SkillRequirement,
  reachedIds: Set<string>,
  outOfReach: Set<string>
) => {
  const lost = (skillId: string) =>
    !reachedIds.has(skillId) && outOfReach.has(skillId)

  return requirement.needsAny
    ? requirement.skillIds.every(lost)
    : requirement.skillIds.some(lost)
}

// The first way in: something reached conflicts with it outright — Svelte,
// once React is on, and equally once Next.js is on, since that implies React.
const conflictingWith = (reachedIds: Set<string>) =>
  new Set(
    allSkills()
      .filter(
        (skill) =>
          !reachedIds.has(skill.id) && conflictsWithAny(skill, reachedIds)
      )
      .map((skill) => skill.id)
  )

// The second way in: losing a skill loses whatever was built on it, and so on
// — Vue goes, then Nuxt, then Pinia. Each round can strand more than the last,
// so this runs to a fixpoint. It terminates because a round either adds at
// least one skill or stops, and there are finitely many.
const withDependents = (reachedIds: Set<string>, seed: Set<string>) => {
  const outOfReach = new Set(seed)

  for (let settled = false; !settled;) {
    settled = true

    for (const skill of allSkills()) {
      if (reachedIds.has(skill.id) || outOfReach.has(skill.id)) continue
      if (
        skill.requires.some((requirement) =>
          isUnmet(requirement, reachedIds, outOfReach)
        )
      ) {
        outOfReach.add(skill.id)
        settled = false
      }
    }
  }

  return outOfReach
}

// Which skills the current selection has put out of reach. `requires` is the
// *only* place a cross-category incompatibility can be read: `conflictsWith`
// never leaves its own category, and `compatibleWith` is too noisy to trust.
export const selectReachability = (selectedIds: Set<string>): Reachability => {
  const reached = withImplied(selectedIds)

  return {
    reached,
    outOfReach: withDependents(reached, conflictingWith(reached)),
  }
}

const listNames = (skillIds: readonly string[], joiner: string) =>
  skillIds
    .map((skillId) => CATALOG.skillsById[skillId]?.displayName ?? skillId)
    .join(joiner)

// The actionable half of "why": what this skill would need you to pick.
const unmetReason = (
  skill: CatalogSkill,
  { reached, outOfReach }: Reachability
) => {
  const unmet = skill.requires.find((requirement) =>
    isUnmet(requirement, reached, outOfReach)
  )
  if (!unmet) return undefined

  return unmet.needsAny && unmet.skillIds.length > 1
    ? `Needs one of ${listNames(unmet.skillIds, ", ")}`
    : `Needs ${listNames(unmet.skillIds, " and ")}`
}

// Only live assignments count, everywhere a number appears: a row the roster
// switched off is kept for the UI but is not part of what installs.
const enabledAssignments = (entry: SkillEntry) =>
  Object.entries(entry.assignments).filter(
    ([, assignment]) => assignment.enabled
  )

const toCell = (
  skill: GridSkill,
  entry: SkillEntry | undefined,
  reason?: string
): SkillCellView => ({
  skill,
  entry,
  selected: entry !== undefined,
  incompatible: reason !== undefined,
  incompatibleReason: reason,
  agentCount: entry ? enabledAssignments(entry).length : 0,
})

export const UNCATEGORIZED_ID = "uncategorized"

// ── Grid ─────────────────────────────────────────────────────────────────

// Everything the grid derivation needs, gathered once rather than threaded.
type GridContext = {
  config: ConfigSelection
  search: ConfigureSearch
  selectedIds: Set<string>
  // Computed once per derivation, not per cell — it is a whole-catalogue
  // fixpoint and the grid asks it 222 times.
  reachability: Reachability
  addedByCategory: Map<string, AddedSkill[]>
}

const groupAddedByCategory = (added: AddedSkill[]) => {
  const byCategory = new Map<string, AddedSkill[]>()

  for (const skill of added) {
    const key = skill.categoryId ?? UNCATEGORIZED_ID
    const bucket = byCategory.get(key)
    if (bucket) bucket.push(skill)
    else byCategory.set(key, [skill])
  }

  return byCategory
}

const isVisibleDomain = (domain: CatalogDomain, search: ConfigureSearch) =>
  !search.domain || domain.id === search.domain

// Applied to the cell, not the skill, so "selected" has one definition.
const survivesSelectionFilter = (
  cell: SkillCellView,
  search: ConfigureSearch
) => !search.sel || cell.selected

// A selected skill is never disabled, whatever the selection did to it — the
// way out of a bad combination is to click it off.
//
// An exclusive sibling is never disabled either: picking one swaps rather than
// adds, so disabling the rest would strand the user on their first choice.
const toCatalogCell = (
  skill: GridSkill,
  category: CatalogCategory,
  { config, selectedIds, reachability }: GridContext
): SkillCellView => {
  const entry = config.skills[skill.id]
  const source = CATALOG.skillsById[skill.id]

  if (entry || !source) return toCell(skill, entry)

  const conflictId = findConflict(
    source,
    category,
    selectedIds,
    reachability.reached
  )
  if (conflictId) {
    return toCell(
      skill,
      entry,
      `Conflicts with ${CATALOG.skillsById[conflictId]?.displayName ?? conflictId}`
    )
  }

  if (!reachability.outOfReach.has(skill.id)) return toCell(skill, entry)
  return toCell(skill, entry, unmetReason(source, reachability))
}

const catalogCellsIn = (
  category: CatalogCategory,
  context: GridContext
): SkillCellView[] => {
  const { search } = context

  return category.skills
    .map(toGridSkill)
    .filter((skill) => matchesQuery(skill, search.q))
    .filter((skill) => !search.rec || isRecommended(skill.id))
    .map((skill) => toCatalogCell(skill, category, context))
    .filter((cell) => survivesSelectionFilter(cell, search))
}

// `recommended` is a catalog flag, so an added skill can never satisfy it.
const addedCellsIn = (
  categoryId: string,
  context: GridContext
): SkillCellView[] => {
  const { config, search, addedByCategory } = context
  if (search.rec) return []

  return (addedByCategory.get(categoryId) ?? [])
    .map(addedToGridSkill)
    .filter((skill) => matchesQuery(skill, search.q))
    .map((skill) => toCell(skill, config.skills[skill.id]))
    .filter((cell) => survivesSelectionFilter(cell, search))
}

const toCategoryView = (
  category: CatalogCategory,
  context: GridContext
): CategoryView => ({
  id: category.id,
  displayName: category.displayName,
  exclusive: category.exclusive,
  cells: [
    ...catalogCellsIn(category, context),
    ...addedCellsIn(category.id, context),
  ],
})

const hasCells = (category: CategoryView) => category.cells.length > 0
const hasCategories = (domain: DomainView) => domain.categories.length > 0

const toDomainView = (
  domain: CatalogDomain,
  context: GridContext
): DomainView => ({
  id: domain.id,
  label: domain.label,
  categories: domain.categories
    .map((category) => toCategoryView(category, context))
    .filter(hasCells),
})

// Its own section, so an unmatched skill does not imply a real domain.
const toAddedSection = (cells: SkillCellView[]): DomainView => ({
  id: "added",
  label: "Added",
  categories: [
    {
      id: UNCATEGORIZED_ID,
      displayName: "Uncategorized",
      exclusive: false,
      cells,
    },
  ],
})

// Categories that filter down to nothing are dropped, and so are the domains
// that lose all of theirs, so the page never renders an empty header.
export const selectDomainViews = (
  config: ConfigSelection,
  added: AddedSkill[],
  search: ConfigureSearch
): DomainView[] => {
  const selectedIds = new Set(Object.keys(config.skills))
  const context: GridContext = {
    config,
    search,
    selectedIds,
    reachability: selectReachability(selectedIds),
    addedByCategory: groupAddedByCategory(added),
  }

  const domains = CATALOG.domains
    .filter((domain) => isVisibleDomain(domain, search))
    .map((domain) => toDomainView(domain, context))
    .filter(hasCategories)

  const orphans = addedCellsIn(UNCATEGORIZED_ID, context)
  if (orphans.length === 0 || search.domain) return domains

  return [...domains, toAddedSection(orphans)]
}
// ── Roster ───────────────────────────────────────────────────────────────

export type RosterSkillRow = {
  id: string
  displayName: string
  load: LoadState
  // The row's own switch; the agent being off recesses it separately.
  enabled: boolean
  // Every on-agent carrying this skill live, in roster order. The where-used
  // number appears only when the skill reaches beyond one agent.
  usedBy: SubAgent[]
}

export type RosterAgentRow = {
  agent: SubAgent
  on: boolean
  // Resolved, never stored: the explicit choice if there is one, otherwise the
  // agent's own resting value. The row draws all three whether it is on or off.
  model: AgentModel
  effort: AgentEffort
  scope: AgentScope
  skills: RosterSkillRow[]
}

export type RosterDomainGroup = {
  domainId: string
  label: string
  onCount: number
  agents: RosterAgentRow[]
}

const displayNameOf = (skillId: string, added: AddedSkill[]) =>
  CATALOG.skillsById[skillId]?.displayName ??
  added.find((skill) => skill.id === skillId)?.displayName ??
  skillId

// In the catalogue's own order, so lists never reshuffle as skills are toggled.
const allAgents = () => SUB_AGENT_GROUPS.flatMap((group) => group.agents)

const byDisplayName = (
  a: { displayName: string },
  b: { displayName: string }
) => a.displayName.localeCompare(b.displayName)

// skill id → position in the catalogue, so roster rows list in the grid's
// order — what the prototype does. Added skills fall to the end, by name.
const CATALOG_POSITION = new Map(
  CATALOG.domains
    .flatMap((domain) => domain.categories)
    .flatMap((category) => category.skills)
    .map((skill, index) => [skill.id as string, index])
)

const byCatalogPosition = (
  a: { id: string; displayName: string },
  b: { id: string; displayName: string }
) =>
  (CATALOG_POSITION.get(a.id) ?? Infinity) -
    (CATALOG_POSITION.get(b.id) ?? Infinity) ||
  a.displayName.localeCompare(b.displayName)

type AgentSkill = {
  id: string
  displayName: string
  load: LoadState
  enabled: boolean
}

const skillsByAgent = (config: ConfigSelection, added: AddedSkill[]) => {
  const byAgent = new Map<string, AgentSkill[]>()

  for (const [skillId, entry] of Object.entries(config.skills)) {
    for (const [agentId, assignment] of Object.entries(entry.assignments)) {
      const bucket = byAgent.get(agentId) ?? []
      bucket.push({
        id: skillId,
        displayName: displayNameOf(skillId, added),
        load: assignment.load,
        enabled: assignment.enabled,
      })
      byAgent.set(agentId, bucket)
    }
  }

  return byAgent
}

// skill id → the on-agents carrying it live, in roster order — what the
// where-used tooltip lists. Off agents and switched-off rows do not count:
// the number answers "where else will this actually install".
const liveUsesBySkill = (config: ConfigSelection) => {
  const uses = new Map<string, SubAgent[]>()

  for (const agent of allAgents()) {
    if (!isAgentOn(config, agent.id)) continue

    for (const [skillId, entry] of Object.entries(config.skills)) {
      if (!entry.assignments[agent.id]?.enabled) continue
      const bucket = uses.get(skillId) ?? []
      bucket.push(agent)
      uses.set(skillId, bucket)
    }
  }

  return uses
}

// The whole right panel: every domain that has agents, every agent it has —
// on or off — and under each agent every assignment it holds, including the
// switched-off ones, which render recessed rather than vanish.
export const selectRosterGroups = (
  config: ConfigSelection,
  added: AddedSkill[]
): RosterDomainGroup[] => {
  const byAgent = skillsByAgent(config, added)
  const uses = liveUsesBySkill(config)

  return SUB_AGENT_GROUPS.map((group) => {
    const agents = group.agents.map((agent): RosterAgentRow => ({
      agent,
      on: isAgentOn(config, agent.id),
      ...resolveAgentOptions(config.agents, agent.id),
      skills: [...(byAgent.get(agent.id) ?? [])]
        .sort(byCatalogPosition)
        .map((skill): RosterSkillRow => ({
          ...skill,
          usedBy: uses.get(skill.id) ?? [],
        })),
    }))

    return {
      domainId: group.domainId,
      label: group.label,
      onCount: agents.filter((row) => row.on).length,
      agents,
    }
  })
}

// ── Summaries ────────────────────────────────────────────────────────────

export type ConfigSummary = {
  skillCount: number
  agentCount: number
  assignmentCount: number
  preloadedCount: number
  ejectedCount: number
}

const isEjected = (entry: SkillEntry) => entry.install === "eject"

// What would install: on agents (a pin with no skills still counts — a base
// agent), and the live assignments they hold.
export const summarize = (config: ConfigSelection): ConfigSummary => {
  const entries = Object.values(config.skills)
  const onIds = new Set(
    allAgents()
      .map((agent) => agent.id as string)
      .filter((agentId) => isAgentOn(config, agentId))
  )
  const live = entries
    .flatMap(enabledAssignments)
    .filter(([agentId]) => onIds.has(agentId))

  return {
    skillCount: entries.length,
    agentCount: onIds.size,
    assignmentCount: live.length,
    preloadedCount: live.filter(
      ([, assignment]) => assignment.load === "preloaded"
    ).length,
    ejectedCount: entries.filter(isEjected).length,
  }
}

// ── Install inventory ────────────────────────────────────────────────────

export type InventorySkill = {
  id: string
  displayName: string
  install: "plugin" | "eject"
}

export type InventoryAgent = {
  agent: SubAgent
  // Pinned on with nothing assigned — installs as front-matter only.
  baseOnly: boolean
  // Where its front-matter lands, which is what splits the pane in two.
  scope: AgentScope
}

export type InstallInventory = {
  project: InventorySkill[]
  global: InventorySkill[]
  agents: InventoryAgent[]
}

type ScopedInventorySkill = InventorySkill & { scope: "project" | "global" }

const toInventorySkills = (
  config: ConfigSelection,
  added: AddedSkill[]
): ScopedInventorySkill[] =>
  Object.entries(config.skills)
    .map(([id, entry]) => ({
      id,
      displayName: displayNameOf(id, added),
      install: entry.install,
      scope: entry.scope,
    }))
    .sort(byDisplayName)

const inScope =
  (scope: ScopedInventorySkill["scope"]) => (skill: ScopedInventorySkill) =>
    skill.scope === scope

export const selectInstallInventory = (
  config: ConfigSelection,
  added: AddedSkill[]
): InstallInventory => {
  const skills = toInventorySkills(config, added)

  const holdsSkills = (agentId: string) =>
    Object.values(config.skills).some(
      (entry) => entry.assignments[agentId]?.enabled
    )

  return {
    project: skills.filter(inScope("project")),
    global: skills.filter(inScope("global")),
    agents: allAgents()
      .filter((agent) => isAgentOn(config, agent.id))
      .map((agent) => ({
        agent,
        baseOnly: !holdsSkills(agent.id),
        scope: resolveAgentOptions(config.agents, agent.id).scope,
      })),
  }
}

// ── Stack ────────────────────────────────────────────────────────────────

const sameSet = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false
  const inB = new Set(b)
  return a.every((value) => inB.has(value))
}

const sameAssignments = (
  assignments: SkillEntry["assignments"],
  agents: readonly string[],
  preloaded: boolean
) => {
  const assignedIds = Object.keys(assignments)
  if (!sameSet(assignedIds, agents)) return false

  const expected: LoadState = preloaded ? "preloaded" : "lazy"
  return assignedIds.every((agentId) => {
    const assignment = assignments[agentId]
    return assignment?.enabled === true && assignment.load === expected
  })
}

const hasDefaultOptions = (entry: SkillEntry) =>
  entry.install === DEFAULT_SKILL_OPTIONS.install &&
  entry.scope === DEFAULT_SKILL_OPTIONS.scope

// Any difference from what the stack would have produced counts as an edit.
const isSkillEdited = (
  entry: SkillEntry,
  expectedAgents: readonly string[],
  preloaded: boolean
) =>
  !hasDefaultOptions(entry) ||
  !sameAssignments(entry.assignments, expectedAgents, preloaded)

// The design's "Custom" label, where any edit counts — so options, assignments
// and every agent decision are compared, not just which skills are selected.
export const isStackCustom = (config: ConfigSelection): boolean => {
  // `applyStack` writes no agent records at all, so any entry in that map is
  // an edit — a pin in either direction, and equally a model or an effort.
  if (Object.keys(config.agents).length > 0) return true

  if (config.stackId === null) return Object.keys(config.skills).length > 0

  const expansion = expandStack(config.stackId)
  if (!expansion) return true

  const selectedIds = Object.keys(config.skills)
  if (!sameSet(selectedIds, expansion.skillIds)) return true

  const preloaded = new Set<string>(expansion.preloadedSkillIds)

  return selectedIds.some((skillId) => {
    const entry = config.skills[skillId]
    if (!entry) return true

    return isSkillEdited(
      entry,
      expansion.agentsBySkill[skillId] ?? [],
      preloaded.has(skillId)
    )
  })
}
