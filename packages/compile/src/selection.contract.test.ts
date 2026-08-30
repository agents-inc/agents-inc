/**
 * The third half of the shared selection contract.
 *
 * `SELECTION_SCENARIOS` lives in `@workspace/matrix` because two
 * implementations of these rules answered the same questions and did not always
 * agree — the CLI's `matrix-resolver.ts` plus `build-step-logic.ts`, and the
 * editor's `derive.ts` — and its header records the CLI's answers being ruled
 * authoritative. `selection.ts` is a THIRD implementation of the same three
 * relationship rules, extracted here so a browser can run them, and it joined
 * with no runner at all; this file is that runner, so the contract stays
 * multilateral rather than a set of goldens two of three implementations are
 * ever measured against.
 *
 * THE SUBJECT IS A DIFFERENT QUESTION FROM THE OTHER TWO RUNNERS', and saying
 * which is most of the work here. `derive.contract.test.ts` and
 * `selection-scenarios.contract.test.ts` both ask a REACHABILITY question — is
 * this cell still offerable — which forgives whatever a pick-one swap would
 * resolve. `validateSelection` asks a VALIDITY question: it judges the set it
 * is handed, exactly as handed, because its callers (`init --from`'s decode and
 * the wizard's confirm step) are about to write that set to a config. So the
 * scenario fields are mapped onto claims validity can actually carry, and each
 * claim below says which field it is reading and why that reading is the honest
 * one. A mapping that asserted "in reach ⇒ valid" would be neither: a pick-one
 * sibling is in reach precisely BECAUSE clicking it swaps rather than adds.
 *
 * The catalogue is `MATRIX` rather than anything this file builds, matching
 * `contract/emission-scenarios.test.ts`: the catalogue is a parameter of every
 * function in this package so that the CLI's merged seat and the editor's
 * fetched one can both satisfy it, and passing the shared one here is what
 * makes that parameter's type the thing both callers hold.
 */

import {
  MATRIX,
  SELECTION_SCENARIOS,
  type SelectionScenario,
} from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { validateSelection } from "./selection"
import type { SkillId, ValidationError } from "./types"

/**
 * What a scenario's clicks commit the user to: the selection plus everything it
 * necessarily also chooses.
 *
 * De-duplicated, and that is load-bearing rather than tidy. Several scenarios
 * name a skill in both `selection` and `implied`'s consequences, and
 * `validateExclusivity` groups by category — so a repeated id is two members of
 * one pick-one category and reports `categoryExclusive` against itself.
 */
const closureOf = (scenario: SelectionScenario): SkillId[] => [
  ...new Set<SkillId>([...scenario.selection, ...scenario.implied]),
]

const errorsFor = (selection: readonly SkillId[]): ValidationError[] =>
  validateSelection([...selection], MATRIX).errors

const ofType = (errors: readonly ValidationError[], type: string) =>
  errors.filter((error) => error.type === type)

/**
 * A closure is a set the semantics decided the user is committed to, so it must
 * be a set an install could actually write: no conflicting pair, and no two
 * members of one pick-one category.
 *
 * `missingRequirement` is deliberately NOT included, and the exclusion is the
 * claim rather than a softening of it. `closure-takes-only-the-unambiguous-
 * requirement` is the scenario that fixes it: shadcn/ui requires Tailwind
 * outright plus ONE of the React frameworks, and "a group offering a choice
 * commits the user to none of its options" — so its closure is `[shadcn,
 * tailwind]` with the framework requirement open by design. An unmet
 * requirement is a selection still being made; a conflict is one that can never
 * be finished.
 */
const UNWRITABLE = ["conflict", "categoryExclusive"] as const

