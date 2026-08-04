import type {
  Domain,
  SkillId,
  Category,
} from "../vendor/generated/source-types"
import type { ParsedCategory, ParsedSkill } from "../schema"
import { MATRIX } from "./source"
import { DOMAIN_DESCRIPTIONS, DOMAIN_LABELS, compareDomains } from "./domains"

// One dependency group: `needsAny` picks between "all of these" and "one of
// these". `reason` is authored upstream ("SvelteKit is built on Svelte").
export type SkillRequirement = {
  skillIds: SkillId[]
  needsAny: boolean
  reason: string
}

export type CatalogSkill = {
  id: SkillId
  slug: string
  displayName: string
  description: string
  categoryId: Category
  domainId: Domain
  isRecommended: boolean
  recommendedReason?: string
  // Selecting this skill hard-excludes these.
  conflictsWith: SkillId[]
  // Soft conflict — warn, do not disable.
  discourages: SkillId[]
  // What this skill is built on. The only place a cross-category
  // incompatibility is expressed: SvelteKit requires Svelte, so picking React
  // — which Svelte conflicts with — puts SvelteKit out of reach.
  requires: SkillRequirement[]
  // Unreliable upstream: it lists whole neighbourhoods rather than genuine
  // pairings (React claims compatibility with SvelteKit), so nothing derives
  // from it. Kept because the CLI still ships it.
  compatibleWith: SkillId[]
}

export type CatalogCategory = {
  id: Category
  displayName: string
  description: string
  domainId: Domain
  // Only one skill may be picked. Drives the `pick one` tag and auto-collapse.
  exclusive: boolean
  required: boolean
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
  skillsById: Record<string, CatalogSkill>
  categoriesById: Record<string, CatalogCategory>
  skillCount: number
}

const toCatalogSkill = (
  skill: ParsedSkill,
  domainId: Domain
): CatalogSkill => ({
  id: skill.id as SkillId,
  slug: skill.slug,
  displayName: skill.displayName,
  description: skill.description,
  categoryId: skill.category as Category,
  domainId,
  isRecommended: skill.isRecommended,
  recommendedReason: skill.recommendedReason,
  conflictsWith: skill.conflictsWith.map(
    (relation) => relation.skillId as SkillId
  ),
  discourages: skill.discourages.map((relation) => relation.skillId as SkillId),
  requires: skill.requires.map((requirement) => ({
    skillIds: requirement.skillIds as SkillId[],
    needsAny: requirement.needsAny,
    reason: requirement.reason,
  })),
  compatibleWith: skill.compatibleWith as SkillId[],
})

// Categories the UI can place: a category with no domain has nowhere to render.
const placeableCategories = (categories: Record<string, ParsedCategory>) =>
  Object.values(categories).filter(
    (category): category is ParsedCategory & { domain: Domain } =>
      category.domain !== undefined
  )

const buildCatalog = (): Catalog => {
  const skillsByCategory = new Map<string, ParsedSkill[]>()
  for (const skill of Object.values(MATRIX.skills)) {
    const bucket = skillsByCategory.get(skill.category)
    if (bucket) bucket.push(skill)
    else skillsByCategory.set(skill.category, [skill])
  }

  const categories = placeableCategories(MATRIX.categories)
    .sort((a, b) => compareDomains(a.domain, b.domain) || a.order - b.order)
    .map((category): CatalogCategory => ({
      id: category.id as Category,
      displayName: category.displayName,
      description: category.description,
      domainId: category.domain,
      exclusive: category.exclusive,
      required: category.required,
      skills: (skillsByCategory.get(category.id) ?? [])
        .map((skill) => toCatalogSkill(skill, category.domain))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }))

  const byDomain = new Map<Domain, CatalogCategory[]>()
  for (const category of categories) {
    const bucket = byDomain.get(category.domainId)
    if (bucket) bucket.push(category)
    else byDomain.set(category.domainId, [category])
  }

  const domains = [...byDomain.entries()]
    .sort(([a], [b]) => compareDomains(a, b))
    .map(([id, domainCategories]): CatalogDomain => {
      return {
        id,
        label: DOMAIN_LABELS[id],
        description: DOMAIN_DESCRIPTIONS[id],
        categories: domainCategories,
        skillCount: domainCategories.reduce(
          (total, c) => total + c.skills.length,
          0
        ),
      }
    })

  const allSkills = categories.flatMap((category) => category.skills)

  return {
    domains,
    skillsById: Object.fromEntries(allSkills.map((skill) => [skill.id, skill])),
    categoriesById: Object.fromEntries(
      categories.map((category) => [category.id, category])
    ),
    skillCount: allSkills.length,
  }
}

export const CATALOG = buildCatalog()
