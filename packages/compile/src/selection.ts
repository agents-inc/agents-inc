import { groupBy } from "remeda"

import type { CompileCatalog, CatalogSkill } from "./catalog.js"
import { LOCAL_PSEUDO_CATEGORY } from "./paths.js"
import type { SelectionValidation, SkillId, ValidationError } from "./types.js"

/**
 * The three relationship rules a selection is judged against, as a total function
 * of a selection and a catalogue.
 *
 * The catalogue is a parameter here for the same reason it is one in the
 * renderers: `init --from` validates a shared payload against the catalogue the
 * install loaded, which is the merged one rather than the built-in.
 */

/** Asserting lookup — a selection naming an id the catalogue does not hold is a caller bug. */
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

    return selections.slice(index + 1).flatMap((skillBId) => {
      const conflict = (skillA.conflictsWith ?? []).find(
        (c) => c.skillId === skillBId
      )
      if (!conflict) return []

      return [
        {
          type: "conflict" as const,
          message: `${skillA.displayName} conflicts with ${labelOf(catalog, skillBId)}: ${conflict.reason}`,
          // Boundary cast: the id came out of the catalogue's own relationship table.
          skills: [skillA.id as SkillId, skillBId],
        },
      ]
    })
  })
}

function validateRequirements(
  catalog: CompileCatalog,
  selections: SkillId[],
  selectedSet: ReadonlySet<SkillId>
): ValidationError[] {
  return selections.flatMap((skillId) => {
    const skill = catalog.skills[skillId]
    if (!skill) return []

    return (skill.requires ?? []).flatMap((requirement): ValidationError[] => {
      // Boundary cast: requirement ids come out of the catalogue's own tables.
      const requiredIds = requirement.skillIds as readonly SkillId[]

      if (requirement.needsAny) {
        if (requiredIds.some((reqId) => selectedSet.has(reqId))) return []
        return [
          {
            type: "missingRequirement",
            message: `${skill.displayName} requires one of: ${requiredIds
              .map((id) => labelOf(catalog, id))
              .join(", ")}`,
            skills: [skillId, ...requiredIds],
          },
        ]
      }

      const missingIds = requiredIds.filter((reqId) => !selectedSet.has(reqId))
      if (missingIds.length === 0) return []
      return [
        {
          type: "missingRequirement",
          message: `${skill.displayName} requires: ${missingIds
            .map((id) => labelOf(catalog, id))
            .join(", ")}`,
          skills: [skillId, ...missingIds],
        },
      ]
    })
  })
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
  ).flatMap(([categoryId, entries]) => {
    if (entries.length <= 1) return []
    // "local" is a pseudo-category without exclusivity rules
    if (categoryId === LOCAL_PSEUDO_CATEGORY) return []

    const category = catalog.categories[categoryId]
    if (category?.exclusive !== true) return []

    const skillIds = entries.map((e) => e.skillId)
    return [
      {
        type: "categoryExclusive" as const,
        message: `Category "${category.displayName}" only allows one selection, but multiple selected: ${skillIds
          .map((id) => labelOf(catalog, id))
          .join(", ")}`,
        skills: skillIds,
      },
    ]
  })
}

/**
 * Validates a complete set of skill selections against every catalogue constraint:
 * conflicting pairs, unmet requirements, and exclusive categories holding more
 * than one skill.
 *
 * `valid` is derived from `errors` rather than asserted: a literal `true` beside a populated
 * `errors` array is a comment with a type annotation, and the first `if (validation.valid)`
 * written against it would pass on every rejected selection there is.
 */
export function validateSelection(
  selections: SkillId[],
  catalog: CompileCatalog
): SelectionValidation {
  const resolvedSelections = selections.map(
    // Boundary cast: the id came back off the catalogue entry `id` just found, and a catalogue
    // skill's `id` is typed `string` on the narrow shape so the wire `Matrix` satisfies it too.
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
