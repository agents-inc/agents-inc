// Everything the screen shows that is not stored. All pure — (catalog, config,
// search) in, view data out — so nothing here can cache a stale copy.

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
  type AgentEffort,
  type AgentModel,
  type AgentScope,
  type LoadState,
  type PersistedConfig,
  type RosterGroupBy,
  type SkillEntry,
} from "@/stores/persisted-schema"

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

/** One tab in the strip under the search band. */
export type DomainTab = {
  // The catalogue's own id rather than a bare string, because picking a tab
  // WRITES it to the URL — `ConfigureSearch.domain` is this enum, so a widened
  // id here would make the strip the one filter that could set a domain the
  // address bar cannot hold.
  id: Domain
  label: string
  /** `01`, `02`, … — a fixed slot, so picking one never shifts the strip. */
  index: string
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

// A skill is a directory in a repository, on both sides of the divide: the
// catalogue is generated from the marketplace repo, and an added skill arrived
// through the index carrying the repo and directory it was read from. So every
// skill on this screen has an address, and neither kind needs a fallback.
//
// `HEAD` rather than a branch name — it resolves to whatever the repository
// calls its default branch, which is what an added skill's index entry carries
// none of, and what a marketplace named without one is asking for.
const DEFAULT_REF = "HEAD"

const githubTreeUrl = (repo: string, path: string, ref = DEFAULT_REF) =>
  `https://github.com/${repo}/tree/${ref}/${path}`

/**
 * The catalogue an app nobody has pointed anywhere runs on.
 *
 * Exported because the install dialog names the marketplace its command is
 * about to install from, and "none loaded" is not the name of one: a payload
 * carrying no marketplace installs from this repository, so this is what it is
 * called (EDITOR-44).
 */
export const PUBLIC_MARKETPLACE = "agents-inc/skills"

// Where a marketplace keeps its skills, and a skill's catalogue id *is* its
// directory name — `build marketplace` reads `src/skills/<id>`, so the layout
// holds for every repository it built rather than for the public one alone.
// Re-verified 2026-08-18 against the public catalogue: the mapping is 1:1 with
// nothing on either side unaccounted for.
//
// No count here, deliberately. This note read "all 237 of them" from 2026-08-09
// until the catalogue reached 238, and a verification line carrying a stale
// number reads as freshly checked while being nine days out of date — the same
// shape as the exhaustive tables that went stale six times over. The claim that
// matters is that the mapping is total, and that survives the catalogue growing.
const MARKETPLACE_SKILLS_DIR = "src/skills"

// The address of a skill the catalogue shipped, in the marketplace SEATED right
// now. It used to be the public repository whatever was loaded, which made
// every source link on a custom marketplace a 404 — the repository named does
// not hold these skills and never did (EDITOR-44).
//
// Seated rather than chosen: the grid draws the seated catalogue, so these are
// its skills, and a shared address seats a marketplace this browser never chose
// (EDITOR-37) without changing where the skills on it live.
//
// Whatever was typed reaches the seat verbatim — a pasted browser URL and the
// CLI's own `github:` prefix among them — so it is read back down with the
// parser `fetchCatalog` already reduced it with rather than pasted into a
// template. Nothing is seated that failed that parse; one that somehow did is
// left as it stands, because naming the public repository instead is the single
// thing this must never do.
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

// ── Reachability ─────────────────────────────────────────────────────────

export type Reachability = {
  // Selected, plus everything the selection necessarily brings with it.
  reached: ReadonlySet<string>
  // Ruled out by that.
  outOfReach: ReadonlySet<string>
}

// The semantics live in `@workspace/matrix` — one implementation, shared with
// the CLI — and reach them through the seat, so a loaded marketplace's skills
// are judged by that marketplace's own relationships. An added skill is in the
// catalogue too, and is judged with the rest: it declares no relationships and
// is named by none, so it neither rules anything out nor is ruled out, but the
// semantics have SEEN it. The filter is for the id a selection still names
// after the catalogue dropped it, which is a different question.
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
  }
}

