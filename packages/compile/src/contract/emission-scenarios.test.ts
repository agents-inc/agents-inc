/**
 * This package's half of the shared emission contract.
 *
 * `EMISSION_SCENARIOS` lives beside this file because two surfaces render the
 * same two files — the CLI's write path and the editor's output preview — and
 * the expectations are the CLI's, captured before the renderers moved here.
 *
 * THIS IS THE ONLY RUNNER OF THOSE SCENARIOS. The CLI's
 * `e2e/lifecycle/preview-matches-install.e2e.test.ts` holds a real install to the
 * same renderers, which is the other end of the SUBJECT, but it imports nothing
 * from the contract and drives none of its scenarios — so what is pinned below is
 * a set of goldens exactly one side is ever run against, and a scenario added to
 * the contract extends this side only.
 *
 * The catalogue is `MATRIX` from `@workspace/matrix` rather than anything this
 * file builds. That is the point of the matrix being a parameter: the editor
 * seats the catalogue it shipped with, the CLI seats the same one merged with
 * whatever local skills the machine has, and a renderer that reached a module
 * singleton instead would answer differently in the two places with nothing to
 * say so. Passing the shared catalogue here is what makes the parameter's type
 * the thing both callers can satisfy.
 *
 * TWO PROPERTIES are asserted below, and the second is why this file carries a
 * second describe rather than a second runner. The scenarios pin the exact
 * bytes; the block at the foot pins that those bytes are ALREADY FORMATTED —
 * that prettier, run over the emitter's own output under the settings the
 * installed pair is read with, hands it back unchanged. A golden cannot state
 * that: it agrees with whatever was captured, formatted or not, which is how
 * three serialisation styles came to sit in one emitted file with every
 * assertion in this package green.
 */

import { MATRIX } from "@workspace/matrix"
import { format, type Options } from "prettier"
import { describe, expect, it } from "vitest"

import {
  generateBlankGlobalConfigSource,
  generateConfigSource,
} from "../config-source"
import {
  generateBlankGlobalConfigTypesSource,
  generateConfigTypesSource,
} from "../config-types-source"
import {
  CONFIG_TS,
  CONFIG_TYPES_TS,
  EMISSION_SCENARIOS,
  type EmissionScenario,
} from "./emission-scenarios"

/** Every file the scenario's root receives, keyed the way the scenario keys them. */
function emit(scenario: EmissionScenario): Record<string, string> {
  const options =
    scenario.root === "project" && scenario.globalConfig
      ? { isProjectConfig: true, globalConfig: scenario.globalConfig }
      : undefined

  return {
    [CONFIG_TS]: generateConfigSource(scenario.config, MATRIX, options),
    [CONFIG_TYPES_TS]: generateConfigTypesSource(
      MATRIX,
      [...scenario.agentNames],
      [],
      undefined,
      scenario.config
    ),
  }
}

describe("the bytes an install writes", () => {
  /**
   * The corpus the claims below are made against, guarded OUTSIDE the loop
   * because a guard inside it cannot fire when the loop does not run: an
   * emptied or over-filtered `EMISSION_SCENARIOS` registers zero `it`s and the
   * file reports as passing — a check that counts its own subjects.
   *
   * Members rather than a count, and both writers rather than one. A project
   * root renders by inlining a global config and a global root renders
   * standalone; a variant with no scenario is a writer nothing here draws, and
   * an emptied list fails this as `[]`.
   */
  it("names a scenario for each writer", () => {
    expect(
      [...new Set(EMISSION_SCENARIOS.map((scenario) => scenario.root))].sort(),
      "a writer with no scenario is one nothing below renders, and this is the only assertion that fires when the list is empty"
    ).toStrictEqual(["global", "project"])
  })

  for (const scenario of EMISSION_SCENARIOS) {
    it(scenario.title, () => {
      // Subject guard. A project-root scenario with no global config would fall
      // through `emit` to the standalone writer and then satisfy every byte
      // comparison below against standalone bytes — pinning the wrong writer
      // while reading as the inlined one.
      expect(
        scenario.root === "project" && scenario.globalConfig === undefined,
        "a project root renders by inlining a global config, so one has to be there to inline"
      ).toBe(false)

      expect(emit(scenario), scenario.why).toStrictEqual(scenario.expected)
    })
  }
})

/**
 * The prettier settings the emitted pair has to be a fixed point of.
 *
 * These are a USER's settings and they match neither of this repository's on
 * purpose: the shared config is `singleQuote: false` at 80 columns and
 * `packages/cli`'s own is `semi: true`. Both files land in `.claude-src/`
 * inside somebody else's project — this repository's own copy is named in
 * `.prettierignore`, so nothing here ever formats them — and the style below is
 * the one confirmed against the sample an install is meant to produce. Pulling
 * them toward either of ours would only make the bytes agree with a config no
 * reader of them has.
 *
 * Written out rather than resolved from disk for the same reason: `resolveConfig`
 * from anywhere in this tree answers with one of the two configs above, and the
 * destination is not in this tree at all.
 */
