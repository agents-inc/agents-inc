import { describe, expect, it } from "vitest"

import { CATALOG } from "../read-model/catalog"
import {
  DISCOURAGED_PAIRS,
  SELECTION_SCENARIOS,
  type SelectionScenario,
} from "./selection-scenarios"

// The scenarios are the contract two implementations are held to, so a typo in
// one of them is a golden that silently tests nothing. `SkillId` catches an id
// that was never a skill; these catch an id that is a skill the catalogue does
// not render, an expectation that contradicts itself, and a scenario that
// asserts nothing at all.

const idsOf = (scenario: SelectionScenario) => [
  ...scenario.selection,
  ...scenario.implied,
  ...scenario.outOfReach,
  ...scenario.inReach,
  ...scenario.discouraged,
]

describe("SELECTION_SCENARIOS", () => {
  it("carries scenarios on both sides of the divergence line", () => {
    expect(
      SELECTION_SCENARIOS.filter((scenario) => scenario.divergence === null)
        .length
    ).toBeGreaterThan(0)
    expect(
      SELECTION_SCENARIOS.filter((scenario) => scenario.divergence !== null)
        .length
    ).toBeGreaterThan(0)
  })

  it("gives every scenario an id of its own", () => {
    const ids = SELECTION_SCENARIOS.map((scenario) => scenario.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(
    SELECTION_SCENARIOS.map((scenario) => [scenario.id, scenario] as const)
  )("%s names only skills the catalogue renders", (_id, scenario) => {
    for (const skillId of idsOf(scenario)) {
      expect(CATALOG.skillsById[skillId], skillId).toBeDefined()
    }
  })

  it.each(
    SELECTION_SCENARIOS.map((scenario) => [scenario.id, scenario] as const)
  )("%s asserts an outcome", (_id, scenario) => {
    expect(
      scenario.outOfReach.length +
        scenario.inReach.length +
        scenario.implied.length +
        scenario.discouraged.length
    ).toBeGreaterThan(0)
  })

  // A skill cannot be both offerable and ruled out, and a selection is neither
  // implied nor a verdict about itself. A scenario claiming both would be
  // asking for something no implementation can produce.
  it.each(
    SELECTION_SCENARIOS.map((scenario) => [scenario.id, scenario] as const)
  )("%s keeps its expectations apart", (_id, scenario) => {
    const inReach = new Set<string>(scenario.inReach)
    const selection = new Set<string>(scenario.selection)

    expect(scenario.outOfReach.filter((id) => inReach.has(id))).toStrictEqual(
      []
    )
    expect(scenario.implied.filter((id) => selection.has(id))).toStrictEqual([])
    expect(
      [...scenario.outOfReach, ...scenario.inReach].filter((id) =>
        selection.has(id)
      )
    ).toStrictEqual([])
  })

  // Every implied id has to be reachable by following one skill's own
  // `requires`, or the closure the scenario claims could not produce it.
  it.each(
    SELECTION_SCENARIOS.map((scenario) => [scenario.id, scenario] as const)
  )("%s implies only skills something in it requires", (_id, scenario) => {
    const required = new Set(
      [...scenario.selection, ...scenario.implied].flatMap(
        (skillId) =>
          CATALOG.skillsById[skillId]?.requires.flatMap(
            (requirement) => requirement.skillIds
          ) ?? []
      )
    )

    for (const skillId of scenario.implied) {
      expect(required.has(skillId), skillId).toBe(true)
    }
  })
})

describe("DISCOURAGED_PAIRS", () => {
  it("names skills the catalogue renders on both sides", () => {
    for (const [skillId, otherId] of DISCOURAGED_PAIRS) {
      expect(CATALOG.skillsById[skillId], skillId).toBeDefined()
      expect(CATALOG.skillsById[otherId], otherId).toBeDefined()
    }
  })
})
