import { SUB_AGENT_GROUPS, type SubAgentGroup } from "@workspace/matrix"
import { afterEach, describe, expect, it, vi } from "vitest"

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

// The shipped roster names every grid agent `<domain>-<role>`; an agent filed
// under a domain that is not its own is how a roster could break that.
describe("which sub-agents the grid draws", () => {
  afterEach(() => {
    vi.doUnmock("@workspace/matrix")
    vi.resetModules()
  })

  const gridOver = async (groups: readonly SubAgentGroup[]) => {
    vi.doMock("@workspace/matrix", async () => ({
      ...(await vi.importActual<typeof import("@workspace/matrix")>(
        "@workspace/matrix"
      )),
      SUB_AGENT_GROUPS: groups,
    }))
    vi.resetModules()

    const { matrixGroups } = await import("./agent-placement")
    return matrixGroups.map((group) => ({
      domainId: group.domainId,
      label: group.label,
      byRole: [...group.byRole].map(([role, agent]) => [role, agent.id]),
    }))
  }

  const groupOf = (domainId: string) =>
    SUB_AGENT_GROUPS.find((group) => group.domainId === domainId)!
  const agentOf = (agentId: string) =>
    SUB_AGENT_GROUPS.flatMap((group) => group.agents).find(
      (agent) => agent.id === agentId
    )!

  const WEB = groupOf("web")
  const API = groupOf("api")

  it("draws a domain's own agents by role, never one filed under it from another domain", async () => {
    expect(
      await gridOver([
        {
          ...WEB,
          agents: [agentOf("web-developer"), agentOf("api-tester")],
        },
      ])
    ).toStrictEqual([
      {
        domainId: "web",
        label: WEB.label,
        byRole: [["developer", "web-developer"]],
      },
    ])
  })

  it("draws no row for a domain none of whose agents has a role there", async () => {
    expect(
      await gridOver([
        { ...WEB, agents: [agentOf("web-developer")] },
        { ...API, agents: [agentOf("pm")] },
      ])
    ).toStrictEqual([
      {
        domainId: "web",
        label: WEB.label,
        byRole: [["developer", "web-developer"]],
      },
    ])
  })
})