function assertScenario(scenario: SelectionScenario): void {
  const closure = closureOf(scenario)
  const closureErrors = errorsFor(closure)

  for (const type of UNWRITABLE) {
    expect(
      ofType(closureErrors, type),
      `the closure of this selection is not writable: it reports ${type}`
    ).toStrictEqual([])
  }

  /**
   * `outOfReach` — "must be surfaced as unavailable against this selection".
   *
   * Validity's reading of unavailable is the strong one: adding it produces a
   * `missingRequirement` NAMING IT. That is why the skill is out of reach in
   * the first place — something it is built on has been ruled out — and it is
   * what separates out-of-reach from the in-reach pick-one siblings below,
   * which are also invalid additions but only through a conflict the swap
   * resolves. Asserting mere invalidity would not: a sibling of a selected
   * framework is an invalid addition too, and it is in reach.
   */
  for (const skillId of scenario.outOfReach) {
    const errors = ofType(
      errorsFor([...closure, skillId]),
      "missingRequirement"
    )

    expect(
      errors.some((error) => error.skills.includes(skillId)),
      `${skillId} must be ruled out by a requirement it can no longer meet`
    ).toBe(true)
  }

  /**
   * `inReach` — "must stay offerable against this selection".
   *
   * The honest validity reading, and the only one: where adding an in-reach
   * skill DOES report a conflict, that conflict must sit inside a pick-one
   * category holding both its skills — which is exactly the conflict a click
   * resolves by swapping rather than adding. A conflict outside one would be a
   * cell the grid offers and no click can ever satisfy.
   *
   * Read off the two errors' own `skills` payloads, so this stays a comparison
   * of what the validator reported rather than a second lookup of the
   * catalogue's category table.
   */
  for (const skillId of scenario.inReach) {
    const errors = errorsFor([...closure, skillId])
    const exclusives = ofType(errors, "categoryExclusive")

    for (const conflict of ofType(errors, "conflict")) {
      expect(
        exclusives.some((exclusive) =>
          conflict.skills.every((id) => exclusive.skills.includes(id))
        ),
        `${skillId} stays offerable, so its conflict must be one a pick-one swap resolves`
      ).toBe(true)
    }
  }

  // A soft warning warns; it never makes a selection unwritable.
  for (const skillId of scenario.discouraged) {
    const errors = errorsFor([...closure, skillId])

    for (const type of UNWRITABLE) {
      expect(
        ofType(errors, type),
        `${skillId} is a soft warning and must not report ${type}`
      ).toStrictEqual([])
    }
  }
}

describe("the selection contract, as the shared validator answers it", () => {
  for (const scenario of SELECTION_SCENARIOS) {
    it(scenario.title, () => {
      assertScenario(scenario)
    })
  }
})

/**
 * SUBJECT GUARDS, and they are not ceremony.
 *
 * Every per-skill claim above is a loop, and a loop over an empty list passes
 * without asking the validator anything. Two of the three loops really are
 * empty on some scenarios — a scenario naming no `outOfReach` is a legitimate
 * shape — so the guard cannot live inside `assertScenario` the way the CLI
 * runner's does. It lives here instead, over the whole corpus, where it says
 * the contract as a whole still has each kind of subject.
 *
 * `discouraged` is deliberately absent from these guards: no skill in the
 * catalogue declares a `discourages` relationship, which `DISCOURAGED_PAIRS`
 * and the editor runner's `it.fails` already record as a known gap. Naming it
 * here would be a second pin on the same gap, in a file nobody retiring it has
 * reason to open.
 */
describe("the corpus these claims are made against", () => {
  const totals = SELECTION_SCENARIOS.reduce(
    (running, scenario) => ({
      closures: running.closures + closureOf(scenario).length,
      outOfReach: running.outOfReach + scenario.outOfReach.length,
      inReachConflicts:
        running.inReachConflicts +
        scenario.inReach.filter((skillId) =>
          errorsFor([...closureOf(scenario), skillId]).some(
            (error) => error.type === "conflict"
          )
        ).length,
    }),
    { closures: 0, outOfReach: 0, inReachConflicts: 0 }
  )

  it("names skills to hold each claim against", () => {
    expect(
      totals.closures,
      "every scenario's closure is empty, so the writability claim asked the validator nothing"
    ).toBeGreaterThan(0)
    expect(
      totals.outOfReach,
      "no scenario names an out-of-reach skill, so that claim is a loop over nothing"
    ).toBeGreaterThan(0)
    expect(
      totals.inReachConflicts,
      "no in-reach skill reports a conflict, so the swap-resolves claim is a loop over nothing"
    ).toBeGreaterThan(0)
  })
})
