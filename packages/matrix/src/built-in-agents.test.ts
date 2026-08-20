import { describe, expect, it } from "vitest"

import {
  agentDefinitionSchema,
  agentDefinitionsSchema,
} from "./built-in-agents"
import { AGENT_DEFINITIONS } from "./generated/agents"

// The validation boundary for the generated sub-agent roster. Ids are the part
// that matters for the same reason they do on the matrix: `sub-agents.ts`
// groups, labels and looks up by them, so an agent a regenerated roster retired
// has to fail here rather than arrive downstream as a group with no domain.

const KNOWN_AGENT = "web-developer"
const KNOWN_MODEL = "opus"
const KNOWN_FLAVOR = "developer"

// What a retirement looks like from in here: a plausible id that the generated
// vocabulary does not carry.
const RETIRED_AGENT = "web-engineer"
const RETIRED_MODEL = "sonnet-3-5"

const VALID_AGENT = {
  id: KNOWN_AGENT,
  title: "Web Developer Agent",
  description: "Implements web features from specs",
  model: KNOWN_MODEL,
  tools: ["Read"],
  flavor: KNOWN_FLAVOR,
}

describe("agentDefinitionSchema", () => {
  it("accepts an agent the roster carries", () => {
    expect(agentDefinitionSchema.safeParse(VALID_AGENT).success).toBe(true)
  })

  it("rejects a retired agent id", () => {
    expect(
      agentDefinitionSchema.safeParse({ ...VALID_AGENT, id: RETIRED_AGENT })
        .success
    ).toBe(false)
  })

  it("rejects a model the CLI no longer offers", () => {
    expect(
      agentDefinitionSchema.safeParse({ ...VALID_AGENT, model: RETIRED_MODEL })
        .success
    ).toBe(false)
  })

  // `flavor` is deliberately not narrowed here — which roles are sayable is
  // authored in the read model's preload table, and `preload-defaults.test.ts`
  // holds it to the roster ("names exactly the flavors the roster carries").
})

describe("agentDefinitionsSchema", () => {
  it("accepts the generated agent roster it ships with", () => {
    expect(agentDefinitionsSchema.safeParse(AGENT_DEFINITIONS).success).toBe(
      true
    )
  })
})

// A sub-agent naming no model means the roster said nothing, and only an ABSENT
// key says that: a key present holding `undefined` is a generator that
// assembled the entry and then failed to leave the field out. The refusal is
// paired with the absence it is there to keep permitted, since a boundary that
// turned both away would have made the field mandatory instead —
// `built-in-matrix.test.ts` holds the same pair for the matrix's two.
describe("optional fields, absent rather than undefined", () => {
  it("refuses a sub-agent whose model is present holding undefined", () => {
    expect(
      agentDefinitionSchema.safeParse({ ...VALID_AGENT, model: undefined })
        .success
    ).toBe(false)
  })

  it("accepts a sub-agent naming no model at all", () => {
    const { model: _dropped, ...withoutModel } = VALID_AGENT

    expect(agentDefinitionSchema.safeParse(withoutModel).success).toBe(true)
  })
})