/**
 * What the roster's marker says on a row whose two scopes cannot meet.
 *
 * The fix rather than the diagnosis: the row already names the skill and sits
 * under the sub-agent, so what it owes the reader is the thing to do about it.
 * Spelled once because the marker and the notice above the grid both say it.
 *
 * It is the sub-agent that is named because that is the one-click fix — its
 * scope word is on the row directly above. Setting the skill back to global is
 * the other way out, and the notice says both.
 */
export const SCOPE_ERROR = "This sub-agent must be set to project scope too"

/**
 * The same problem said above the grid, in one line, or `null` when there is
 * none.
 *
 * The third of three live signals and the widest: the marker says WHICH row,
 * the Install button says how many are left, and this says what the state is
 * and both ways out of it. All three are derived from the same count, so none
 * of them can stand while the others are gone — which is what a one-shot notice
 * set at arrival could not promise.
 *
 * It points at the marked rows rather than naming the skills. Those markers are
 * on screen, each beside the one control that resolves it, which is further
 * than a name in a sentence can get anyone.
 */
export const blockedNotice = (unscopedAgentCount: number) => {
  if (unscopedAgentCount === 0) return null

  const subject =
    unscopedAgentCount === 1
      ? "1 sub-agent needs"
      : `${unscopedAgentCount} sub-agents need`

  return `Install is blocked: ${subject} project scope. Look for the marked rows under Sub-agents, or set the skill itself to global.`
}

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
  agentCount: entry ? enabledAssignments(entry).length : 0,
})

// ── Grid ─────────────────────────────────────────────────────────────────

// Everything the grid derivation needs, gathered once rather than threaded.
type GridContext = {
  config: ConfigSelection
  search: ConfigureSearch
  // Judged once per derivation, not per cell — it holds a whole-catalogue
  // fixpoint and the grid asks it once for every skill.
  judgement: SelectionJudgement
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

// Categories that filter down to nothing are dropped, and so are the domains
// that lose all of theirs, so the page never renders an empty header.
//
// There is no trailing Added section, and its absence is the point: an added
// skill is placed by the category the user confirmed, so it renders under a
// real domain and answers the domain chip like its neighbours. The orphan
// section used to be the only home for a skill `categoriseRepo` could not
// guess a category for, and it was invisible to every filter (EDITOR-17,
// EDITOR-19).
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
    .domains.filter((domain) => isVisibleDomain(domain, search))
    .map((domain) => toDomainView(domain, context))
    .filter(hasCategories)
}
/**
 * THE STRIP IS THE PAGE'S MAP, so it is derived from the catalogue alone.
 *
 * Every domain, always, in catalogue order — deliberately blind to the search,
 * the domain pick and the `selected` filter, all three of which `selectDomainViews`
 * above answers. A strip that shrank with the filter would be a map that
 * redraws itself the moment you use it: picking `api` would leave one tab, and
 * the way back to everything else would be gone.
 *
 * The count is the domain's WHOLE size for the same reason the category counts
 * read `x of y` against the whole category — a count against a filtered list
 * says nothing.
 */
export const selectDomainTabs = (): DomainTab[] =>
  activeCatalog().domains.map((domain, position) => ({
    id: domain.id,
    label: domain.label,
    index: String(position + 1).padStart(2, "0"),
    skillCount: domain.skillCount,
  }))

// ── Roster ───────────────────────────────────────────────────────────────

