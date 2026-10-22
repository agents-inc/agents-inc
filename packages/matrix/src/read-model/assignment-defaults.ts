import type { AgentName, SkillId } from "../vendor/generated/source-types"
import { isShippedSkillId, skillById, type CatalogSkill } from "./catalog"
import {
  PRELOAD_DEFAULTS,
  createLoadStateResolver,
  isDomainlessRoleAgent,
  type LoadState,
  type PreloadDefaults,
  type RoleFlavor,
} from "./preload-defaults"
import { SUB_AGENT_GROUPS, type SubAgent } from "./sub-agents"

// Browser-safe: the editor bundles it.

export type AssignmentTarget = {
  agentId: AgentName
  load: LoadState
}

/** Lets a skill from another marketplace, absent from the catalog, state its own taxonomy. */
export type SkillTaxonomy = {
  id: string
  domainId: CatalogSkill["domainId"]
  categoryId: CatalogSkill["categoryId"]
}

const ROSTER: readonly SubAgent[] = SUB_AGENT_GROUPS.flatMap(
  (group) => group.agents
)

const implementationDomainReach = (domainId: CatalogSkill["domainId"]) =>
  ROSTER.filter(
    (agent) => agent.domainId === domainId || isDomainlessRoleAgent(agent.id)
  )

// Categories a flavor reaches even without a row naming it. Targeting only:
// load still comes from the row, so a row-less craft skill arrives lazily.
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
  if (skill.domainId === "shared") return ROSTER

  return implementationDomainReach(skill.domainId)
}

const taxonomyOf = (
  skill: string | SkillTaxonomy
): SkillTaxonomy | undefined =>
  typeof skill === "string" ? skillById(skill) : skill

// `undefined` covers both "no such skill" and "another marketplace's skill":
// the shipped rows treat them alike.
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

/** An unknown id with no stated taxonomy reaches nobody, leaving it to manual assignment. */
export const createAssignmentResolver = (defaults: PreloadDefaults) => {
  const resolveLoad = createLoadStateResolver(defaults)

  return (skill: string | SkillTaxonomy): readonly AssignmentTarget[] => {
    const taxonomy = taxonomyOf(skill)
    if (!taxonomy) return []

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

export const resolveAssignment = createAssignmentResolver(PRELOAD_DEFAULTS)
