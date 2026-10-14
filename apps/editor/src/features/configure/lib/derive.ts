// Everything the screen shows that is not stored. All pure — (catalog, config,
// search) in, view data out — so nothing here can cache a stale copy.

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
  type AgentScope,
  type LoadState,
  type PersistedConfig,
  type RosterGroupBy,
  type SkillEntry,
} from "@/stores/persisted-schema"
import { compilesAgent, offersPlacement } from "./provider"

// The selection and nothing else. Narrower than `PersistedConfig` on purpose:
// a remembered skill is not selected, so no derivation may see one.
export type ConfigSelection = Pick<
  PersistedConfig,
  "stackId" | "skills" | "agents"
>

// One shape for every skill the grid can draw. There is no second kind any
// more — an added skill is a real catalogue entry — so `added` is provenance
// for the tag and the EDITOR-22 filter, never a branch in a derivation.
export type GridSkill = {
  id: string
  displayName: string
  description: string
  monogram: string
  slug: string
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

/** One tab in the strip under the search band. */
export type DomainTab = {
  // The catalogue's enum, since picking a tab writes it to the URL.
  id: Domain
  label: string
  /** Every skill the domain holds, filtered or not. */
  skillCount: number
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

// Every skill is a directory in a repository, so every skill has an address.
// `HEAD` resolves to the repository's default branch.
const DEFAULT_REF = "HEAD"

const githubTreeUrl = (repo: string, path: string, ref = DEFAULT_REF) =>
  `https://github.com/${repo}/tree/${ref}/${path}`

// The catalogue an app nobody has pointed anywhere runs on, and what the
// install dialog names when no marketplace is loaded (EDITOR-44).
export const PUBLIC_MARKETPLACE = "agents-inc/skills"

// A skill's catalogue id is its directory name: `build marketplace` reads
// `src/skills/<id>`.
const MARKETPLACE_SKILLS_DIR = "src/skills"

// In the SEATED marketplace, whose skills the grid draws (EDITOR-44). The seat
// holds whatever was typed, so it is parsed back down; one that fails the parse
// is used as it stands, never swapped for the public repository.
const marketplaceSourceUrl = (skillId: string) => {
  const seated = activeMarketplace() ?? PUBLIC_MARKETPLACE
  const named = parseMarketplaceRef(seated)
  const repo = named ? `${named.owner}/${named.repo}` : seated

  return githubTreeUrl(repo, `${MARKETPLACE_SKILLS_DIR}/${skillId}`, named?.ref)
}

// Where a skill came from decides its address and its tag, and nothing else.
// An external skill knows its own repository and directory; a catalogue one is
// in the marketplace repository, at a path its id spells.
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
  // Selected, plus everything the selection necessarily brings with it.
  reached: ReadonlySet<string>
  // Ruled out by that.
  outOfReach: ReadonlySet<string>
}

// Judged through the seat, so a loaded marketplace's own relationships apply.
// The filter drops ids a selection still names after the catalogue dropped
// them.
const judgeSelectedSkills = (selectedIds: Iterable<string>) =>
  judgeActiveSelection(
    [...selectedIds].filter((skillId) => activeSkillById(skillId) !== undefined)
  )

export const selectReachability = (selectedIds: Set<string>): Reachability =>
  judgeSelectedSkills(selectedIds)

const nameOf = (skillId: string) =>
  activeSkillById(skillId)?.displayName ?? skillId

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
    default: {
      const _exhaustive: never = cause
      return _exhaustive
    }
  }
}

// What the roster's marker says on a row whose two scopes cannot meet: the fix,
// not the diagnosis. The fix is the sub-agent's scope on its 03 card; setting
// the skill back to global is the other way out.
export const SCOPE_ERROR = "This sub-agent must be set to project scope too"

// An enabled row this sub-agent cannot carry, because a project skill is
// installed under one project's `.claude` and a global sub-agent's front-matter
// is not. A switched-off row installs nothing either way, so it is not an error
// to resolve — the same rule every count here already keeps.
const isScopeError = (
  agents: ConfigSelection["agents"],
  entry: SkillEntry,
  agentId: string
) =>
  entry.assignments[agentId]?.enabled === true &&
  !reachesAgent(agents, entry.scope, agentId)

// Only enabled assignments count, everywhere a number appears: a row the roster
// switched off is kept for the UI but is not part of what installs. A row with
// a scope error IS part of it — that is why it blocks the install — so it
// counts like any other.
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

// Everything the grid derivation needs, gathered once rather than threaded.
type GridContext = {
  config: ConfigSelection
  search: ConfigureSearch
  // Judged once per derivation, not per cell — it holds a whole-catalogue
  // fixpoint and the grid asks it once for every skill.
  judgement: SelectionJudgement
}

