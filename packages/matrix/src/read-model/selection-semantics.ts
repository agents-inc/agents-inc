// Ids are `string` because the CLI judges merged matrices with local skills. Browser-safe.

import type { Matrix } from "../matrix-schema"
import { MATRIX } from "./source"

export type SkillRequirementFacts = {
  skillIds: readonly string[]
  /** One of these is enough; otherwise every one is needed. */
  needsAny: boolean
}

export type SelectionSkillFacts = {
  id: string
  categoryId: string
  /** Selecting either side hard-excludes the other; declared on one is enough. */
  conflictsWith: readonly string[]
  /** Soft conflict: warn, never disable. */
  discourages: readonly { skillId: string; reason: string }[]
  requires: readonly SkillRequirementFacts[]
}

export type SelectionCatalogFacts = {
  skills: readonly SelectionSkillFacts[]
  /** Pick-one categories: a click swaps the sibling out rather than joining it. */
  exclusiveCategoryIds: ReadonlySet<string>
}

// A skill is ruled out only once the selection makes it impossible, not
// because its preferred host is unpicked.
export type IncompatibilityCause =
  | { kind: "conflict"; skillId: string }
  | {
      kind: "unreachableRequirement"
      requirement: SkillRequirementFacts
      lostIds: readonly string[]
    }

export type SelectionVerdict =
  | { status: "normal" }
  | { status: "discouraged"; reason: string }
  | { status: "incompatible"; cause: IncompatibilityCause }

export type SelectionJudgement = {
  /** Selected, plus everything the selection necessarily also chooses. */
  reached: ReadonlySet<string>
  /** Ruled out by that, dependents included, to a fixpoint. */
  outOfReach: ReadonlySet<string>
  /** The closure minus the selection — what was chosen without being clicked. */
  implied: readonly string[]
  /** In a pick-one category, an incompatibility is re-judged against the selection a click would swap to. */
  verdictOf: (skillId: string) => SelectionVerdict
  /** The verdict before the swap rule. */
  incompatibilityOf: (skillId: string) => IncompatibilityCause | undefined
  discourageReasonOf: (skillId: string) => string | undefined
}

export type SelectionSemantics = (
  selection: readonly string[]
) => SelectionJudgement

// "Needs Vue or Nuxt" implies neither.
const isAmbiguous = (requirement: SkillRequirementFacts) =>
  requirement.needsAny && requirement.skillIds.length > 1

const reasonDiscouraging = (
  declarer: SelectionSkillFacts | undefined,
  otherId: string
) =>
  declarer?.discourages.find((relation) => relation.skillId === otherId)?.reason

type JudgingSets = {
  reached: ReadonlySet<string>
  outOfReach: ReadonlySet<string>
}

