// Holds `derive.ts` to the shared selection contract in `@workspace/matrix`.

import {
  DISCOURAGED_PAIRS,
  SELECTION_SCENARIOS,
  type SelectionScenario,
} from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import type { ConfigureSearch } from "@/routes/search"
import { DEFAULT_SKILL_OPTIONS } from "@/stores/persisted-schema"
import {
  selectDomainViews,
  selectReachability,
  type ConfigSelection,
} from "./derive"

const UNFILTERED: ConfigureSearch = {
  domain: null,
  q: "",
  sel: false,
  fromId: "",
}

const configFor = (selection: readonly string[]): ConfigSelection => ({
  stackId: null,
  agents: {},
  skills: Object.fromEntries(
    selection.map((skillId) => [
      skillId,
      { ...DEFAULT_SKILL_OPTIONS, assignments: {} },
    ])
  ),
})

const cellsFor = (selection: readonly string[]) =>
  selectDomainViews(configFor(selection), UNFILTERED).flatMap((domain) =>
    domain.categories.flatMap((category) => category.cells)
  )

const disabledIn = (selection: readonly string[]) =>
  new Set(
    cellsFor(selection)
      .filter((cell) => cell.incompatible)
      .map((cell) => cell.skill.id)
  )

const impliedBy = (selection: readonly string[]) =>
  [...selectReachability(new Set(selection)).reached]
    .filter((skillId) => !selection.includes(skillId))
    .sort()

const assertScenario = (scenario: SelectionScenario) => {
  const { selection } = scenario
  const disabled = disabledIn(selection)

  expect(impliedBy(selection)).toStrictEqual([...scenario.implied].sort())

  for (const skillId of scenario.outOfReach) {
    expect(disabled.has(skillId), `${skillId} must be ruled out`).toBe(true)
  }

  for (const skillId of scenario.inReach) {
    expect(disabled.has(skillId), `${skillId} must stay offerable`).toBe(false)
  }

  for (const skillId of scenario.discouraged) {
    expect(disabled.has(skillId), `${skillId} must not be disabled`).toBe(false)
  }
}

describe("the selection contract", () => {
  for (const scenario of SELECTION_SCENARIOS) {
    it(scenario.title, () => {
      assertScenario(scenario)
    })
  }
})

describe("soft conflicts", () => {
  // Fails until the catalogue declares a `discourages` pair; the length check
  // stops it passing on an empty list.
  it.fails("surfaces a discouraged advisory against the selection", () => {
    expect(DISCOURAGED_PAIRS.length).toBeGreaterThan(0)

    for (const [skillId, otherId] of DISCOURAGED_PAIRS) {
      const cell = cellsFor([skillId]).find(
        (candidate) => candidate.skill.id === otherId
      )

      expect(
        cell?.discouragedReason,
        `${skillId} discourages ${otherId}`
      ).toBeDefined()
    }
  })
})
