import { describe, expect, it } from "vitest"

import {
  offAssignment,
  persistedConfig,
  skillCarriedBy,
  skillEntry,
} from "@/__tests__/factories/config-selection-factories"

import { agentSwitchNotices, agentSwitchOffNotices } from "./agent-switches"

const REACT = "web-framework-react"
const VUE = "web-framework-vue-composition-api"
const TAILWIND = "web-styling-tailwind"
const HONO = "api-framework-hono"

// A fresh pick of React or Tailwind reaches these, in the roster's order.
const WEB_AND_ROLE_AGENTS = [
  "web-developer",
  "web-researcher",
  "web-tester",
  "pm",
  "reviewer",
] as const

const NOTHING = persistedConfig()

describe("what a change to the selection says about its sub-agents", () => {
  it("names a sub-agent switched off and the skill whose removal did it", () => {
    const before = persistedConfig({
      skills: { [TAILWIND]: skillCarriedBy(["web-tester"]) },
    })
    const after = persistedConfig({
      skills: {
        [TAILWIND]: skillEntry({
          assignments: { "web-tester": offAssignment() },
        }),
      },
    })

    expect(agentSwitchNotices(before, after, "claude")).toStrictEqual([
      "web tester switched off: Tailwind CSS removed",
    ])
  })

  it("names the first three sub-agents switched on, then counts the rest", () => {
    const after = persistedConfig({
      skills: { [REACT]: skillCarriedBy(WEB_AND_ROLE_AGENTS) },
    })

    expect(agentSwitchNotices(NOTHING, after, "claude")).toStrictEqual([
      "web developer, web researcher, web tester and 2 more switched on: React added",
    ])
  })

  it("names three in full, with no count", () => {
    const after = persistedConfig({
      skills: { [REACT]: skillCarriedBy(WEB_AND_ROLE_AGENTS.slice(0, 3)) },
    })

    expect(agentSwitchNotices(NOTHING, after, "claude")).toStrictEqual([
      "web developer, web researcher and web tester switched on: React added",
    ])
  })

  it("says nothing of a sub-agent another skill already keeps on", () => {
    const tailwindOnly = persistedConfig({
      skills: { [TAILWIND]: skillCarriedBy(["web-tester"]) },
    })
    const both = persistedConfig({
      skills: {
        [TAILWIND]: skillCarriedBy(["web-tester"]),
        [REACT]: skillCarriedBy(["web-tester"]),
      },
    })

    expect(agentSwitchNotices(tailwindOnly, both, "claude")).toStrictEqual([])
    expect(agentSwitchNotices(both, tailwindOnly, "claude")).toStrictEqual([])
  })

  it("says nothing of a sub-agent pinned on when its last skill goes", () => {
    const pinned = { "web-tester": { on: true } }
    const before = persistedConfig({
      skills: { [TAILWIND]: skillCarriedBy(["web-tester"]) },
      agents: pinned,
    })
    const after = persistedConfig({ agents: pinned })

    expect(agentSwitchNotices(before, after, "claude")).toStrictEqual([])
  })

  it("says nothing of a sub-agent pinned off that a skill reaches", () => {
    const pinned = { "web-tester": { on: false } }
    const after = persistedConfig({
      skills: { [REACT]: skillCarriedBy(["web-tester"]) },
      agents: pinned,
    })

    expect(
      agentSwitchNotices(persistedConfig({ agents: pinned }), after, "claude")
    ).toStrictEqual([])
  })

  it("leaves out a sub-agent Codex does not install, and names it on Claude", () => {
    const after = persistedConfig({
      skills: { [REACT]: skillCarriedBy(["web-developer", "agent-summoner"]) },
    })

    expect(agentSwitchNotices(NOTHING, after, "codex")).toStrictEqual([
      "web developer switched on: React added",
    ])
    expect(agentSwitchNotices(NOTHING, after, "claude")).toStrictEqual([
      "web developer and meta agent summoner switched on: React added",
    ])
  })

  it("says both when one pick replaces another", () => {
    const before = persistedConfig({
      skills: { [REACT]: skillCarriedBy(["web-tester"]) },
    })
    const after = persistedConfig({
      skills: { [VUE]: skillCarriedBy(["web-developer"]) },
    })

    expect(agentSwitchNotices(before, after, "claude")).toStrictEqual([
      "web developer switched on: Vue added",
      "web tester switched off: React removed",
    ])
  })

  it("names every skill of a batch that switched a sub-agent on", () => {
    const after = persistedConfig({
      skills: {
        [REACT]: skillCarriedBy(["web-developer"]),
        [HONO]: skillCarriedBy(["api-developer"]),
      },
    })

    expect(agentSwitchNotices(NOTHING, after, "claude")).toStrictEqual([
      "web developer and api developer switched on: React and Hono added",
    ])
  })
})

describe("what a change says about the sub-agents it switched off alone", () => {
  it("names the one switched off, and not the one switched on beside it", () => {
    const before = persistedConfig({
      skills: { [REACT]: skillCarriedBy(["web-tester"]) },
    })
    const after = persistedConfig({
      skills: { [VUE]: skillCarriedBy(["web-developer"]) },
    })

    expect(agentSwitchOffNotices(before, after, "claude")).toStrictEqual([
      "web tester switched off: React removed",
    ])
  })
})
