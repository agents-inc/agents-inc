// Pure derivations, so nothing here can cache a stale copy.

import type { Provider } from "@workspace/compile"
import {
  SUB_AGENT_GROUPS,
  type AssignmentTarget,
  type CatalogCategory,
  type CatalogDomain,
  type CatalogSkill,
  type Domain,
  type IncompatibilityCause,
  type SelectionJudgement,
  type StackExpansion,
  type SubAgent,
} from "@workspace/matrix"

import { parseMarketplaceRef } from "@/lib/api/catalog"
import type { ConfigureSearch } from "@/routes/search"
import {
  activeCatalog,
  activeExternalSkill,
  activeMarketplace,
  activeSkillById,
  expandActiveStack,
  judgeActiveSelection,
  type ExternalSkill,
} from "@/stores/catalog-store"
import {
  DEFAULT_SKILL_OPTIONS,
  isAgentOn,
  reachesAgent,
  resolveAgentOptions,
  type AgentEntry,
  type AgentScope,
  type LoadState,
  type PersistedConfig,
  type RosterGroupBy,
  type SkillEntry,
} from "@/stores/persisted-schema"
import { stackAgentPins } from "./default-assignments"
import { compilesAgent, offersPlacement } from "./provider"

// Narrower than `PersistedConfig`: no derivation may see a remembered skill.
export type ConfigSelection = Pick<
  PersistedConfig,
  "stackId" | "skills" | "agents"
>

// `added` is provenance for the tag, never a branch in a derivation.
type GridSkill = {
  id: string
  displayName: string
  description: string
  monogram: string
  slug: string
  added: boolean
  sourceUrl: string
}

export type SkillCellView = {
  skill: GridSkill
  entry: SkillEntry | undefined
  selected: boolean
  // Rendered disabled, never hidden.
  incompatible: boolean
  incompatibleReason?: string
  discouragedReason?: string
}

type CategoryView = {
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

export type DomainTab = {
  id: Domain
  label: string
  skillCount: number
}

const WORD_SEPARATORS = /[\s.+&_-]+/

const MONOGRAM_LETTERS = 2

const initialsOf = (words: readonly string[]) =>
  words.map((word) => word.charAt(0)).join("")

export const monogramOf = (displayName: string) => {
  const words = displayName.split(WORD_SEPARATORS).filter(Boolean)
  const letters =
    words.length > 1
      ? initialsOf(words.slice(0, MONOGRAM_LETTERS))
      : displayName.slice(0, MONOGRAM_LETTERS)

  return letters.toUpperCase()
}

// `HEAD` resolves to the repository's default branch.
const DEFAULT_REF = "HEAD"

const githubTreeUrl = (repo: string, path: string, ref = DEFAULT_REF) =>
  `https://github.com/${repo}/tree/${ref}/${path}`

export const PUBLIC_MARKETPLACE = "agents-inc/skills"

// `build marketplace` reads `src/skills/<id>`.
const MARKETPLACE_SKILLS_DIR = "src/skills"

// A seat that fails the parse is used as typed, never swapped for the public
// repository.
const marketplaceSourceUrl = (skillId: string) => {
  const seated = activeMarketplace() ?? PUBLIC_MARKETPLACE
  const named = parseMarketplaceRef(seated)
  const repo = named ? `${named.owner}/${named.repo}` : seated

  return githubTreeUrl(repo, `${MARKETPLACE_SKILLS_DIR}/${skillId}`, named?.ref)
}

const toGridSkill = (skill: CatalogSkill): GridSkill => {
  const external = activeExternalSkill(skill.id)

  return {
    id: skill.id,
    displayName: skill.displayName,
    description: skill.description,
    monogram: monogramOf(skill.displayName),
    slug: skill.slug,
    added: external !== undefined,
    sourceUrl: external
      ? githubTreeUrl(external.repo, external.path)
      : marketplaceSourceUrl(skill.id),
  }
}

const matchesQuery = (skill: GridSkill, query: string) => {
  if (!query) return true
  const needle = query.toLowerCase()
  return (
    skill.displayName.toLowerCase().includes(needle) ||
    skill.slug.toLowerCase().includes(needle) ||
    skill.description.toLowerCase().includes(needle)
  )
}

export type Reachability = {
  // Selected, plus everything the selection implies.
  reached: ReadonlySet<string>
  outOfReach: ReadonlySet<string>
}

// Drops ids a selection still names after the catalogue dropped them.
const judgeSelectedSkills = (selectedIds: Iterable<string>) =>
  judgeActiveSelection(
    [...selectedIds].filter((skillId) => activeSkillById(skillId) !== undefined)
  )

export const selectReachability = (selectedIds: Set<string>): Reachability =>
  judgeSelectedSkills(selectedIds)

export const displayNameOf = (skillId: string) =>
  activeSkillById(skillId)?.displayName ?? skillId

const listNames = (skillIds: readonly string[], joiner: string) =>
  skillIds.map(displayNameOf).join(joiner)

const incompatibleReasonOf = (cause: IncompatibilityCause): string => {
  switch (cause.kind) {
    case "conflict":
      return `Conflicts with ${displayNameOf(cause.skillId)}`
    case "unreachableRequirement": {
      const { requirement } = cause
      return requirement.needsAny && requirement.skillIds.length > 1
        ? `Needs one of ${listNames(requirement.skillIds, ", ")}`
        : `Needs ${listNames(requirement.skillIds, " and ")}`
    }
    default: {
      const _exhaustive: never = cause
      return _exhaustive
    }
  }
}

// The fix, not the diagnosis.
export const SCOPE_ERROR = "This sub-agent must be set to project scope too"

// A project skill cannot reach a global sub-agent. Switched-off rows install
// nothing, so they are never errors.
const isScopeError = (
  agents: ConfigSelection["agents"],
  entry: SkillEntry,
  agentId: string
) =>
  entry.assignments[agentId]?.enabled === true &&
  !reachesAgent(agents, entry.scope, agentId)

// Only enabled rows count; a scope-error row still counts, as it blocks install.
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
})