export const createSelectionSemantics = (
  catalog: SelectionCatalogFacts
): SelectionSemantics => {
  const skillsById = new Map(catalog.skills.map((skill) => [skill.id, skill]))

  const conflictIdsBySkill = new Map<string, Set<string>>()
  const noteConflict = (skillId: string, otherId: string) => {
    const held = conflictIdsBySkill.get(skillId)
    if (held) held.add(otherId)
    else conflictIdsBySkill.set(skillId, new Set([otherId]))
  }
  for (const skill of catalog.skills) {
    for (const otherId of skill.conflictsWith) {
      noteConflict(skill.id, otherId)
      noteConflict(otherId, skill.id)
    }
  }

  const mustHold = (skillId: string): SelectionSkillFacts => {
    const skill = skillsById.get(skillId)
    if (!skill) throw new Error(`Skill not found: ${skillId}`)
    return skill
  }

  const directlyImpliedBy = (skillId: string) =>
    (skillsById.get(skillId)?.requires ?? [])
      .filter((requirement) => !isAmbiguous(requirement))
      .flatMap((requirement) => requirement.skillIds)

  const closureOf = (selection: readonly string[]) => {
    const reached = new Set(selection)
    const frontier = [...reached]

    for (let skillId = frontier.pop(); skillId; skillId = frontier.pop()) {
      for (const required of directlyImpliedBy(skillId)) {
        if (reached.has(required)) continue
        reached.add(required)
        frontier.push(required)
      }
    }

    return reached
  }

  const reachedConflictOf = (skillId: string, reached: ReadonlySet<string>) => {
    const conflictIds = conflictIdsBySkill.get(skillId)
    if (!conflictIds) return undefined
    for (const reachedId of reached) {
      if (reachedId !== skillId && conflictIds.has(reachedId)) return reachedId
    }
    return undefined
  }

  const lostIdsOf = (
    requirement: SkillRequirementFacts,
    reached: ReadonlySet<string>,
    outOfReach: ReadonlySet<string>
  ) =>
    requirement.skillIds.filter(
      (skillId) => !reached.has(skillId) && outOfReach.has(skillId)
    )

  const isUnreachable = (
    requirement: SkillRequirementFacts,
    lostIds: readonly string[]
  ) =>
    requirement.needsAny
      ? lostIds.length === requirement.skillIds.length
      : lostIds.length > 0

  // Conflicts first, then dependents of what was lost, to a fixpoint.
  const strandedBeyond = (reached: ReadonlySet<string>) => {
    const outOfReach = new Set<string>()
    for (const skill of catalog.skills) {
      if (!reached.has(skill.id) && reachedConflictOf(skill.id, reached)) {
        outOfReach.add(skill.id)
      }
    }

    const hasLostRequirement = (skill: SelectionSkillFacts) =>
      skill.requires.some((requirement) =>
        isUnreachable(requirement, lostIdsOf(requirement, reached, outOfReach))
      )

    for (let settled = false; !settled;) {
      settled = true

      for (const skill of catalog.skills) {
        if (reached.has(skill.id) || outOfReach.has(skill.id)) continue
        if (hasLostRequirement(skill)) {
          outOfReach.add(skill.id)
          settled = false
        }
      }
    }

    return outOfReach
  }

  const incompatibilityAgainst = (
    skill: SelectionSkillFacts,
    sets: JudgingSets
  ): IncompatibilityCause | undefined => {
    const conflictId = reachedConflictOf(skill.id, sets.reached)
    if (conflictId) return { kind: "conflict", skillId: conflictId }

    for (const requirement of skill.requires) {
      const lostIds = lostIdsOf(requirement, sets.reached, sets.outOfReach)
      if (isUnreachable(requirement, lostIds)) {
        return { kind: "unreachableRequirement", requirement, lostIds }
      }
    }

    return undefined
  }

  const discourageAgainst = (
    skill: SelectionSkillFacts,
    sets: JudgingSets
  ): string | undefined => {
    for (const reachedId of sets.reached) {
      if (reachedId === skill.id) continue

      const reason =
        reasonDiscouraging(skillsById.get(reachedId), skill.id) ??
        reasonDiscouraging(skill, reachedId)
      if (reason !== undefined) return reason
    }
    return undefined
  }

  const verdictAgainst = (
    skill: SelectionSkillFacts,
    sets: JudgingSets
  ): SelectionVerdict => {
    const cause = incompatibilityAgainst(skill, sets)
    if (cause) return { status: "incompatible", cause }

    const reason = discourageAgainst(skill, sets)
    return reason ? { status: "discouraged", reason } : { status: "normal" }
  }

  return (selection) => {
    const reached = closureOf(selection)
    const base: JudgingSets = {
      reached,
      outOfReach: strandedBeyond(reached),
    }

    // A pick-one click drops every same-category member; cached per category.
    const swapSetsByCategory = new Map<string, JudgingSets>()
    const swapSetsFor = (categoryId: string): JudgingSets => {
      const held = swapSetsByCategory.get(categoryId)
      if (held) return held

      const outside = (skillId: string) =>
        skillsById.get(skillId)?.categoryId !== categoryId
      const survivingReached = new Set([...reached].filter(outside))
      const sets: JudgingSets = {
        reached: survivingReached,
        outOfReach: strandedBeyond(survivingReached),
      }
      swapSetsByCategory.set(categoryId, sets)
      return sets
    }

    return {
      reached,
      outOfReach: base.outOfReach,
      implied: [...reached].filter((skillId) => !selection.includes(skillId)),
      verdictOf: (skillId) => {
        const skill = mustHold(skillId)
        const verdict = verdictAgainst(skill, base)

        const swaps =
          verdict.status === "incompatible" &&
          catalog.exclusiveCategoryIds.has(skill.categoryId)
        return swaps
          ? verdictAgainst(skill, swapSetsFor(skill.categoryId))
          : verdict
      },
      incompatibilityOf: (skillId) =>
        incompatibilityAgainst(mustHold(skillId), base),
      discourageReasonOf: (skillId) =>
        discourageAgainst(mustHold(skillId), base),
    }
  }
}

export const catalogFactsOf = (matrix: Matrix): SelectionCatalogFacts => ({
  skills: Object.values(matrix.skills).map((skill) => ({
    id: skill.id,
    categoryId: skill.category,
    conflictsWith: skill.conflictsWith.map((relation) => relation.skillId),
    discourages: skill.discourages.map((relation) => ({
      skillId: relation.skillId,
      reason: relation.reason,
    })),
    requires: skill.requires.map((requirement) => ({
      skillIds: requirement.skillIds,
      needsAny: requirement.needsAny,
    })),
  })),
  exclusiveCategoryIds: new Set(
    Object.values(matrix.categories)
      .filter((category) => category.exclusive)
      .map((category) => category.id)
  ),
})

export const judgeSelection = createSelectionSemantics(catalogFactsOf(MATRIX))
