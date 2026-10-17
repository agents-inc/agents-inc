import { SUB_AGENT_GROUPS } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { PLACED_AGENT_IDS } from "./agent-placement"

// Held against `SUB_AGENT_GROUPS` rather than a hardcoded list, so a new role
// cannot be missed by the same edit that adds it.
const ROSTER = SUB_AGENT_GROUPS.flatMap((group) => group.agents).map(
  (agent) => agent.id
)

describe("the skill options panel's reach", () => {
  // Both sides are derived, so guard against both being empty.
  it("has a roster to be held against", () => {
    expect(ROSTER.length).toBeGreaterThan(0)
  })

  // Arrays, not a count or set: catches swaps and an agent placed twice.

  it("places every sub-agent the roster carries, and no other", () => {
    expect([...PLACED_AGENT_IDS].sort()).toStrictEqual([...ROSTER].sort())
  })
})
