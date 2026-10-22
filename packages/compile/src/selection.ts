import { groupBy } from "remeda"

import type {
  CatalogRequirement,
  CatalogSkill,
  CompileCatalog,
} from "./catalog.js"
import { LOCAL_PSEUDO_CATEGORY } from "./paths.js"
import type { SelectionValidation, SkillId, ValidationError } from "./types.js"

// The catalogue is a parameter: `init --from` validates against the merged one, not the built-in.

/** A selection naming an id the catalogue lacks is a caller bug. */
function skillOrThrow(catalog: CompileCatalog, id: SkillId): CatalogSkill {
  const skill = catalog.skills[id]
  if (!skill) throw new Error(`Skill not found: ${id}`)
  return skill
}

const labelOf = (catalog: CompileCatalog, id: SkillId): string =>
  skillOrThrow(catalog, id).displayName

function validateConflicts(
  catalog: CompileCatalog,
  selections: SkillId[]
): ValidationError[] {
  return selections.flatMap((skillAId, index) => {
    const skillA = catalog.skills[skillAId]
    if (!skillA) return []

    return selections
      .slice(index + 1)
      .flatMap((skillBId) => declaredConflict(catalog, skillA, skillBId))
  })
}

function declaredConflict(
  catalog: CompileCatalog,
  skillA: CatalogSkill,
  skillBId: SkillId
): ValidationError[] {
  const conflict = (skillA.conflictsWith ?? []).find(
    (c) => c.skillId === skillBId
  )
  if (!conflict) return []

  return [
    {
      type: "conflict",
      message: `${skillA.displayName} conflicts with ${labelOf(catalog, skillBId)}: ${conflict.reason}`,
      // Boundary cast: the id came out of the catalogue's own relationship table.
      skills: [skillA.id as SkillId, skillBId],
    },
  ]
}

function validateRequirements(
  catalog: CompileCatalog,
  selections: SkillId[],
  selectedSet: ReadonlySet<SkillId>
): ValidationError[] {
  return selections.flatMap((skillId) => {
    const skill = catalog.skills[skillId]
    if (!skill) return []

    return (skill.requires ?? []).flatMap((requirement) =>
      unmetRequirement(catalog, skillId, skill, requirement, selectedSet)
    )
  })
}

function unmetRequirement(
  catalog: CompileCatalog,
  skillId: SkillId,
  skill: CatalogSkill,
  requirement: CatalogRequirement,
  selectedSet: ReadonlySet<SkillId>
): ValidationError[] {
  // Boundary cast: requirement ids come out of the catalogue's own tables.
  const requiredIds = requirement.skillIds as readonly SkillId[]

  if (requirement.needsAny) {
    if (requiredIds.some((reqId) => selectedSet.has(reqId))) return []
    return [
      {
        type: "missingRequirement",
        message: `${skill.displayName} requires one of: ${labelsOf(catalog, requiredIds)}`,
        skills: [skillId, ...requiredIds],
      },
    ]
  }

  const missingIds = requiredIds.filter((reqId) => !selectedSet.has(reqId))
  if (missingIds.length === 0) return []
  return [
    {
      type: "missingRequirement",
      message: `${skill.displayName} requires: ${labelsOf(catalog, missingIds)}`,
      skills: [skillId, ...missingIds],
    },
  ]
}

function labelsOf(catalog: CompileCatalog, ids: readonly SkillId[]): string {
  return ids.map((id) => labelOf(catalog, id)).join(", ")
}

function validateExclusivity(
  catalog: CompileCatalog,
  selections: SkillId[]
): ValidationError[] {
  const resolved = selections
    .map((skillId) => ({ skillId, skill: catalog.skills[skillId] }))
    .filter(
      (entry): entry is { skillId: SkillId; skill: CatalogSkill } =>
        entry.skill != null
    )

  return Object.entries(
    groupBy(resolved, (entry) => entry.skill.category)
  ).flatMap(([categoryId, entries]) =>
    exclusivityBreach(
      catalog,
      categoryId,
      entries.map((e) => e.skillId)
    )
  )
}

function exclusivityBreach(
  catalog: CompileCatalog,
  categoryId: string,
  skillIds: SkillId[]
): ValidationError[] {
  if (skillIds.length <= 1) return []
  // "local" is a pseudo-category without exclusivity rules
  if (categoryId === LOCAL_PSEUDO_CATEGORY) return []

  const category = catalog.categories[categoryId]
  if (category?.exclusive !== true) return []

  return [
    {
      type: "categoryExclusive",
      message: `Category "${category.displayName}" only allows one selection, but multiple selected: ${labelsOf(catalog, skillIds)}`,
      skills: skillIds,
    },
  ]
}

/** `valid` is derived from `errors`, never asserted alongside them. */
export function validateSelection(
  selections: SkillId[],
  catalog: CompileCatalog
): SelectionValidation {
  const resolvedSelections = selections.map(
    // Boundary cast: a catalogue id, typed `string` so the wire `Matrix` fits the shape.
    (id) => skillOrThrow(catalog, id).id as SkillId
  )
  const selectedSet = new Set<SkillId>(resolvedSelections)

  const errors = [
    ...validateConflicts(catalog, resolvedSelections),
    ...validateRequirements(catalog, resolvedSelections, selectedSet),
    ...validateExclusivity(catalog, resolvedSelections),
  ]

  return { valid: errors.length === 0, errors }
}
