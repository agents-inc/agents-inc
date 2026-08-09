// Everything the screen shows that is not stored. All pure — (catalog, config,
// search) in, view data out — so nothing here can cache a stale copy.

import {
  CATALOG,
  SUB_AGENT_GROUPS,
  expandStack,
  judgeSelection,
  skillById,
  type AssignmentTarget,
  type CatalogCategory,
  type CatalogDomain,
  type CatalogSkill,
  type IncompatibilityCause,
  type SelectionJudgement,
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
  // The skill's own directory on GitHub. Required rather than optional
  // because every skill the grid can draw has one — see `githubTreeUrl`.
  sourceUrl: string
}

export type SkillCellView = {
  skill: GridSkill
  entry: SkillEntry | undefined
  selected: boolean
  // Ruled out by the current selection, directly or through what it implies —
  // rendered disabled, never hidden.
  incompatible: boolean
  incompatibleReason?: string
  // A soft warning: the pairing is advised against, the choice stays open.
  discouragedReason?: string
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

// A skill is a directory in a repository, on both sides of the divide: the
// catalogue is generated from the marketplace repo, and an added skill arrived
// through the index carrying the repo and directory it was read from. So every
// skill on this screen has an address, and neither kind needs a fallback.
//
// `HEAD` rather than a branch name — it resolves to whatever the repository
// calls its default branch, which is the one thing neither source carries.
const githubTreeUrl = (repo: string, path: string) =>
  `https://github.com/${repo}/tree/HEAD/${path}`

// The marketplace repository, where a skill's catalogue id *is* its directory
// name. Verified 2026-08-09: the mapping is 1:1 across all 237 of them.
const MARKETPLACE_REPO = "agents-inc/skills"
const MARKETPLACE_SKILLS_DIR = "src/skills"

const marketplaceSourceUrl = (skillId: string) =>
  githubTreeUrl(MARKETPLACE_REPO, `${MARKETPLACE_SKILLS_DIR}/${skillId}`)

const toGridSkill = (skill: CatalogSkill): GridSkill => ({
  id: skill.id,
  displayName: skill.displayName,
  description: skill.description,
  monogram: monogramOf(skill.displayName),
  slug: skill.slug,
  added: false,
  sourceUrl: marketplaceSourceUrl(skill.id),
})

const addedToGridSkill = (skill: AddedSkill): GridSkill => ({
  id: skill.id,
  displayName: skill.displayName,
  description: skill.description,
  monogram: skill.monogram,
  added: true,
  sourceUrl: githubTreeUrl(skill.repo, skill.path),
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

// ── Reachability ─────────────────────────────────────────────────────────

export type Reachability = {
  // Selected, plus everything the selection necessarily brings with it.
  reached: ReadonlySet<string>
  // Ruled out by that.
  outOfReach: ReadonlySet<string>
}

// The semantics live in `@workspace/matrix` — one implementation, shared with
// the CLI — and only catalogue skills reach them: a session-added skill
// declares no relationships, so it neither rules anything out nor is ruled
// out, and its `github:` id would read to the whitelist as "no host selected".
const judgeCatalogSelection = (selectedIds: Iterable<string>) =>
  judgeSelection(
    [...selectedIds].filter((skillId) => skillById(skillId) !== undefined)
  )

export const selectReachability = (selectedIds: Set<string>): Reachability =>
  judgeCatalogSelection(selectedIds)

const nameOf = (skillId: string) => skillById(skillId)?.displayName ?? skillId

const listNames = (skillIds: readonly string[], joiner: string) =>
  skillIds.map(nameOf).join(joiner)

// The judgement says why in structure; the cell says it in words.
const incompatibleReasonOf = (cause: IncompatibilityCause): string => {
  switch (cause.kind) {
    case "conflict":
      return `Conflicts with ${nameOf(cause.skillId)}`
    case "unreachableRequirement": {
      const { requirement } = cause
      return requirement.needsAny && requirement.skillIds.length > 1
        ? `Needs one of ${listNames(requirement.skillIds, ", ")}`
        : `Needs ${listNames(requirement.skillIds, " and ")}`
    }
  }
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
  reason?: string,
  discouragedReason?: string
): SkillCellView => ({
  skill,
  entry,
  selected: entry !== undefined,
  incompatible: reason !== undefined,
  ...(reason !== undefined && { incompatibleReason: reason }),
  ...(discouragedReason !== undefined && { discouragedReason }),
  agentCount: entry ? enabledAssignments(entry).length : 0,
})

export const UNCATEGORIZED_ID = "uncategorized"

// ── Grid ─────────────────────────────────────────────────────────────────

// Everything the grid derivation needs, gathered once rather than threaded.
type GridContext = {
  config: ConfigSelection
  search: ConfigureSearch
  // Judged once per derivation, not per cell — it holds a whole-catalogue
  // fixpoint and the grid asks it once for every skill.
  judgement: SelectionJudgement
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
// way out of a bad combination is to click it off. Everything else renders
// the shared verdict: disabled with the reason, softly warned, or clear.
const toCatalogCell = (
  skill: GridSkill,
  { config, judgement }: GridContext
): SkillCellView => {
  const entry = config.skills[skill.id]

  if (entry || !skillById(skill.id)) return toCell(skill, entry)

  const verdict = judgement.verdictOf(skill.id)
  if (verdict.status === "incompatible") {
    return toCell(skill, entry, incompatibleReasonOf(verdict.cause))
  }
  if (verdict.status === "discouraged") {
    return toCell(skill, entry, undefined, verdict.reason)
  }
  return toCell(skill, entry)
}

const catalogCellsIn = (
  category: CatalogCategory,
  context: GridContext
): SkillCellView[] => {
  const { search } = context

  return category.skills
    .map(toGridSkill)
    .filter((skill) => matchesQuery(skill, search.q))
    .map((skill) => toCatalogCell(skill, context))
    .filter((cell) => survivesSelectionFilter(cell, search))
}

const addedCellsIn = (
  categoryId: string,
  context: GridContext
): SkillCellView[] => {
  const { config, search, addedByCategory } = context

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
  const context: GridContext = {
    config,
    search,
    judgement: judgeCatalogSelection(Object.keys(config.skills)),
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
  skillById(skillId)?.displayName ??
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

// The expansion's word is per sub-agent, so an edit is any row whose load
// differs from the one that row was applied with — not any row differing from
// a verdict the whole skill shared.
const sameAssignments = (
  assignments: SkillEntry["assignments"],
  targets: readonly AssignmentTarget[]
) => {
  const assignedIds = Object.keys(assignments)
  const expectedIds = targets.map((target) => target.agentId)
  if (!sameSet(assignedIds, expectedIds)) return false

  return targets.every(({ agentId, load }) => {
    const assignment = assignments[agentId]
    return assignment?.enabled === true && assignment.load === load
  })
}

const hasDefaultOptions = (entry: SkillEntry) =>
  entry.install === DEFAULT_SKILL_OPTIONS.install &&
  entry.scope === DEFAULT_SKILL_OPTIONS.scope

// Any difference from what the stack would have produced counts as an edit.
const isSkillEdited = (
  entry: SkillEntry,
  expected: readonly AssignmentTarget[]
) => !hasDefaultOptions(entry) || !sameAssignments(entry.assignments, expected)

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

  return selectedIds.some((skillId) => {
    const entry = config.skills[skillId]
    if (!entry) return true

    return isSkillEdited(entry, expansion.assignmentsBySkill[skillId] ?? [])
  })
}