// Applied to the cell, not the skill, so "selected" has one definition.
const survivesSelectionFilter = (
  cell: SkillCellView,
  search: ConfigureSearch
) => !search.sel || cell.selected

// A selected skill is never disabled, whatever the selection did to it — the
// way out of a bad combination is to click it off. Everything else renders
// the shared verdict: disabled with the reason, softly warned, or clear.
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

// Empty categories and domains are dropped, so the page never renders an empty
// header. `search.domain` is not read: a pick scrolls, it does not filter
// (EDITOR-79).
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

// The strip is the page's map: every domain, from the catalogue alone, blind
// to every filter.
export const selectDomainTabs = (): DomainTab[] =>
  activeCatalog().domains.map((domain) => ({
    id: domain.id,
    label: domain.label,
    skillCount: domain.skillCount,
  }))

// Summed from the domains, so it agrees with the strip's totals.
export const catalogueSkillCount = (): number =>
  activeCatalog().domains.reduce(
    (total, domain) => total + domain.skillCount,
    0
  )

export type RosterSkillRow = {
  id: string
  displayName: string
  load: LoadState
  // The row's own switch; the agent being off recesses it separately.
  enabled: boolean
  // Kept apart from `enabled`: that is the user's decision, this is a problem
  // to fix, and only this one has words to show.
  scopeError?: string
  // Every on-agent carrying this skill live, in roster order: the where-used
  // list. Empty opens nothing.
  usedBy: SubAgent[]
}

export type RosterAgentRow = {
  agent: SubAgent
  on: boolean
  skills: RosterSkillRow[]
}

export type RosterGroup = {
  // Domain mode writes the bare domain id, scope mode `scope:<scope>`: one
  // `rosterCollapsed` record serves both, and a domain id never holds a colon.
  key: string
  label: string
  agents: RosterAgentRow[]
}

// The catalogue answers for every skill on screen, added ones included. An id
// it misses is one a saved selection named and the catalogue has since
// dropped, which renders as itself.
const displayNameOf = (skillId: string) =>
  activeSkillById(skillId)?.displayName ?? skillId

// In the catalogue's own order, so lists never reshuffle as skills are toggled.
const allAgents = () => SUB_AGENT_GROUPS.flatMap((group) => group.agents)

const byDisplayName = (
  a: { displayName: string },
  b: { displayName: string }
) => a.displayName.localeCompare(b.displayName)

// skill id → position in the catalogue, so rows list in the grid's order and
// added skills fall to the end by name. Built per derivation: a module-level
// map would pin the vendored catalogue's positions forever.
const catalogPositions = () =>
  new Map(
    activeCatalog()
      .domains.flatMap((domain) => domain.categories)
      .flatMap((category) => category.skills)
      .map((skill, index) => [skill.id, index])
  )

const byCatalogPosition =
  (positions: Map<string, number>) =>
  (
    a: { id: string; displayName: string },
    b: { id: string; displayName: string }
  ) =>
    (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity) ||
    a.displayName.localeCompare(b.displayName)

type AgentSkill = Omit<RosterSkillRow, "usedBy">

const skillsByAgent = (config: ConfigSelection) => {
  const byAgent = new Map<string, AgentSkill[]>()

  for (const [skillId, entry] of Object.entries(config.skills)) {
    for (const [agentId, assignment] of Object.entries(entry.assignments)) {
      const bucket = byAgent.get(agentId) ?? []
      bucket.push({
        id: skillId,
        displayName: displayNameOf(skillId),
        load: assignment.load,
        enabled: assignment.enabled,
        // Kept and marked: the row is where the user learns which pair is
        // wrong. The fix is the sub-agent's scope on its 03 card.
        ...(isScopeError(config.agents, entry, agentId) && {
          scopeError: SCOPE_ERROR,
        }),
      })
      byAgent.set(agentId, bucket)
    }
  }

  return byAgent
}

// skill id → the on-agents carrying it live, in roster order. Off agents and
// switched-off rows install nothing, so they are not uses.
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

const HOST_DIRS = {
  claude: ".claude",
  codex: ".codex",
} as const satisfies Record<Provider, ".claude" | ".codex">

// Global first, the reverse of `AGENT_SCOPES`. Space, U+00B7 MIDDLE DOT, space.
const scopeBands = (provider: Provider) => {
  const dir = HOST_DIRS[provider]

  return [
    { scope: "global", label: `~/${dir} · global` },
    { scope: "project", label: `./${dir} · project` },
  ] as const satisfies readonly { scope: AgentScope; label: string }[]
}

