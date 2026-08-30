/**
 * The catalogue as an emission reads it, and the one rule about how it arrives:
 * it is a parameter of every function here, never a module the renderers reach
 * for.
 *
 * Two surfaces render the same bytes and they seat different catalogues. The CLI
 * merges the machine's locally-authored skills onto the built-in matrix at
 * startup — `initializeMatrix` REPLACES the matrix after that merge — and the
 * editor seats whatever catalogue it fetched. A renderer that read a module
 * singleton would answer differently in the two places with nothing to say so,
 * and the bytes it decides are not cosmetic: category declaration order is the
 * key order of a compiled sub-agent's skill-activation table.
 *
 * {@link CompileCatalog} is the narrowest shape both seats satisfy — the CLI's
 * `MergedSkillsMatrix` and `@workspace/matrix`'s wire `Matrix`. It names the
 * fields an emission reads and nothing else, so neither caller has to build a
 * catalogue it does not already hold.
 */

/** One relationship rule as the emission's validation reads it. */
export type CatalogRelation = { skillId: string; reason: string }

/** One dependency rule as the emission's validation reads it. */
export type CatalogRequirement = {
  skillIds: readonly string[]
  needsAny: boolean
}

export type CatalogCategory = {
  displayName: string
  /** Absent for a category no domain claims; such a category is skipped rather than placed. */
  domain?: string
  /** A category that holds at most one skill. Absent is NOT exclusive — see {@link isExclusiveCategory}. */
  exclusive?: boolean
}

export type CatalogSkill = {
  id: string
  displayName: string
  category: string
  /** Declared by the skill's own metadata as the user's rather than the catalogue's. */
  custom?: boolean
  conflictsWith?: readonly CatalogRelation[]
  requires?: readonly CatalogRequirement[]
  availableSources?: readonly { name: string; primary?: boolean }[]
}

export type CompileCatalog = {
  readonly categories: Readonly<Record<string, CatalogCategory | undefined>>
  readonly skills: Readonly<Record<string, CatalogSkill | undefined>>
}

/**
 * True when the catalogue DECLARES this category as holding at most one skill.
 *
 * A category the catalogue does not declare is deliberately NOT treated as
 * exclusive, and that is a choice rather than a default: a rule that decides what
 * gets persisted must fire on a flag the data actually carries. The wizard's
 * toggle handler reads the same flag as `?? true` while a selection is being
 * made, which is a different question.
 */
export function isExclusiveCategory(
  catalog: CompileCatalog,
  category: string
): boolean {
  return catalog.categories[category]?.exclusive === true
}

/** A category's domain, or `undefined` for one the catalogue places nowhere. */
export function categoryDomain(
  catalog: CompileCatalog,
  category: string
): string | undefined {
  return catalog.categories[category]?.domain
}

/**
 * A comparator putting categories in the order the catalogue declares them, so
 * any surface that emits categories emits them in an order decided by the roster
 * rather than by the order it happened to build them in. A category the catalogue
 * does not declare sorts after every declared one, keeping the order it arrived
 * in — `Array.prototype.sort` is stable.
 */
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
