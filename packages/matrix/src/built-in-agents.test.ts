import { describe, expect, it } from "vitest"

import {
  agentDefinitionSchema,
  agentDefinitionsSchema,
} from "./built-in-agents"
import { AGENT_DEFINITIONS } from "./generated/agents"

const KNOWN_AGENT = "web-developer"
const KNOWN_MODEL = "opus"
const KNOWN_FLAVOR = "developer"

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

  // `flavor` is narrowed by `flavorOf`, tested in `preload-defaults.test.ts`.
})

describe("agentDefinitionsSchema", () => {
  it("accepts the generated agent roster it ships with", () => {
    expect(agentDefinitionsSchema.safeParse(AGENT_DEFINITIONS).success).toBe(
      true
    )
  })
})

// Absent, not present as `undefined`; the refusal is paired with the absence it permits.
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
