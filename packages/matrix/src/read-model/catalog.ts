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

// Ids are `string` throughout, and that is the point rather than a loosening.
// A catalogue is no longer only the vendored one: the editor fetches a
// marketplace's `catalog.json` and builds these same read models over it, and a
// marketplace's ids are its own — `SkillId` would reject every one of them by
// construction. The vendored unions still narrow what the VENDORED artefact is
// allowed to contain, in `built-in-matrix.ts`, which is the boundary that
// question belongs to.
//
// `Domain` is the exception and stays closed, because it is not the
// catalogue's vocabulary — it is the UI's. Nine domains have labels, an order
// and a filter chip, so a category naming a tenth has nowhere to render; it is
// dropped exactly as one naming no domain already was.

// One dependency group: `needsAny` picks between "all of these" and "one of
// these". `reason` is authored upstream ("SvelteKit is built on Svelte").
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
  // Selecting this skill hard-excludes these.
  conflictsWith: string[]
  // Soft conflict — warn, do not disable.
  discourages: string[]
  // What this skill is built on. The only place a cross-category
  // incompatibility is expressed: SvelteKit requires Svelte, so picking React
  // — which Svelte conflicts with — puts SvelteKit out of reach.
  requires: SkillRequirement[]
}

export type CatalogCategory = {
  id: string
  displayName: string
  description: string
  domainId: Domain
  // Only one skill may be picked. Drives the `pick one` tag and auto-collapse.
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
  // Both indexes hold the ids this catalogue ships and nothing else: a category
  // with no placeable domain never reaches them, so even a known id can miss —
  // and once the catalogue can be a marketplace's, so can an id from another
  // one. Keyed by `string` rather than by a union, which under
  // `noUncheckedIndexedAccess` is what already types every read as "or nothing".
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

// Categories the UI can place. A category has nowhere to render when it names
// no domain, and equally when it names one the UI has never heard of — a
// marketplace is free to invent a category id but not a domain, because a
// domain is a labelled section with an order and a filter chip.
const placeableCategories = (categories: Record<string, MatrixCategory>) =>
  Object.values(categories).filter(
    (category): category is PlaceableCategory =>
      category.domain !== undefined && isDomain(category.domain)
  )

// Domain order first, then the category order authored upstream.
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

/**
 * The read model, over any catalogue in the wire shape.
 *
 * Exported because the vendored matrix is no longer the only one: the editor
 * fetches a marketplace's `catalog.json`, parses it with `matrixSchema`, and
 * builds exactly this — same derivation, same sorting, same placement rules, so
 * a marketplace's grid cannot render by a different set of rules than the
 * public one's.
 */
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

// `indexById`'s open-vocabulary twin. That one keys by a finite union and is
// therefore `Partial`; these ids are `string`, so `noUncheckedIndexedAccess`
// already says a read may miss and no cast is needed to say it again.
const byId = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map((item) => [item.id, item]))

/** The vendored public catalogue — what an app nobody has pointed anywhere shows. */
export const CATALOG = buildCatalog(MATRIX)

/**
 * The catalogue asked with an open id.
 *
 * The question reaching it is not always an id the catalogue carries: the
 * editor mints `github:owner/repo` ids for skills added mid-session, a saved
 * configuration can name one a later catalogue dropped, and a configuration
 * built against one marketplace can be asked of another. All three are answered
 * — `undefined` — rather than rejected, which is what keeps the guards at those
 * call sites doing real work.
 */
export const createSkillLookup =
  (catalog: Catalog) =>
  (skillId: string): CatalogSkill | undefined =>
    catalog.skillsById[skillId]

/** The lookup bound to the vendored catalogue. */
export const skillById = createSkillLookup(CATALOG)

const SHIPPED_IDS = new Set<string>(SKILL_IDS)

/**
 * Whether this id is one the VENDORED catalogue ships.
 *
 * Not "does some catalogue carry it" — `skillById` answers that, of whichever
 * catalogue it is bound to. This is the narrower question, and the only surface
 * that needs it is a table authored against the shipped ids: a marketplace's
 * skill cannot have a row in one by construction, so it is outside the table
 * rather than left out of it.
 */
export const isShippedSkillId = (skillId: string): skillId is SkillId =>
  SHIPPED_IDS.has(skillId)
