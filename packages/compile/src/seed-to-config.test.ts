import { CODEX_MODEL_NAMES, MATRIX, SEED_VERSION } from "@workspace/matrix"
import type { SeedAgent, SeedPayload } from "@workspace/matrix"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { seatDiagnostics } from "./diagnostics"
import { seedToWizardResult } from "./seed-to-config"

const WEB_DEV = "web-developer"
const REACT = "web-framework-react"
const PINNED_CODEX_MODEL = "gpt-5.6-terra"
/** A real Codex id this CLI does not offer. */
const NOT_OFFERED = "gpt-4o"

/** One global skill on web-developer, whose own entry is `agent`. */
function payloadFor(agent: SeedAgent): SeedPayload {
  return {
    v: SEED_VERSION,
    matrixVersion: "1.0.0",
    stackId: null,
    skills: {
      [REACT]: {
        install: "eject",
        scope: "global",
        assignments: { [WEB_DEV]: "lazy" },
      },
    },
    agents: { [WEB_DEV]: agent },
  }
}

/**
 * An unknown Codex id is the wire's leniency meeting the CLI's enum: the decode drops the key and
 * says so, and the install goes on — the sub-agent runs on the session's model.
 */
describe("a sub-agent's Codex model, decoded", () => {
  let warnings: string[]

  beforeEach(() => {
    warnings = []
    seatDiagnostics({
      warn: (message) => warnings.push(message),
      verbose: () => undefined,
    })
  })

  afterEach(() => {
    seatDiagnostics({ warn: () => undefined, verbose: () => undefined })
  })

  it("lands on the sub-agent's row beside its Claude model", () => {
    const { result } = seedToWizardResult(
      payloadFor({ model: "haiku", codexModel: PINNED_CODEX_MODEL }),
      MATRIX
    )

    expect(result.agentConfigs).toStrictEqual([
      {
        name: WEB_DEV,
        scope: "global",
        model: "haiku",
        codexModel: PINNED_CODEX_MODEL,
      },
    ])
    expect(warnings).toStrictEqual([])
  })

  it("decodes every id this CLI offers", () => {
    for (const codexModel of CODEX_MODEL_NAMES) {
      const { result } = seedToWizardResult(payloadFor({ codexModel }), MATRIX)

      expect(result.agentConfigs, codexModel).toStrictEqual([
        { name: WEB_DEV, scope: "global", codexModel },
      ])
    }
  })

  it("drops an id this CLI does not offer and names it, keeping the rest of the row", () => {
    const { result } = seedToWizardResult(
      payloadFor({ model: "haiku", effort: "high", codexModel: NOT_OFFERED }),
      MATRIX
    )

    expect(result.agentConfigs).toStrictEqual([
      { name: WEB_DEV, scope: "global", model: "haiku", effort: "high" },
    ])
    expect(warnings).toStrictEqual([
      "Sub-agent 'web-developer' asks for Codex model 'gpt-4o', which this version of the CLI " +
        "does not offer, so it runs on the session's model. Offered: gpt-6-astra, gpt-5.6-sol, " +
        "gpt-5.6-terra and gpt-5.6-luna.",
    ])
  })

  it("says nothing about a sub-agent that names no Codex model", () => {
    const { result } = seedToWizardResult(
      payloadFor({ model: "haiku" }),
      MATRIX
    )

    expect(result.agentConfigs).toStrictEqual([
      { name: WEB_DEV, scope: "global", model: "haiku" },
    ])
    expect(warnings).toStrictEqual([])
  })
})
