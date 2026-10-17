// Rosters are asserted by member and spelled out, never derived from the code under test.

import { describe, expect, it } from "vitest"

import {
  AGENTS_NOT_ON_CODEX,
  CODEX_AGENT_ROSTER,
  agentsLeftOutOfCodexMessage,
  compilesForCodex,
  unexpressibleOnCodexMessage,
  UNEXPRESSIBLE_ON_CODEX,
} from "./roster"

const CODEX_ROSTER = [
  "ai-developer",
  "ai-researcher",
  "ai-tester",
  "api-developer",
  "api-researcher",
  "api-tester",
  "cli-developer",
  "cli-researcher",
  "cli-tester",
  "codex-keeper",
  "convention-keeper",
  "pm",
  "reviewer",
  "web-developer",
  "web-researcher",
  "web-tester",
] as const

const LEFT_OUT = ["agent-summoner", "skill-summoner"] as const

describe("the sub-agents a Codex installation compiles", () => {
  it("is the shipped roster minus the two summoners, by member", () => {
    expect([...CODEX_AGENT_ROSTER].sort()).toStrictEqual([...CODEX_ROSTER])
  })

  it("names the two it leaves out, by member", () => {
    expect([...AGENTS_NOT_ON_CODEX].sort()).toStrictEqual([...LEFT_OUT])
  })

  it("answers for each agent individually", () => {
    for (const agent of CODEX_ROSTER) expect(compilesForCodex(agent)).toBe(true)
    for (const agent of LEFT_OUT) expect(compilesForCodex(agent)).toBe(false)
  })

  it("leaves out nothing the roster also claims", () => {
    // Over plain strings, so the two rosters need not share a literal union.
    const leftOut = new Set<string>(AGENTS_NOT_ON_CODEX)
    const overlap = [...CODEX_AGENT_ROSTER].filter((agent: string) =>
      leftOut.has(agent)
    )

    expect(
      overlap,
      "an agent cannot be both compiled and left out"
    ).toStrictEqual([])
  })
})

describe("the line that says which sub-agents are absent", () => {
  it("names both summoners", () => {
    const said = agentsLeftOutOfCodexMessage()

    for (const agent of LEFT_OUT) expect(said).toContain(agent)
  })

  it("is one line, so a compile cannot print it per agent or per stack", () => {
    expect(agentsLeftOutOfCodexMessage().split("\n")).toHaveLength(1)
  })

  it("names each summoner exactly once", () => {
    const said = agentsLeftOutOfCodexMessage()

    for (const agent of LEFT_OUT) {
      expect(
        said.split(agent),
        `${agent} is named more than once`
      ).toHaveLength(2)
    }
  })

  it("says why they are absent rather than only that they are", () => {
    expect(agentsLeftOutOfCodexMessage().toLowerCase()).toContain("codex")
    // The line opens by naming Codex, so the check above passes without a reason.
    expect(
      agentsLeftOutOfCodexMessage(),
      "the line says which sub-agents are absent without saying why"
    ).toContain(
      "are left out for v1, because their roster mechanics on Codex are not proven."
    )
  })
})

describe("the settings a Codex role file cannot express", () => {
  // Reported rather than silently dropped, so a user-authored agent setting one is told.
  const NO_CODEX_EXPRESSION = [
    "Claude models",
    "experimental",
    "isolation",
    "permissionMode",
    "preloaded skills",
    "tool allowlists",
  ] as const

  it("names all six, by member", () => {
    expect([...UNEXPRESSIBLE_ON_CODEX].sort()).toStrictEqual([
      ...NO_CODEX_EXPRESSION,
    ])
  })

  it("reports them in one line, not one per setting", () => {
    expect(unexpressibleOnCodexMessage().split("\n")).toHaveLength(1)
  })

  it("names every one of them in that line", () => {
    const said = unexpressibleOnCodexMessage()

    for (const setting of NO_CODEX_EXPRESSION) expect(said).toContain(setting)
  })

  it("names each exactly once, so a compile cannot repeat one per agent", () => {
    const said = unexpressibleOnCodexMessage()

    for (const setting of NO_CODEX_EXPRESSION) {
      expect(
        said.split(setting),
        `${setting} is named more than once`
      ).toHaveLength(2)
    }
  })

  it("is a different sentence from the absent-sub-agents one", () => {
    expect(unexpressibleOnCodexMessage()).not.toBe(
      agentsLeftOutOfCodexMessage()
    )
  })
})
