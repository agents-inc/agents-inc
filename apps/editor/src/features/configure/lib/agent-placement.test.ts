import { SUB_AGENT_GROUPS } from "@workspace/matrix"
import { describe, expect, it } from "vitest"

import { PLACED_AGENT_IDS } from "./agent-placement"

/**
 * THE ONE CLAIM ABOUT THE SKILL OPTIONS PANEL THAT NOTHING ELSE MAKES: every
 * sub-agent the roster carries is hand-assignable in it. What the panel LOOKS
 * like is covered in a real browser by `e2e/specs/skill-options.spec.ts`; this
 * is about reach, and reach is a set comparison rather than anything you can
 * see.
 *
 * The absence of this assertion is why four agents went missing in silence. The
 * roster gained a researcher per implementation domain (CLI-351), the grid's
 * column list did not, and the Meta fold takes only the meta group — so
 * `web-researcher`, `api-researcher`, `ai-researcher` and `cli-researcher` fell
 * through both routes while still taking skills from stacks and from
 * auto-assignment, and still appearing in the roster where they could be
 * switched off. Every spec in the suite stayed green.
 *
 * Held against `SUB_AGENT_GROUPS` — the placement's own input — rather than
 * against a list of names written here. A hardcoded expectation would have to
 * be edited by the same person adding the role, which is the edit that was
 * missed.
 */
const ROSTER = SUB_AGENT_GROUPS.flatMap((group) => group.agents).map(
  (agent) => agent.id
)

describe("the skill options panel's reach", () => {
  // Both sides are derived, so both could be empty and satisfy the comparison
  // below for free. This is the guard that says the comparison had a subject.
  it("has a roster to be held against", () => {
    expect(ROSTER.length).toBeGreaterThan(0)
  })

  /**
   * Sorted arrays rather than sets, and `toStrictEqual` rather than a count.
   * A count cannot see a swap — one role retired and another added leaves it
   * green — and an array catches the other direction too: an agent reachable
   * through BOTH the grid and the Meta fold appears twice and fails here.
   */
  it("places every sub-agent the roster carries, and no other", () => {
    expect([...PLACED_AGENT_IDS].sort()).toStrictEqual([...ROSTER].sort())
  })
})