const INSTALLED_SOURCE_FORMAT = {
  parser: "typescript",
  semi: false,
  singleQuote: true,
  printWidth: 100,
  trailingComma: "all",
} as const satisfies Options

/**
 * What prettier makes of source it is handed. The property is that this is the
 * identity function over everything the emitters produce.
 */
function reformat(source: string): Promise<string> {
  return format(source, INSTALLED_SOURCE_FORMAT)
}

/**
 * Every file an install writes, formatted on arrival.
 *
 * The assertion is the FIXED POINT and never a literal. A pinned expected
 * string here would live in the same hands as the emitter — one person editing
 * both halves in one change, with the wrong edit passing — and the exact bytes
 * are pinned once already, above. What this states is the thing a golden
 * cannot: whatever the emitter produces, prettier has nothing left to do to it.
 *
 * One `it` per file per scenario rather than one per scenario, because a
 * failure has to name the file it is about. Both halves of a pair diverging is
 * the likely case and a single assertion would report the first and hide the
 * second, leaving a reader to fix one, re-run, and discover the other.
 *
 * The roster is not re-guarded here — an emptied `EMISSION_SCENARIOS` reddens
 * "names a scenario for each writer" above, and a second copy of that guard
 * would fire at the same moment for the same reason.
 */
describe("the source an install writes", () => {
  for (const scenario of EMISSION_SCENARIOS) {
    // The destinations come from the two constants rather than from `emit`'s
    // keys, because a title needs them at COLLECTION time and calling a
    // renderer there puts every test in this file behind it: a renderer that
    // throws for one scenario would take the whole module down before a single
    // `it` registered, and the goldens above would stop reporting along with it.
    for (const destination of [CONFIG_TS, CONFIG_TYPES_TS]) {
      it(`emits ${destination} already formatted, for ${scenario.id}`, async () => {
        const source = emit(scenario)[destination]

        // Narrowing under `noUncheckedIndexedAccess`, and a real assertion
        // underneath it. Defaulting to `""` here would compare an empty string
        // against prettier's rendering of an empty string and PASS — a green
        // result for a scenario that emitted nothing is the one outcome this
        // test must not be able to produce.
        if (source === undefined) {
          throw new Error(
            `the "${scenario.id}" scenario emitted no ${destination} at all`
          )
        }

        expect(
          source,
          `${destination} of the "${scenario.id}" scenario is not a fixed point of prettier — ` +
            "expected is what prettier makes of the emitter's output, received is the " +
            "emitter's output, and the renderer is what has to move"
        ).toBe(await reformat(source))
      })
    }
  }

  /**
   * The blank pair, which no scenario reaches. `ensureBlankPair` in the CLI's
   * `config-gate/pair-writer.ts` writes it before any configuration exists, so
   * there is no `ProjectConfig` to key a scenario on and both halves are called
   * directly instead. BOTH halves, because the ruling names both files and this
   * one path emits each of them from its own zero-argument function — covering
   * only the `config.ts` half would leave a sibling of the same class untested.
   *
   * The config half is NOT the subject of `todo/cli.md` -> CLI-841, which is a
   * different claim about the same function: that its field order, key quoting
   * and trailing comma disagree with `generateStandaloneConfig`, so the first
   * real write rewrites a file the user never touched. That defect is about
   * AGREEMENT between two emitters and this assertion is about formatting.
   * Closing either one leaves the other exactly where it was, and the diff
   * below must not be read as evidence about CLI-841.
   */
  it("emits the blank global config already formatted", async () => {
    const source = generateBlankGlobalConfigSource()

    expect(
      source,
      "generateBlankGlobalConfigSource() is not a fixed point of prettier — expected is what " +
        "prettier makes of its output, received is its output. This is NOT CLI-841, which is " +
        "about this emitter disagreeing with generateStandaloneConfig rather than about format"
    ).toBe(await reformat(source))
  })

  it("emits the blank global config types already formatted", async () => {
    const source = generateBlankGlobalConfigTypesSource()

    expect(
      source,
      "generateBlankGlobalConfigTypesSource() is not a fixed point of prettier — expected is " +
        "what prettier makes of its output, received is its output. It is the other half of " +
        "the pair ensureBlankPair writes, and it lands in a user's project unformatted too"
    ).toBe(await reformat(source))
  })
})