export type RosterSkillRow = {
  id: string
  displayName: string
  load: LoadState
  // The row's own switch; the agent being off recesses it separately.
  enabled: boolean
  // Set when this sub-agent cannot carry this skill — the roster draws a marker
  // and the two buttons refuse. Its own field rather than folded into
  // `enabled`: that one is the user's decision and this is a problem to fix,
  // and only this one has words to show.
  scopeError?: string
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

export type RosterGroup = {
  // Domain mode writes the bare domain id; scope mode writes `scope:<scope>`.
  // One `rosterCollapsed` record serves both, and the prefix is what keeps the
  // two key spaces disjoint — a domain id can never contain a colon.
  key: string
  label: string
  onCount: number
  agents: RosterAgentRow[]
}

// The catalogue answers for every skill on screen, added ones included, so
// there is no second list to consult. An id it still misses is one a saved
// selection named and the catalogue has since dropped, which renders as itself.
const displayNameOf = (skillId: string) =>
  activeSkillById(skillId)?.displayName ?? skillId

// In the catalogue's own order, so lists never reshuffle as skills are toggled.
const allAgents = () => SUB_AGENT_GROUPS.flatMap((group) => group.agents)

const byDisplayName = (
  a: { displayName: string },
  b: { displayName: string }
) => a.displayName.localeCompare(b.displayName)

// skill id → position in the catalogue, so roster rows list in the grid's
// order — what the prototype does. Added skills fall to the end, by name.
//
// Built per derivation rather than once at module scope. A module-level map
// would be the vendored catalogue's positions forever, which is precisely the
// bug the seat exists to make unrepresentable — and it is the same reason
// nothing else in this file holds a catalogue binding across a call.
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

type AgentSkill = {
  id: string
  displayName: string
  load: LoadState
  enabled: boolean
  scopeError?: string
}

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
        // Kept, shown, and marked: the row is where the user learns WHICH pair
        // is wrong, and the sub-agent's own scope word one line above is the
        // click that resolves it.
        ...(isScopeError(config.agents, entry, agentId) && {
          scopeError: SCOPE_ERROR,
        }),
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

// The destination each scope band names, verbatim. Space, U+00B7 MIDDLE DOT,
// space. Global first, which is the REVERSE of `AGENT_SCOPES` — that order is
// the cycle the roster's scope word steps through and must not be re-sorted,
// so the banding reverses it here instead.
const SCOPE_BANDS = [
  { scope: "global", label: "~/.claude · global" },
  { scope: "project", label: "./.claude · project" },
] as const satisfies readonly { scope: AgentScope; label: string }[]

// One agent's whole row, identical whichever way the panel is banded — which
// is what lets one renderer serve both modes.
//
// The three lookups are built once per derivation and closed over, rather than
// once per agent: the roster draws eighteen rows and two of the three are the
// whole catalogue. Closing over them is what makes that structural instead of
// a note the caller has to honour.
const agentRowBuilder = (config: ConfigSelection) => {
  const byAgent = skillsByAgent(config)
  const uses = liveUsesBySkill(config)
  const inGridOrder = byCatalogPosition(catalogPositions())

  return (agent: SubAgent): RosterAgentRow => ({
    agent,
    on: isAgentOn(config, agent.id),
    ...resolveAgentOptions(config.agents, agent.id),
    skills: [...(byAgent.get(agent.id) ?? [])]
      .sort(inGridOrder)
      .map((skill): RosterSkillRow => ({
        ...skill,
        usedBy: uses.get(skill.id) ?? [],
      })),
  })
}

type ToRosterRow = ReturnType<typeof agentRowBuilder>

const toGroup = (
  key: string,
  label: string,
  agents: RosterAgentRow[]
): RosterGroup => ({
  key,
  label,
  // One expression, both bandings. Only the denominator's MEANING moves:
  // "enabled Web agents of all Web agents", or "enabled agents writing to that
  // destination of all agents writing to it".
  onCount: agents.filter((row) => row.on).length,
  agents,
})

const bandByDomain = (toRow: ToRosterRow): RosterGroup[] =>
  SUB_AGENT_GROUPS.map((group) =>
    toGroup(group.domainId, group.label, group.agents.map(toRow))
  )

const bandByScope = (
  config: ConfigSelection,
  toRow: ToRosterRow
): RosterGroup[] =>
  SCOPE_BANDS.map(({ scope, label }) =>
    toGroup(
      `scope:${scope}`,
      label,
      allAgents()
        .filter(
          (agent) =>
            resolveAgentOptions(config.agents, agent.id).scope === scope
        )
        .map(toRow)
    )
  )

const hasAgents = (group: RosterGroup) => group.agents.length > 0

// The whole right panel: every band that has agents, every agent it has — on
// or off — and under each agent every assignment it holds, including the
// switched-off ones, which render recessed rather than vanish.
//
// Two bandings, one shape. Only the key, the label and which agents fall into
// which band differ; the rows themselves are byte-identical between modes.
//
// A band nobody writes to is not drawn empty; it is not drawn. The filter is a
// no-op for domain mode, where `SUB_AGENT_GROUPS` is built BY grouping agents.
export const selectRosterGroups = (
  config: ConfigSelection,
  groupBy: RosterGroupBy = "domain"
): RosterGroup[] => {
  const toRow = agentRowBuilder(config)

  return (
    groupBy === "scope" ? bandByScope(config, toRow) : bandByDomain(toRow)
  ).filter(hasAgents)
}

// ── Summaries ────────────────────────────────────────────────────────────

export type ConfigSummary = {
  skillCount: number
  agentCount: number
  assignmentCount: number
  preloadedCount: number
  ejectedCount: number
  /**
   * Sub-agents that must be moved to project scope before this can install.
   *
   * The whole of EDITOR-08's mechanism: one number, and Install and Share
   * refuse while it is non-zero. There is exactly one rule to count today, so
   * there is no rule registry, no error type and no problems panel — a second
   * rule can be generalised for when a second rule exists.
   *
   * Distinct SUB-AGENTS rather than pairs, because that is how many clicks it
   * takes to resolve: two project skills on one global sub-agent is one scope
   * word away from working.
   */
  unscopedAgentCount: number
}

const isEjected = (entry: SkillEntry) => entry.install === "eject"

const holdsAScopeError = (config: ConfigSelection, agentId: string) =>
  Object.values(config.skills).some((entry) =>
    isScopeError(config.agents, entry, agentId)
  )

// The sub-agents that have to move before any of this installs. Filtered from
// the same `onIds` every other number here uses, which is what makes them
// already distinct — and what leaves a pinned-off sub-agent, excluded from
// every count on screen and from the payload, with nothing left to block.
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

// ── Install inventory ────────────────────────────────────────────────────

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
  agents: InventoryAgent[]
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
  config: ConfigSelection
): InstallInventory => {
  const skills = toInventorySkills(config)

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

// ── Contents ─────────────────────────────────────────────────────────────
//
// What an added skill actually holds, ready to read. A REQUIREMENT of the
// EDITOR-03 inline-content ruling rather than a nicety: a shared link carries a
// stranger's files and the CLI writes them to somebody's disk, so being able to
// read them first is what makes carrying them acceptable.
//
// Pure, like everything else here, and over the bytes the seat already has —
// added this session or arrived in a payload, both are seated before anything
// renders, so there is nothing to fetch and no second reader to build.

/** One file of the directory, exactly as it was fetched. */
export type SkillContentsFile = { path: string; text: string }

export type SkillContents = {
  displayName: string
  /** `owner/name/directory` — the whole coordinate the bytes were read from. */
  coordinate: string
  /** SKILL.md first, then the rest by path, so the head of the list opens. */
  files: SkillContentsFile[]
}

// The file Claude Code reads to learn a skill exists at all, which makes it the
// one a reader is deciding about. Present in every directory that gets this
// far: the fetch refuses one without it, and so does the payload schema.
const SKILL_MANIFEST = "SKILL.md"

const isManifest = (file: SkillContentsFile) => file.path === SKILL_MANIFEST

const byPath = (a: SkillContentsFile, b: SkillContentsFile) =>
  a.path.localeCompare(b.path)

// The manifest first whatever it sorts as, then the rest in reading order.
// Said as an ORDER rather than as a second "which one opens" field, so the
// list and the opening file cannot disagree.
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