// One agent's whole row, identical whichever way the panel is banded. The
// lookups are built once per derivation and closed over.
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

// The whole rail: every band that has agents, every agent on or off, and under
// each every assignment it holds, switched-off ones included. A band nobody
// writes to is not drawn.
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
  // Distinct sub-agents that must move to project scope before this installs;
  // Install and Share refuse while it is non-zero (EDITOR-08).
  unscopedAgentCount: number
}

const isEjected = (entry: SkillEntry) => entry.install === "eject"

const holdsAScopeError = (config: ConfigSelection, agentId: string) =>
  Object.values(config.skills).some((entry) =>
    isScopeError(config.agents, entry, agentId)
  )

// From the same `onIds` every other count uses, so a pinned-off sub-agent
// blocks nothing.
const unscopedAgentIds = (
  config: ConfigSelection,
  onIds: ReadonlySet<string>
) => [...onIds].filter((agentId) => holdsAScopeError(config, agentId))

// What would install: on agents (a pin with no skills still counts — a base
// agent), and the enabled assignments they hold. Plus the one thing standing
// between all of it and an install that works.
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
    unscopedAgentCount: unscopedAgentIds(config, onIds).length,
  }
}

// The selected skills the provider cannot install, by display name, sorted.
// A selector rather than a `ConfigSummary` field: it depends on the provider.
export const selectUnofferedPlacements = (
  config: ConfigSelection,
  provider: Provider
): string[] =>
  Object.entries(config.skills)
    .filter(([, entry]) => !offersPlacement(provider, entry))
    .map(([skillId]) => ({ displayName: displayNameOf(skillId) }))
    .sort(byDisplayName)
    .map((skill) => skill.displayName)

// The sub-agents an install would write: a Codex install drops both summoners
// (D8). Filters the answer, never the selection (ruling 3).
export const selectInstalledAgents = (
  config: ConfigSelection,
  provider: Provider
): SubAgent[] =>
  allAgents().filter(
    (agent) => isAgentOn(config, agent.id) && compilesAgent(provider, agent.id)
  )

// The on sub-agents the provider leaves out, so a surface can say so. A
// summoner nobody turned on was never in, so it is not listed.
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
  // Provenance, so the row can offer to show what it holds. The same marker
  // `GridSkill.added` carries for the cell's tag, never a branch in a
  // derivation — the inventory lists both kinds identically.
  added: boolean
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
  /** Only what this provider writes — see {@link selectInstalledAgents}. */
  agents: InventoryAgent[]
  // The on sub-agents it does not, so the pane names them rather than drawing
  // one fewer row than the roster (D18).
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

export const selectInstallInventory = (
  config: ConfigSelection,
  provider: Provider
): InstallInventory => {
  const skills = toInventorySkills(config)

  const holdsSkills = (agentId: string) =>
    Object.values(config.skills).some(
      (entry) => entry.assignments[agentId]?.enabled
    )

  return {
    project: skills.filter(inScope("project")),
    global: skills.filter(inScope("global")),
    // Through the same selector the Install button's count reads, so the pane's
    // rows and the number under them cannot disagree about one install.
    agents: selectInstalledAgents(config, provider).map((agent) => ({
      agent,
      baseOnly: !holdsSkills(agent.id),
      scope: resolveAgentOptions(config.agents, agent.id).scope,
    })),
    leftOut: selectAgentsLeftOut(config, provider),
  }
}

// What an added skill holds, readable before installing (EDITOR-03), over the
// bytes already seated.

/** One file of the directory, exactly as it was fetched. */
export type SkillContentsFile = { path: string; text: string }

export type SkillContents = {
  displayName: string
  /** `owner/name/directory` — the whole coordinate the bytes were read from. */
  coordinate: string
  /** SKILL.md first, then the rest by path, so the head of the list opens. */
  files: SkillContentsFile[]
}

// Present in every directory that gets this far: the fetch and the payload
// schema both refuse one without it.
const SKILL_MANIFEST = "SKILL.md"

const isManifest = (file: SkillContentsFile) => file.path === SKILL_MANIFEST

const byPath = (a: SkillContentsFile, b: SkillContentsFile) =>
  a.path.localeCompare(b.path)

// The manifest first, then the rest by path; the head of the list is the file
// that opens.
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

  const expansion = expandActiveStack(config.stackId)
  if (!expansion) return true

  const selectedIds = Object.keys(config.skills)
  if (!sameSet(selectedIds, expansion.skillIds)) return true

  return selectedIds.some((skillId) => {
    const entry = config.skills[skillId]
    if (!entry) return true

    return isSkillEdited(entry, expansion.assignmentsBySkill[skillId] ?? [])
  })
}
