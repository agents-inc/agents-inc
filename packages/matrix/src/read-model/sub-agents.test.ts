import { describe, expect, it, vi } from "vitest"

import { AGENT_DEFINITIONS } from "../generated/agents"
import { SUB_AGENT_GROUPS, type SubAgentGroup } from "./sub-agents"

// Literals: these are the texts the roster panel renders.
const SHIPPED_LABELS = {
  "agent-summoner": "Agent Summoner",
  "ai-developer": "Developer",
  "ai-researcher": "Researcher",
  "ai-tester": "Tester",
  "api-developer": "Developer",
  "api-researcher": "Researcher",
  "api-tester": "Tester",
  "cli-developer": "Developer",
  "cli-researcher": "Researcher",
  "cli-tester": "Tester",
  "codex-keeper": "Codex Keeper",
  "convention-keeper": "Convention Keeper",
  pm: "PM",
  reviewer: "Reviewer",
  "skill-summoner": "Skill Summoner",
  "web-developer": "Developer",
  "web-researcher": "Researcher",
  "web-tester": "Tester",
}

// Domains in DOMAIN_ORDER, each group's agents by label.
const SHIPPED_ROSTER_ORDER = [
  ["web", ["web-developer", "web-researcher", "web-tester"]],
  ["api", ["api-developer", "api-researcher", "api-tester"]],
  ["ai", ["ai-developer", "ai-researcher", "ai-tester"]],
  ["cli", ["cli-developer", "cli-researcher", "cli-tester"]],
  [
    "meta",
    [
      "agent-summoner",
      "codex-keeper",
      "convention-keeper",
      "pm",
      "reviewer",
      "skill-summoner",
    ],
  ],
]

const rosterOrderOf = (groups: readonly SubAgentGroup[]) =>
  groups.map((group) => [group.domainId, group.agents.map((agent) => agent.id)])

const agentsOf = (groups: readonly SubAgentGroup[]) =>
  groups.flatMap((group) => group.agents)

describe("SUB_AGENT_GROUPS", () => {
  it("labels each sub-agent by its role, without its domain prefix", () => {
    expect(
      Object.fromEntries(
        agentsOf(SUB_AGENT_GROUPS).map((agent) => [agent.id, agent.label])
      )
    ).toStrictEqual(SHIPPED_LABELS)
  })

  it("carries each sub-agent's model from its definition", () => {
    for (const agent of agentsOf(SUB_AGENT_GROUPS)) {
      expect(agent.model, agent.id).toBe(AGENT_DEFINITIONS[agent.id].model)
    }
  })

  it("groups the roster by domain and orders each group by label", () => {
    expect(rosterOrderOf(SUB_AGENT_GROUPS)).toStrictEqual(SHIPPED_ROSTER_ORDER)
  })

  it("orders the roster the same whatever order its definitions arrive in", async () => {
    vi.resetModules()
    vi.doMock("../generated/agents", () => ({
      AGENT_DEFINITIONS: Object.fromEntries(
        Object.entries(AGENT_DEFINITIONS).reverse()
      ),
    }))

    const { SUB_AGENT_GROUPS: fromReversed } = await import("./sub-agents")

    expect(rosterOrderOf(fromReversed)).toStrictEqual(SHIPPED_ROSTER_ORDER)

    vi.doUnmock("../generated/agents")
    vi.resetModules()
  })
})