type GridContext = {
  config: ConfigSelection
  search: ConfigureSearch
  // Once per derivation: it holds a whole-catalogue fixpoint.
  judgement: SelectionJudgement
}

const survivesSelectionFilter = (
  cell: SkillCellView,
  search: ConfigureSearch
) => !search.sel || cell.selected

// A selected skill is never disabled: clicking it off is the way out.
const toGridCell = (
  skill: GridSkill,
  { config, judgement }: GridContext
): SkillCellView => {
  const entry = config.skills[skill.id]

  if (entry) return toCell(skill, entry)

  const verdict = judgement.verdictOf(skill.id)
  if (verdict.status === "incompatible") {
    return toCell(skill, entry, incompatibleReasonOf(verdict.cause))
  }
  if (verdict.status === "discouraged") {
    return toCell(skill, entry, undefined, verdict.reason)
  }
  return toCell(skill, entry)
}

const cellsIn = (
  category: CatalogCategory,
  context: GridContext
): SkillCellView[] => {
  const { search } = context

  return category.skills
    .map(toGridSkill)
    .filter((skill) => matchesQuery(skill, search.q))
    .map((skill) => toGridCell(skill, context))
    .filter((cell) => survivesSelectionFilter(cell, search))
}

const toCategoryView = (
  category: CatalogCategory,
  context: GridContext
): CategoryView => ({
  id: category.id,
  displayName: category.displayName,
  exclusive: category.exclusive,
  cells: cellsIn(category, context),
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

// `search.domain` is not read: a pick scrolls, it does not filter.
export const selectDomainViews = (
  config: ConfigSelection,
  search: ConfigureSearch
): DomainView[] => {
  const context: GridContext = {
    config,
    search,
    judgement: judgeSelectedSkills(Object.keys(config.skills)),
  }

  return activeCatalog()
    .domains.map((domain) => toDomainView(domain, context))
    .filter(hasCategories)
}

// Blind to every filter.
export const selectDomainTabs = (): DomainTab[] =>
  activeCatalog().domains.map((domain) => ({
    id: domain.id,
    label: domain.label,
    skillCount: domain.skillCount,
  }))

export const catalogueSkillCount = (): number =>
  activeCatalog().domains.reduce(
    (total, domain) => total + domain.skillCount,
    0
  )

export type RosterSkillRow = {
  id: string
  displayName: string
  load: LoadState
  enabled: boolean
  scopeError?: string
  usedBy: SubAgent[]
}

export type RosterAgentRow = {
  agent: SubAgent
  on: boolean
  skills: RosterSkillRow[]
}

export type RosterGroup = {
  // `scope:<scope>` in scope mode, so one `rosterCollapsed` record serves both.
  key: string
  label: string
  agents: RosterAgentRow[]
}

const allAgents = () => SUB_AGENT_GROUPS.flatMap((group) => group.agents)

const byDisplayName = (
  a: { displayName: string },
  b: { displayName: string }
) => a.displayName.localeCompare(b.displayName)

// Per derivation: a module-level map would pin the vendored positions.
const catalogPositions = () =>
  new Map(
    activeCatalog()
      .domains.flatMap((domain) => domain.categories)
      .flatMap((category) => category.skills)
      .map((skill, index) => [skill.id, index])
  )

const byCatalogPosition = (positions: Map<string, number>) => {
  const positionOf = (skillId: string) => positions.get(skillId) ?? Infinity

  return (
    a: { id: string; displayName: string },
    b: { id: string; displayName: string }
  ) => positionOf(a.id) - positionOf(b.id) || byDisplayName(a, b)
}

const appendTo = <K, V>(groups: Map<K, V[]>, key: K, value: V) => {
  groups.set(key, [...(groups.get(key) ?? []), value])
}

type AgentSkill = Omit<RosterSkillRow, "usedBy">

const skillsByAgent = (config: ConfigSelection) => {
  const byAgent = new Map<string, AgentSkill[]>()

  for (const [skillId, entry] of Object.entries(config.skills)) {
    for (const [agentId, assignment] of Object.entries(entry.assignments)) {
      appendTo(byAgent, agentId, {
        id: skillId,
        displayName: displayNameOf(skillId),
        load: assignment.load,
        enabled: assignment.enabled,
        ...(isScopeError(config.agents, entry, agentId) && {
          scopeError: SCOPE_ERROR,
        }),
      })
    }
  }

  return byAgent
}

const liveUsesBySkill = (config: ConfigSelection) => {
  const uses = new Map<string, SubAgent[]>()

  for (const agent of allAgents()) {
    if (!isAgentOn(config, agent.id)) continue

    for (const [skillId, entry] of Object.entries(config.skills)) {
      if (!entry.assignments[agent.id]?.enabled) continue
      appendTo(uses, skillId, agent)
    }
  }

  return uses
}

const HOST_DIRS = {
  claude: ".claude",
  codex: ".codex",
} as const satisfies Record<Provider, ".claude" | ".codex">

// Global first, the reverse of `AGENT_SCOPES`.
const scopeBands = (provider: Provider) => {
  const dir = HOST_DIRS[provider]

  return [
    { scope: "global", label: `~/${dir} · global` },
    { scope: "project", label: `./${dir} · project` },
  ] as const satisfies readonly { scope: AgentScope; label: string }[]
}

const agentRowBuilder = (config: ConfigSelection) => {
  const byAgent = skillsByAgent(config)
  const uses = liveUsesBySkill(config)
  const inGridOrder = byCatalogPosition(catalogPositions())

  return (agent: SubAgent): RosterAgentRow => ({
    agent,
    on: isAgentOn(config, agent.id),
    skills: [...(byAgent.get(agent.id) ?? [])]
      .sort(inGridOrder)
      .map((skill) => ({ ...skill, usedBy: uses.get(skill.id) ?? [] })),
  })
}

type ToRosterRow = ReturnType<typeof agentRowBuilder>

const bandByDomain = (toRow: ToRosterRow): RosterGroup[] =>
  SUB_AGENT_GROUPS.map((group) => ({
    key: group.domainId,
    label: group.label,
    agents: group.agents.map(toRow),
  }))

const writesTo =
  (config: ConfigSelection, scope: AgentScope) => (agent: SubAgent) =>
    resolveAgentOptions(config.agents, agent.id).scope === scope

const bandByScope = (
  config: ConfigSelection,
  provider: Provider,
  toRow: ToRosterRow
): RosterGroup[] =>
  scopeBands(provider).map(({ scope, label }) => ({
    key: `scope:${scope}`,
    label,
    agents: allAgents().filter(writesTo(config, scope)).map(toRow),
  }))

const hasAgents = (group: RosterGroup) => group.agents.length > 0

export const selectRosterGroups = (
  config: ConfigSelection,
  groupBy: RosterGroupBy,
  provider: Provider
): RosterGroup[] => {
  const toRow = agentRowBuilder(config)

  return (
    groupBy === "scope"
      ? bandByScope(config, provider, toRow)
      : bandByDomain(toRow)
  ).filter(hasAgents)
}

export type ConfigSummary = {
  skillCount: number
  agentCount: number
  assignmentCount: number
  preloadedCount: number
  ejectedCount: number
  // Install and Share refuse while non-zero.
  unscopedAgentCount: number
}

const isEjected = (entry: SkillEntry) => entry.install === "eject"

const holdsAScopeError = (config: ConfigSelection, agentId: string) =>
  Object.values(config.skills).some((entry) =>
    isScopeError(config.agents, entry, agentId)
  )

const unscopedAgentIds = (
  config: ConfigSelection,
  onIds: ReadonlySet<string>
) => [...onIds].filter((agentId) => holdsAScopeError(config, agentId))

const onAgentIds = (config: ConfigSelection) =>
  new Set(
    allAgents()
      // Widened so the set accepts any agent id.
      .map((agent) => agent.id as string)
      .filter((agentId) => isAgentOn(config, agentId))
  )

export const summarize = (config: ConfigSelection): ConfigSummary => {
  const entries = Object.values(config.skills)
  const onIds = onAgentIds(config)
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
    unscopedAgentCount: unscopedAgentIds(config, onIds).length,
  }
}

export const selectUnofferedPlacements = (
  config: ConfigSelection,
  provider: Provider
): string[] =>
  Object.entries(config.skills)
    .filter(([, entry]) => !offersPlacement(provider, entry))
    .map(([skillId]) => displayNameOf(skillId))
    .sort((a, b) => a.localeCompare(b))

// Filters the answer, never the selection.
export const selectInstalledAgents = (
  config: ConfigSelection,
  provider: Provider
): SubAgent[] =>
  allAgents().filter(
    (agent) => isAgentOn(config, agent.id) && compilesAgent(provider, agent.id)
  )

export const selectAgentsLeftOut = (
  config: ConfigSelection,
  provider: Provider
): SubAgent[] =>
  allAgents().filter(
    (agent) => isAgentOn(config, agent.id) && !compilesAgent(provider, agent.id)
  )

export type InventorySkill = {
  id: string
  displayName: string
  install: "plugin" | "eject"
  added: boolean
}

export type InventoryAgent = {
  agent: SubAgent
  baseOnly: boolean
  scope: AgentScope
}

export type InstallInventory = {
  project: InventorySkill[]
  global: InventorySkill[]
  agents: InventoryAgent[]
  leftOut: SubAgent[]
}

type ScopedInventorySkill = InventorySkill & { scope: "project" | "global" }

const toInventorySkills = (config: ConfigSelection): ScopedInventorySkill[] =>
  Object.entries(config.skills)
    .map(([id, entry]) => ({
      id,
      displayName: displayNameOf(id),
      install: entry.install,
      scope: entry.scope,
      added: activeExternalSkill(id) !== undefined,
    }))
    .sort(byDisplayName)

const inScope =
  (scope: ScopedInventorySkill["scope"]) => (skill: ScopedInventorySkill) =>
    skill.scope === scope

const holdsSkills = (config: ConfigSelection, agentId: string) =>
  Object.values(config.skills).some(
    (entry) => entry.assignments[agentId]?.enabled
  )

const toInventoryAgent =
  (config: ConfigSelection) =>
  (agent: SubAgent): InventoryAgent => ({
    agent,
    baseOnly: !holdsSkills(config, agent.id),
    scope: resolveAgentOptions(config.agents, agent.id).scope,
  })

export const selectInstallInventory = (
  config: ConfigSelection,
  provider: Provider
): InstallInventory => {
  const skills = toInventorySkills(config)

  return {
    project: skills.filter(inScope("project")),
    global: skills.filter(inScope("global")),
    // The same selector the Install count reads, so the two agree.
    agents: selectInstalledAgents(config, provider).map(
      toInventoryAgent(config)
    ),
    leftOut: selectAgentsLeftOut(config, provider),
  }
}

export type SkillContentsFile = { path: string; text: string }

export type SkillContents = {
  displayName: string
  /** `owner/name/directory` */
  coordinate: string
  files: SkillContentsFile[]
}

const SKILL_MANIFEST = "SKILL.md"

const isManifest = (file: SkillContentsFile) => file.path === SKILL_MANIFEST

const byPath = (a: SkillContentsFile, b: SkillContentsFile) =>
  a.path.localeCompare(b.path)

// The head of the list is the file that opens.
const inReadingOrder = (files: SkillContentsFile[]): SkillContentsFile[] => [
  ...files.filter(isManifest),
  ...files.filter((file) => !isManifest(file)).sort(byPath),
]

export const toSkillContents = (skill: ExternalSkill): SkillContents => ({
  displayName: skill.displayName,
  coordinate: `${skill.repo}/${skill.path}`,
  files: inReadingOrder(
    Object.entries(skill.files).map(([path, text]) => ({ path, text }))
  ),
})

const sameSet = (a: readonly string[], b: readonly string[]) => {
  if (a.length !== b.length) return false
  const inB = new Set(b)
  return a.every((value) => inB.has(value))
}

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

const isSkillEdited = (
  entry: SkillEntry,
  expected: readonly AssignmentTarget[]
) => !hasDefaultOptions(entry) || !sameAssignments(entry.assignments, expected)

// Agent records hold primitives only, so a field-by-field compare is whole.
const sameAgentEntry = (
  entry: AgentEntry | undefined,
  expected: AgentEntry
) => {
  if (!entry) return false

  const fields = new Map(Object.entries(entry))
  const expectedFields = Object.entries(expected)
  return (
    fields.size === expectedFields.length &&
    expectedFields.every(([field, value]) => fields.get(field) === value)
  )
}

const sameAgentRecords = (
  agents: ConfigSelection["agents"],
  expected: ConfigSelection["agents"]
) =>
  sameSet(Object.keys(agents), Object.keys(expected)) &&
  Object.entries(expected).every(([agentId, entry]) =>
    sameAgentEntry(agents[agentId], entry)
  )

const holdsAnything = (config: ConfigSelection) =>
  Object.keys(config.agents).length > 0 || Object.keys(config.skills).length > 0

const editsAStackSkill = (config: ConfigSelection, expansion: StackExpansion) =>
  Object.entries(config.skills).some(([skillId, entry]) =>
    isSkillEdited(entry, expansion.assignmentsBySkill[skillId] ?? [])
  )

// Any edit counts: options, assignments and agent records, not just selection.
export const isStackCustom = (config: ConfigSelection): boolean => {
  if (config.stackId === null) return holdsAnything(config)

  const expansion = expandActiveStack(config.stackId)
  if (!expansion) return true

  // `applyStack` writes only its pins, so any other agent record is an edit.
  if (!sameAgentRecords(config.agents, stackAgentPins(expansion))) return true
  if (!sameSet(Object.keys(config.skills), expansion.skillIds)) return true

  return editsAStackSkill(config, expansion)
}
