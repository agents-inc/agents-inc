import type { AgentName, SkillId } from "../vendor/generated/source-types"
import { isShippedSkillId, skillById, type CatalogSkill } from "./catalog"
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

/**
 * What targeting reads of a skill, and the whole of it: the domain it belongs
 * to, the category it sits in, and the id the shipped tables are keyed by.
 * `CatalogSkill` satisfies it, so an id alone still resolves through the
 * catalog — but a skill from another marketplace, whose id carries that
 * marketplace's namespace and is therefore in no catalog-keyed table, states
 * the taxonomy its own metadata carries and is placed on that.
 */
export type SkillTaxonomy = {
  id: string
  domainId: CatalogSkill["domainId"]
  categoryId: CatalogSkill["categoryId"]
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
// The meta agents' craft is the design and methodology bodies, by the owner's
// 2026-08-30 ruling (CLI-846). Before it they had NO entry here and no row named
// their flavor, which meant `metaSkillReach` admitted them for nothing: four of
// eighteen agents sat outside the default system entirely and no pick could
// reach them. They take the two bodies that are nobody's role in particular —
// how code is meant to read, and how research is run — because that is what a
// convention-keeper enforces, a codex-keeper documents against and a
// skill-summoner writes with. The reviewing and planning crafts stay off them
// deliberately: a diff checklist and a spec playbook are a role's material.
//
// A craft reach is targeting alone. Eagerness stays the row's answer, so a
// craft the rows never name for that flavor arrives lazily — which is how the
// reviewer receives the design skills its developers preload, and how the PM
// receives the methodology skill its researchers preload.
const CRAFT_CATEGORIES_BY_FLAVOR: Partial<
  Record<RoleFlavor, readonly CatalogSkill["categoryId"][]>
> = {
  meta: ["meta-design", "meta-methodology"],
  planning: ["meta-methodology", "meta-planning"],
  reviewer: ["meta-reviewing", "meta-design"],
}

const isRoleCraftFor = (skill: SkillTaxonomy, agent: SubAgent): boolean => {
  const craft = CRAFT_CATEGORIES_BY_FLAVOR[agent.flavor]

  return craft !== undefined && craft.includes(skill.categoryId)
}

// A meta skill reaches exactly the flavors its authored row names — across
// implementation domains and the meta agents alike. No row, no agents — except
// the crafts: a role reaches its own craft categories with or without a row, and
// since CLI-846 the meta flavor has a craft of its own. Relevance is otherwise
// the author's to claim.
const metaSkillReach = (
  skill: SkillTaxonomy,
  rowFlavors: readonly RoleFlavor[]
): readonly SubAgent[] => {
  const listedFlavors = new Set<string>(rowFlavors)

  return ROSTER.filter(
    (agent) => listedFlavors.has(agent.flavor) || isRoleCraftFor(skill, agent)
  )
}

const targetsOf = (
  skill: SkillTaxonomy,
  rowFlavors: readonly RoleFlavor[]
): readonly SubAgent[] => {
  if (skill.domainId === "meta") return metaSkillReach(skill, rowFlavors)
  // Every agent, the meta ones included since CLI-846: what a workspace is built
  // with is the convention-keeper's subject as much as the developer's.
  if (skill.domainId === "shared") return ROSTER

  return implementationDomainReach(skill.domainId)
}

// The caller's word when it has one, the catalog's when it does not: the •••
// panel and a curated stack hold nothing but an id, while a loaded marketplace
// hands its skills' own metadata straight through.
const taxonomyOf = (
  skill: string | SkillTaxonomy
): SkillTaxonomy | undefined =>
  typeof skill === "string" ? skillById(skill) : skill

// The shipped rows are keyed by the shipped catalog's own ids, so only a
// shipped skill can carry one: another marketplace's id is outside the table by
// construction rather than left out of it. `undefined` is therefore both
// answers at once — no such skill, and a skill from somewhere else — because
// the table treats them identically.
const shippedIdOf = (
  catalogued: CatalogSkill | undefined
): SkillId | undefined =>
  catalogued !== undefined && isShippedSkillId(catalogued.id)
    ? catalogued.id
    : undefined

const rowFlavorsOf = (
  defaults: PreloadDefaults,
  shippedId: SkillId | undefined
): readonly RoleFlavor[] =>
  shippedId === undefined ? [] : (defaults[shippedId] ?? [])

/**
 * Binds a resolver to a table: targeting from the skill's domain and category,
 * load per pair from the same table's gated load resolver. A caller holding a
 * skill's taxonomy states it and is answered on it, whichever marketplace the
 * id belongs to; a caller holding only an id is answered from the catalog. An
 * id the catalog does not carry and nobody named a taxonomy for — added from
 * GitHub this session, or stale — reaches nobody: relevance unknown, so callers
 * hand it to manual assignment instead of any default.
 *
 * Eagerness stays the catalog's answer, because the rows are its ids': a
 * marketplace's own skill matches none and arrives lazily, exactly as a catalog
 * skill the table leaves out does.
 */
export const createAssignmentResolver = (defaults: PreloadDefaults) => {
  const resolveLoad = createLoadStateResolver(defaults)

  return (skill: string | SkillTaxonomy): readonly AssignmentTarget[] => {
    const taxonomy = taxonomyOf(skill)
    if (!taxonomy) return []

    // Both the row and the gated load resolver are the shipped catalog's, so a
    // skill it does not carry has neither: no row to be eager by, and no id the
    // load resolver would accept. Lazy, the way absence always reads.
    const shippedId = shippedIdOf(skillById(taxonomy.id))
    const loadOn = (agentId: AgentName): LoadState =>
      shippedId === undefined
        ? "lazy"
        : resolveLoad({ skillId: shippedId, agentId })

    return targetsOf(taxonomy, rowFlavorsOf(defaults, shippedId)).map(
      (agent) => ({ agentId: agent.id, load: loadOn(agent.id) })
    )
  }
}

/** The resolver both surfaces read: `PRELOAD_DEFAULTS`, bound. */
export const resolveAssignment = createAssignmentResolver(PRELOAD_DEFAULTS)
