/**
 * The editor half of the shared selection contract (EDITOR-11, EDITOR-13).
 *
 * `SELECTION_SCENARIOS` lives in `@workspace/matrix` beside the shared
 * selection semantics both sides now consume. This runner holds `derive.ts` —
 * the view layer over those semantics — to the contract; a second runner on
 * the CLI side reads the same scenarios through the wizard's grid.
 *
 * A scenario's `divergence` names the historical bug it pinned, from when this
 * file's subject still carried a parallel implementation. Every scenario runs
 * as an ordinary passing test now; one going red means the editor's view layer
 * stopped rendering what the shared semantics answered.
 */

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

// Every filter off, so the grid holds a cell for every skill in the catalogue.
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

// The cell is the contract: what the grid draws is what the user can act on.
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

  // A soft warning warns; it never takes the choice away.
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
  // KNOWN GAP: as of 2026-08-06 no skill in the catalogue declares a
  // `discourages` relationship, so this is red on its data alone — the cell
  // surfaces `discouragedReason` through the shared semantics, but with zero
  // pairs there is nothing to surface it for. Asserting the pair exists is
  // what stops it going quietly green on an empty list; it turns real when
  // the catalogue authors its first `discourages` rule.
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
