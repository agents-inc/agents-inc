import type { AgentName } from "../vendor/generated/source-types"
import { skillById, type CatalogSkill } from "./catalog"
import {
  PRELOAD_DEFAULTS,
  createLoadStateResolver,
  type LoadState,
  type PreloadDefaults,
  type RoleFlavor,
} from "./preload-defaults"
import { SUB_AGENT_GROUPS, type SubAgent } from "./sub-agents"

// The one place that answers "which sub-agents does a freshly picked skill
// reach, and how does each of them load it?". Both surfaces resolve against it
// — the editor's default assignments and the CLI's config generator — so the
// owner's relevance ruling ("only add skills to subagents that will reasonably
// use it") has exactly one spelling. No broadcast, not even lazy: a sub-agent
// carries only skills it would reasonably use.
//
// Hand-written and browser-safe: no filesystem, no I/O, nothing Node-only, at
// import time or ever. The editor bundles this module.

/** One sub-agent a skill reaches, and how it arrives there. */
export type AssignmentTarget = {
  agentId: AgentName
  load: LoadState
}

// The roster in display order — domain groups first, agents by label within
// each — so both surfaces list a skill's reach the same way.
const ROSTER: readonly SubAgent[] = SUB_AGENT_GROUPS.flatMap(
  (group) => group.agents
)

// A role agent with no domain prefix — the consolidated `reviewer` and `pm`.
// Their ids trapdoor into the meta GROUP for display, but their roles are
// cross-domain by nature: any implementation domain's diff is the reviewer's
// material, and any domain's feature is the planner's.
const isCrossDomainRoleAgent = (agent: SubAgent) =>
  agent.domainId === "meta" && agent.flavor !== "meta"

// Every implementation-ROLE agent. Cross-domain use is a shared skill's
// nature; the meta-flavor agents are the one standing exclusion — a review
// role and a planning role are not meta ones, so both belong here.
const NON_META_ROSTER: readonly SubAgent[] = ROSTER.filter(
  (agent) => agent.flavor !== "meta"
)

// An implementation-domain skill reaches its own domain's agents plus the
// cross-domain role agents — the reviewer reviews web and api diffs alike and
// the PM specs both, so web and api skills alike must be able to reach them.
const implementationDomainReach = (domainId: CatalogSkill["domainId"]) =>
  ROSTER.filter(
    (agent) => agent.domainId === domainId || isCrossDomainRoleAgent(agent)
  )

// A role's craft: the categories its agents reach with or without a row, keyed
// by the flavor whose craft it is. One map rather than a rule per role, so a
// second flavor earning a craft is an entry here and nothing else.
//
// The reviewer's own reviewing craft is one: the process skill preloads by
// row, the domain checklists carry no row at all — lazy by absence, per the
// owner's loading design — yet must still reach the reviewer, because being
// listed in its activation protocol and loaded per-diff is what they are for.
// The design craft is the other, by the owner's 2026-08-06 ruling: how code is
// meant to read is what a diff is judged against.
//
// The planner's crafts are the same two shapes one role over. The methodology
// craft is the 2026-08-07 ruling's: how research is run is what a spec's
// evidence is gathered by. The planning playbooks are the reviewing
// checklists': row-less per-spec material, listed in the activation protocol
// and loaded when the spec touches their artifact classes. Each names a domain
// in its slug, but the planner it reaches is domainless — one PM specs web and
// api features alike — so the category is the whole rule, as it is for the
// reviewer's checklists.
//
// A craft reach is targeting alone. Eagerness stays the row's answer, so a
// craft the rows never name for that flavor arrives lazily — which is how the
// reviewer receives the design skills its developers preload, and how the PM
// receives the methodology skill its researchers preload.
const CRAFT_CATEGORIES_BY_FLAVOR: Partial<
  Record<RoleFlavor, readonly CatalogSkill["categoryId"][]>
> = {
  planning: ["meta-methodology", "meta-planning"],
  reviewer: ["meta-reviewing", "meta-design"],
}

const isRoleCraftFor = (skill: CatalogSkill, agent: SubAgent): boolean => {
  const craft = CRAFT_CATEGORIES_BY_FLAVOR[agent.flavor]

  return craft !== undefined && craft.includes(skill.categoryId)
}

// A meta skill reaches exactly the flavors its authored row names — across
// implementation domains, and the meta agents themselves only when a row says
// "meta". No row, no agents — except the crafts: a role reaches its own craft
// categories with or without a row. Relevance is otherwise the author's to
// claim.
const metaSkillReach = (
  defaults: PreloadDefaults,
  skill: CatalogSkill
): readonly SubAgent[] => {
  const rowFlavors = new Set<string>(defaults[skill.id] ?? [])

  return ROSTER.filter(
    (agent) => rowFlavors.has(agent.flavor) || isRoleCraftFor(skill, agent)
  )
}

const targetsOf = (
  defaults: PreloadDefaults,
  skill: CatalogSkill
): readonly SubAgent[] => {
  if (skill.domainId === "meta") return metaSkillReach(defaults, skill)
  if (skill.domainId === "shared") return NON_META_ROSTER

  return implementationDomainReach(skill.domainId)
}

/**
 * Binds a resolver to a table: targeting from the skill's catalog domain, load
 * per pair from the same table's gated load resolver. An id the catalog does
 * not carry — added from GitHub this session, or stale — reaches nobody:
 * relevance unknown, so callers hand it to manual assignment instead of any
 * default.
 */
export const createAssignmentResolver = (defaults: PreloadDefaults) => {
  const resolveLoad = createLoadStateResolver(defaults)

  return (skillId: string): readonly AssignmentTarget[] => {
    const skill = skillById(skillId)
    if (!skill) return []

    return targetsOf(defaults, skill).map((agent) => ({
      agentId: agent.id,
      load: resolveLoad({ skillId: skill.id, agentId: agent.id }),
    }))
  }
}

/** The resolver both surfaces read: `PRELOAD_DEFAULTS`, bound. */
export const resolveAssignment = createAssignmentResolver(PRELOAD_DEFAULTS)
