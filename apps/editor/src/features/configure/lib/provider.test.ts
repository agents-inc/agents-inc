import { AGENTS_NOT_ON_CODEX } from "@workspace/compile/agent-source"
import { describe, expect, it } from "vitest"

import {
  AGENTS_LEFT_OUT_OF_CODEX,
  agentsLeftOutOfCodexNotice,
  compilesAgent,
  leftOutOfCodexReason,
  offersPlacement,
  patchForPress,
  placementRefusal,
  unofferedPlacementLabel,
  untrustedProjectNote,
} from "./provider"

// `provider.ts` cannot import the renderer's roster, so the mirror is pinned
// here.
describe("the roster Codex leaves out", () => {
  it("is the renderer's own list, mirrored", () => {
    expect([...AGENTS_LEFT_OUT_OF_CODEX]).toStrictEqual([
      ...AGENTS_NOT_ON_CODEX,
    ])
  })

  it("is what the grid and the roster ask about", () => {
    for (const agent of AGENTS_NOT_ON_CODEX) {
      expect(compilesAgent("codex", agent)).toBe(false)
      expect(compilesAgent("claude", agent)).toBe(true)
    }
  })

  it("leaves the sub-agents beside them alone", () => {
    expect(compilesAgent("codex", "reviewer")).toBe(true)
  })
})

describe("the placements a provider offers", () => {
  const PLACEMENTS = [
    { install: "plugin", scope: "global" },
    { install: "eject", scope: "global" },
    { install: "eject", scope: "project" },
  ] as const

  it("offers Codex the three it has a mechanism for", () => {
    for (const placement of PLACEMENTS) {
      expect(offersPlacement("codex", placement)).toBe(true)
    }
  })

  it("refuses the fourth on Codex and allows it on Claude", () => {
    const refused = { install: "plugin", scope: "project" } as const

    expect(offersPlacement("codex", refused)).toBe(false)
    expect(offersPlacement("claude", refused)).toBe(true)
  })
})

describe("the patch a press produces", () => {
  const EJECT_PROJECT = { install: "eject", scope: "project" } as const
  const PLUGIN_GLOBAL = { install: "plugin", scope: "global" } as const

  it("takes a plugin press to global on Codex", () => {
    expect({
      ...EJECT_PROJECT,
      ...patchForPress("codex", { install: "plugin" }),
    }).toStrictEqual(PLUGIN_GLOBAL)
  })

  it("leaves a plugin press at project on Claude", () => {
    expect({
      ...EJECT_PROJECT,
      ...patchForPress("claude", { install: "plugin" }),
    }).toStrictEqual({ install: "plugin", scope: "project" })
  })

  it("leaves the scope of an eject press alone on Codex", () => {
    expect({
      ...PLUGIN_GLOBAL,
      ...patchForPress("codex", { install: "eject" }),
    }).toStrictEqual({ install: "eject", scope: "global" })
  })

  it("passes a scope press through unchanged on Codex", () => {
    expect(patchForPress("codex", { scope: "project" })).toStrictEqual({
      scope: "project",
    })
  })
})

// What the panel, the Install button and the roster say about Codex.
describe("the sentences Codex's limits are explained in", () => {
  it("refuses plugin+project on Codex by naming every placement it offers", () => {
    expect(
      placementRefusal("codex", { install: "plugin", scope: "project" })
    ).toBe(
      "Codex installs plugins for the whole machine, so plugin+project is not offered. It installs plugin+global, eject+global or eject+project."
    )
  })

  it("refuses nothing Codex offers, and nothing on Claude", () => {
    expect(
      placementRefusal("codex", { install: "eject", scope: "project" })
    ).toBeUndefined()
    expect(
      placementRefusal("claude", { install: "plugin", scope: "project" })
    ).toBeUndefined()
  })

  it.each([
    [1, "1 skill needs a Codex placement"],
    [3, "3 skills need a Codex placement"],
  ])("labels %i unplaced skills on the Install button", (count, label) => {
    expect(unofferedPlacementLabel(count)).toBe(label)
  })

  it("says why a sub-agent is left out of a Codex install", () => {
    expect(leftOutOfCodexReason()).toBe(
      "Codex installs leave this sub-agent out for v1 — its roster mechanics on Codex are not proven."
    )
  })

  it.each([
    [
      "one sub-agent",
      ["agent-summoner"],
      "agent-summoner is not installed on Codex — left out for v1, because their roster mechanics there are not proven.",
    ],
    [
      "two sub-agents",
      ["agent-summoner", "skill-summoner"],
      "agent-summoner and skill-summoner are not installed on Codex — left out for v1, because their roster mechanics there are not proven.",
    ],
  ])("names %s left out of a Codex install", (_label, agentNames, notice) => {
    expect(agentsLeftOutOfCodexNotice(agentNames)).toBe(notice)
  })

  it("warns that an untrusted Codex project ignores its sub-agents", () => {
    expect(untrustedProjectNote()).toBe(
      "Codex reads a project's sub-agents only once the project is trusted — until then the skills still reach the model and the rest is ignored silently."
    )
  })
})
