/**
 * The CLI half of the shared selection contract (EDITOR-11, EDITOR-13).
 *
 * `SELECTION_SCENARIOS` lives in `@workspace/matrix` because two
 * implementations answer these questions — this package's `matrix-resolver.ts`
 * and the editor's `derive.ts` — and the expectations are the CLI's. The
 * editor's runner (`derive.contract.test.ts`) holds that side to them; this
 * one holds this side, so the contract is bilateral rather than a set of
 * goldens only one implementation is ever run against.
 *
 * A scenario's `divergence` names the historical editor bug it pinned, so it
 * changes nothing here: every scenario is an ordinary passing test on this
 * side, and one going red means the CLI moved.
 *
 * The subject is the wizard's grid cell, not the resolver underneath it.
 * `buildCategoriesForDomain` is where a verdict becomes something a user can
 * act on: inside a pick-one category a cell is judged by the selection a click
 * on it would produce — forgiving what the swap resolves and keeping what it
 * does not. The rule itself lives in `@workspace/matrix`'s shared selection
 * semantics; this runner holds the CLI's rendering of it to the contract.
 *
 * A scenario's `implied` set is read here through the verdicts it produces
 * rather than asserted on its own. Nothing the CLI ships asks the catalogue
 * what a selection implies — the closure only ever reaches a user as a cell
 * that stayed offerable or stopped being one, which is what `inReach` and
 * `outOfReach` below are: Expo's chain to React is what rules Vue's forms out,
 * and Nuxt's to Vue is what rules Radix out.
 */

import { SELECTION_SCENARIOS, type SelectionScenario } from "@workspace/matrix";
import { describe, expect, it } from "vitest";
import type { OptionState, SkillId } from "../../types/index.js";
import { buildCategoriesForDomain } from "../wizard/build-step-logic.js";
import { getCategoryDomain, getSkillById } from "./matrix-provider.js";

function cellStatusOf(skillId: SkillId, selection: readonly SkillId[]): OptionState["status"] {
  const { category } = getSkillById(skillId);

  const domain = getCategoryDomain(category);
  if (!domain) throw new Error(`Category has no domain: ${category}`);

  const rows = buildCategoriesForDomain(domain, [...selection]);
  const option = rows
    .find((row) => row.id === category)
    ?.options.find((candidate) => candidate.id === skillId);
  if (!option) throw new Error(`Category grid does not render: ${skillId}`);

  return option.state.status;
}

function assertScenario(scenario: SelectionScenario): void {
  const { selection } = scenario;

  // Subject guard. `implied` is the one field this runner reads only through
  // its consequences, so a scenario stating nothing else is one this side
  // passes without rendering a single cell.
  expect(
    [...scenario.outOfReach, ...scenario.inReach, ...scenario.discouraged],
    "the scenario names no cell, so the grid is never asked anything",
  ).not.toStrictEqual([]);

  for (const skillId of scenario.outOfReach) {
    expect(cellStatusOf(skillId, selection), `${skillId} must be ruled out`).toBe("incompatible");
  }

  for (const skillId of scenario.inReach) {
    expect(cellStatusOf(skillId, selection), `${skillId} must stay offerable`).not.toBe(
      "incompatible",
    );
  }

  // A soft warning warns; it never takes the choice away.
  for (const skillId of scenario.discouraged) {
    expect(cellStatusOf(skillId, selection), `${skillId} must not be disabled`).not.toBe(
      "incompatible",
    );
  }
}

describe("selection semantics the CLI defines", () => {
  for (const scenario of SELECTION_SCENARIOS) {
    it(scenario.title, () => {
      assertScenario(scenario);
    });
  }
});
