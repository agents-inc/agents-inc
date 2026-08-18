// The selection semantics, implemented once. Both surfaces delegate here —
// the editor's `derive.ts` and the CLI's `matrix-resolver.ts` /
// `build-step-logic.ts` — so a verdict is the same verdict wherever it is
// rendered; `contract/selection-scenarios.ts` is the specification this module
// answers to, and each side's runner holds its own view layer to the same
// scenarios.
//
// Verdicts are structured rather than worded: this module decides *that* a
// skill is out of reach and *why*, and each surface renders the why in its own
// words ("Needs Svelte" in the editor, "requires Svelte which conflicts with
// current selection" in the wizard).
//
// Parameterized over the catalogue like `createLoadStateResolver`, never
// closed over one: the CLI judges a merged matrix that carries local skills
// the shipped catalogue has never heard of, which is also why the ids here are
// `string` rather than `SkillId`.
//
// Hand-written and browser-safe: no filesystem, no I/O, nothing Node-only, at
// import time or ever. The editor bundles this module.

import type { Matrix } from "../matrix-schema"
import { MATRIX } from "./source"

export type SkillRequirementFacts = {
  skillIds: readonly string[]
  /** One of these is enough; otherwise every one is needed. */
  needsAny: boolean
}

/** What the semantics read about one skill — relationships, not presentation. */
export type SelectionSkillFacts = {
  id: string
  categoryId: string
  /** Selecting either side hard-excludes the other; declared on one is enough. */
  conflictsWith: readonly string[]
  /** Soft conflict — warn, never disable. The reason is authored upstream. */
  discourages: readonly { skillId: string; reason: string }[]
  /** What this skill is built on: the closure and the fixpoint both walk it. */
  requires: readonly SkillRequirementFacts[]
}

export type SelectionCatalogFacts = {
  skills: readonly SelectionSkillFacts[]
  /** Pick-one categories: a click swaps the sibling out rather than joining it. */
  exclusiveCategoryIds: ReadonlySet<string>
}

// A verdict is about possibility, never presence: a skill is ruled out only
// once the selection has made it impossible, never merely because the host it
// prefers has not been clicked. The `compatibleWith` whitelist stated the
// second reading and was deleted on the owner's 2026-08-07 ruling (CLI-389
// phase C) — see `.ai-docs/reference/features/skills-and-matrix.md`.
export type IncompatibilityCause =
  // Something the selection reaches conflicts with it outright.
  | { kind: "conflict"; skillId: string }
  // A requirement whose named candidates the selection has ruled out —
  // `lostIds` are the ones actually gone, the whole group for a lost choice.
  | {
      kind: "unreachableRequirement"
      requirement: SkillRequirementFacts
      lostIds: readonly string[]
    }

export type SelectionVerdict =
  | { status: "normal" }
  | { status: "discouraged"; reason: string }
  | { status: "incompatible"; cause: IncompatibilityCause }

/** One selection, judged: the sets it settles and the verdicts it implies. */
export type SelectionJudgement = {
  /** Selected, plus everything the selection necessarily also chooses. */
  reached: ReadonlySet<string>
  /** Ruled out by that, dependents included, to a fixpoint. */
  outOfReach: ReadonlySet<string>
  /** The closure minus the selection — what was chosen without being clicked. */
  implied: readonly string[]
  /**
   * The verdict a cell renders. Inside a pick-one category an incompatibility
   * is re-judged against the selection a click would produce — the swap drops
   * every same-category member, selected or implied — so a conflict the swap
   * resolves is forgiven and an impossibility it leaves standing keeps its
   * reason.
   */
  verdictOf: (skillId: string) => SelectionVerdict
  /** The verdict before the swap rule — what the selection as it stands says. */
  incompatibilityOf: (skillId: string) => IncompatibilityCause | undefined
  /** The soft warning alone, whatever else the skill's verdict says. */
  discourageReasonOf: (skillId: string) => string | undefined
}

export type SelectionSemantics = (
  selection: readonly string[]
) => SelectionJudgement

// A group offering a choice commits the user to none of the options: "Pinia
// needs Vue *or* Nuxt" cannot say which, so it implies neither.
const isAmbiguous = (requirement: SkillRequirementFacts) =>
  requirement.needsAny && requirement.skillIds.length > 1

// The judging material for one verdict pass. The base pass judges the
// selection as it stands; the swap pass judges the selection a pick-one click
// would produce.
type JudgingSets = {
  reached: ReadonlySet<string>
  outOfReach: ReadonlySet<string>
}

export const createSelectionSemantics = (
  catalog: SelectionCatalogFacts
): SelectionSemantics => {
  const skillsById = new Map(catalog.skills.map((skill) => [skill.id, skill]))

  // Conflicts are declared on either side, so the symmetric view is built once
  // and every lookup is one direction.
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

  // What choosing this skill necessarily also chooses.
  const directlyImpliedBy = (skillId: string) =>
    (skillsById.get(skillId)?.requires ?? [])
      .filter((requirement) => !isAmbiguous(requirement))
      .flatMap((requirement) => requirement.skillIds)

  // What the selection drags in behind it: choosing Next.js is choosing React
  // whether or not React was ever clicked.
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

  // The first reached skill this one cannot coexist with, if any — reached in
  // selection order, so the verdict names what the user actually picked first.
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

  // A group is met while any candidate is still reachable — for `needsAny`,
  // one survivor is enough; otherwise every candidate has to survive.
  const isUnreachable = (
    requirement: SkillRequirementFacts,
    lostIds: readonly string[]
  ) =>
    requirement.needsAny
      ? lostIds.length === requirement.skillIds.length
      : lostIds.length > 0

  // First everything conflicting with the reached set, then everything built
  // on what was lost, and so on — Vue goes, then Nuxt, then Pinia. Each round
  // either strands at least one more skill or stops, so this terminates.
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

      const declared = skillsById
        .get(reachedId)
        ?.discourages.find((relation) => relation.skillId === skill.id)
      if (declared) return declared.reason

      const declaredBack = skill.discourages.find(
        (relation) => relation.skillId === reachedId
      )
      if (declaredBack) return declaredBack.reason
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

    // The selection a pick-one click would produce: every same-category
    // member drops out of the judging material — selected or implied — and
    // the strandings are recomputed from what survives. Cached per category,
    // since every cell in it swaps against the same remainder.
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

/**
 * The relationships a selection is judged by, read off a catalogue.
 *
 * Exported because a marketplace's conflicts are its own: judging its skills by
 * the public catalogue's facts would find no relationship at all, since it
 * knows neither id. The CLI builds these facts from its own merged matrix
 * instead, which is why the semantics take them rather than reading a module.
 */
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

/** The semantics both surfaces read: the shipped catalogue, bound. */
export const judgeSelection = createSelectionSemantics(catalogFactsOf(MATRIX))
