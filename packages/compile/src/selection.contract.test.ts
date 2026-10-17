/**
 * Runs `SELECTION_SCENARIOS` against `validateSelection`. It asks validity, not reachability, so
 * each scenario field is mapped onto a claim validity can carry.
 */

import {
  MATRIX,
  SELECTION_SCENARIOS,
  type SelectionScenario,
} from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { validateSelection } from "./selection"
import type { SkillId, ValidationError } from "./types"

// De-duplicated: a repeated id would report `categoryExclusive` against itself.
const closureOf = (scenario: SelectionScenario): SkillId[] => [
  ...new Set<SkillId>([...scenario.selection, ...scenario.implied]),
]

const errorsFor = (selection: readonly SkillId[]): ValidationError[] =>
  validateSelection([...selection], MATRIX).errors

const ofType = (errors: readonly ValidationError[], type: string) =>
  errors.filter((error) => error.type === type)

// `missingRequirement` is excluded: an unmet requirement is a selection still being made.
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

  // Out of reach means adding it reports a `missingRequirement` naming it, which separates it from
  // in-reach pick-one siblings that are merely invalid additions.
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

  // An in-reach skill's conflict must sit inside a pick-one category holding both skills: the
  // conflict a click resolves by swapping.
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

// Corpus-wide subject guards: per-scenario loops can legitimately be empty. `discouraged` is absent
// because no catalogue skill declares it.
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
