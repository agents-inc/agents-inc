/**
 * The catalogue is a parameter of every renderer, never a module singleton: the CLI and the editor
 * seat different ones. {@link CompileCatalog} is the narrowest shape both satisfy.
 */

import { groupBy } from "remeda"

import { typedEntries } from "./typed-object.js"
import type { Category, SkillId } from "./types.js"

export type CatalogRelation = { skillId: string; reason: string }

export type CatalogRequirement = {
  skillIds: readonly string[]
  needsAny: boolean
}

export type CatalogCategory = {
  displayName: string
  /** Absent for a category no domain claims; such a category is skipped. */
  domain?: string
  /** Absent is not exclusive. */
  exclusive?: boolean
}

export type CatalogSkill = {
  id: string
  displayName: string
  category: string
  /** The user's own skill rather than the catalogue's. */
  custom?: boolean
  conflictsWith?: readonly CatalogRelation[]
  requires?: readonly CatalogRequirement[]
  availableSources?: readonly { name: string; primary?: boolean }[]
}

export type CompileCatalog = {
  readonly categories: Readonly<Record<string, CatalogCategory | undefined>>
  readonly skills: Readonly<Record<string, CatalogSkill | undefined>>
}

/** Only a declared flag counts: an undeclared category is not exclusive. */
export function isExclusiveCategory(
  catalog: CompileCatalog,
  category: string
): boolean {
  return catalog.categories[category]?.exclusive === true
}

export function isInCatalog<Entry extends { skill: CatalogSkill | undefined }>(
  entry: Entry
): entry is Entry & { skill: CatalogSkill } {
  return entry.skill != null
}

export function skillIdsByCategory(
  entries: readonly { skillId: SkillId; category: Category }[]
): Map<Category, SkillId[]> {
  return new Map(
    typedEntries(groupBy(entries, (entry) => entry.category)).map(
      ([category, grouped]) => [category, grouped.map((entry) => entry.skillId)]
    )
  )
}

export function categoryDomain(
  catalog: CompileCatalog,
  category: string
): string | undefined {
  return catalog.categories[category]?.domain
}

export function skillDomain(
  catalog: CompileCatalog,
  skillId: string
): string | undefined {
  const skill = catalog.skills[skillId]
  return skill && categoryDomain(catalog, skill.category)
}

/** Catalogue declaration order; undeclared categories sort last, keeping arrival order. */
export function byCategoryDeclarationOrder(
  catalog: CompileCatalog
): (a: string, b: string) => number {
  const declarationRank = new Map<string, number>(
    Object.keys(catalog.categories).map((category, rank) => [category, rank])
  )
  const afterEveryDeclared = declarationRank.size
  const rankOf = (category: string): number =>
    declarationRank.get(category) ?? afterEveryDeclared

  return (a, b) => rankOf(a) - rankOf(b)
}
