import type {
  CatalogCategory,
  CatalogSkill,
  CompileCatalog,
} from "../../catalog"

/**
 * A catalogue small enough to read in the spec that uses it. `displayName` and `category` have no
 * default: messages name the one and grouping reads the other, so a spec states both.
 */
export function buildCatalogSkill(
  id: string,
  fields: Pick<CatalogSkill, "displayName" | "category"> &
    Partial<Omit<CatalogSkill, "id">>
): CatalogSkill {
  return { id, ...fields }
}

/** `displayName` is required: the exclusivity message names it. */
export function buildCatalogCategory(
  fields: Pick<CatalogCategory, "displayName"> & Partial<CatalogCategory>
): CatalogCategory {
  return { ...fields }
}

/** Categories keep their key order: it is the catalogue's declaration order. */
export function buildCatalog(
  categories: Record<string, CatalogCategory>,
  skills: readonly CatalogSkill[]
): CompileCatalog {
  return {
    categories,
    skills: Object.fromEntries(skills.map((skill) => [skill.id, skill])),
  }
}
