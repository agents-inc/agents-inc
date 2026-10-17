/**
 * The only runner of `EMISSION_SCENARIOS`. Scenarios pin exact bytes; the second describe pins that
 * those bytes are already prettier-formatted, which a golden cannot state.
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
  // Outside the loop: an emptied list registers no `it`s and would pass silently.
  it("names a scenario for each writer", () => {
    expect(
      [...new Set(EMISSION_SCENARIOS.map((scenario) => scenario.root))].sort(),
      "a writer with no scenario is one nothing below renders, and this is the only assertion that fires when the list is empty"
    ).toStrictEqual(["global", "project"])
  })

  for (const scenario of EMISSION_SCENARIOS) {
    it(scenario.title, () => {
      // Without a global config a project root falls through to the standalone writer.
      expect(
        scenario.root === "project" && scenario.globalConfig === undefined,
        "a project root renders by inlining a global config, so one has to be there to inline"
      ).toBe(false)

      expect(emit(scenario), scenario.why).toStrictEqual(scenario.expected)
    })
  }
})

// A user's settings, not this repo's: the files land in someone else's project.
const INSTALLED_SOURCE_FORMAT = {
  parser: "typescript",
  semi: false,
  singleQuote: true,
  printWidth: 100,
  trailingComma: "all",
} as const satisfies Options

function reformat(source: string): Promise<string> {
  return format(source, INSTALLED_SOURCE_FORMAT)
}

// The fixed point, never a literal; one `it` per file so a failure names its file.
describe("the source an install writes", () => {
  for (const scenario of EMISSION_SCENARIOS) {
    // From the constants, not `emit`: a renderer throwing at collection would hide every test.
    for (const destination of [CONFIG_TS, CONFIG_TYPES_TS]) {
      it(`emits ${destination} already formatted, for ${scenario.id}`, async () => {
        const source = emit(scenario)[destination]

        // Defaulting to `""` would pass for a scenario that emitted nothing.
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

  // The blank pair `ensureBlankPair` writes has no scenario, so both halves are called directly.
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
