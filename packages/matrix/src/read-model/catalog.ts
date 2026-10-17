import {
  SKILL_IDS,
  type Domain,
  type SkillId,
} from "../vendor/generated/source-types"
import type { Matrix, MatrixCategory, MatrixSkill } from "../matrix-schema"
import { groupBy } from "./collections"
import { MATRIX } from "./source"
import {
  DOMAIN_DESCRIPTIONS,
  DOMAIN_LABELS,
  compareDomains,
  isDomain,
} from "./domains"

// Ids are `string` because marketplace catalogues carry their own ids.
// `Domain` stays closed: it is the UI's vocabulary.

export type SkillRequirement = {
  skillIds: string[]
  needsAny: boolean
  reason: string
}

export type CatalogSkill = {
  id: string
  slug: string
  displayName: string
  description: string
  categoryId: string
  domainId: Domain
  conflictsWith: string[]
  // Soft conflict: warn, do not disable.
  discourages: string[]
  requires: SkillRequirement[]
}

export type CatalogCategory = {
  id: string
  displayName: string
  description: string
  domainId: Domain
  // Only one skill may be picked.
  exclusive: boolean
  skills: CatalogSkill[]
}

export type CatalogDomain = {
  id: Domain
  label: string
  description: string
  categories: CatalogCategory[]
  skillCount: number
}

export type Catalog = {
  domains: CatalogDomain[]
  // A category with no placeable domain is absent, so even a known id can miss.
  skillsById: Record<string, CatalogSkill>
  categoriesById: Record<string, CatalogCategory>
  skillCount: number
}

const toCatalogSkill = (
  skill: MatrixSkill,
  domainId: Domain
): CatalogSkill => ({
  id: skill.id,
  slug: skill.slug,
  displayName: skill.displayName,
  description: skill.description,
  categoryId: skill.category,
  domainId,
  conflictsWith: skill.conflictsWith.map((relation) => relation.skillId),
  discourages: skill.discourages.map((relation) => relation.skillId),
  requires: skill.requires.map((requirement) => ({
    skillIds: requirement.skillIds,
    needsAny: requirement.needsAny,
    reason: requirement.reason,
  })),
})

type PlaceableCategory = MatrixCategory & { domain: Domain }

// A category naming no domain, or one the UI lacks, has nowhere to render.
const placeableCategories = (categories: Record<string, MatrixCategory>) =>
  Object.values(categories).filter(
    (category): category is PlaceableCategory =>
      category.domain !== undefined && isDomain(category.domain)
  )

const byDomainThenAuthoredOrder = (
  a: PlaceableCategory,
  b: PlaceableCategory
) => compareDomains(a.domain, b.domain) || a.order - b.order

const toCatalogCategory = (
  category: PlaceableCategory,
  skills: MatrixSkill[]
): CatalogCategory => ({
  id: category.id,
  displayName: category.displayName,
  description: category.description,
  domainId: category.domain,
  exclusive: category.exclusive,
  skills: skills
    .map((skill) => toCatalogSkill(skill, category.domain))
    .sort((a, b) => a.displayName.localeCompare(b.displayName)),
})

const toCatalogDomain = (
  id: Domain,
  categories: CatalogCategory[]
): CatalogDomain => ({
  id,
  label: DOMAIN_LABELS[id],
  description: DOMAIN_DESCRIPTIONS[id],
  categories,
  skillCount: categories.reduce(
    (total, category) => total + category.skills.length,
    0
  ),
})

export const buildCatalog = (matrix: Matrix): Catalog => {
  const skillsByCategory = groupBy(
    Object.values(matrix.skills),
    (skill) => skill.category
  )

  const categories = placeableCategories(matrix.categories)
    .sort(byDomainThenAuthoredOrder)
    .map((category) =>
      toCatalogCategory(category, skillsByCategory.get(category.id) ?? [])
    )

  const domains = [...groupBy(categories, (category) => category.domainId)]
    .sort(([a], [b]) => compareDomains(a, b))
    .map(([id, domainCategories]) => toCatalogDomain(id, domainCategories))

  const allSkills = categories.flatMap((category) => category.skills)

  return {
    domains,
    skillsById: byId(allSkills),
    categoriesById: byId(categories),
    skillCount: allSkills.length,
  }
}

const byId = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map((item) => [item.id, item]))

/** The vendored public catalogue. */
export const CATALOG = buildCatalog(MATRIX)

/** Unknown ids (session-added, dropped, another marketplace's) answer `undefined`. */
export const createSkillLookup =
  (catalog: Catalog) =>
  (skillId: string): CatalogSkill | undefined =>
    catalog.skillsById[skillId]

export const skillById = createSkillLookup(CATALOG)

const SHIPPED_IDS = new Set<string>(SKILL_IDS)

/** Whether the vendored catalogue ships this id, unlike `skillById`, which asks any bound catalogue. */
export const isShippedSkillId = (skillId: string): skillId is SkillId =>
  SHIPPED_IDS.has(skillId)
