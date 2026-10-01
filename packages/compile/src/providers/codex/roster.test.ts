/**
 * Which sub-agents a Codex installation compiles, and the two sentences a Codex
 * compile owes the user about what it did NOT do.
 *
 * **Sixteen of eighteen, by member.** `skill-summoner` and `agent-summoner` are
 * left out for v1 by the owner's ruling. Every one of the CLI's seventeen
 * shipped stacks lists both, so the drop line fires on every Codex install —
 * which is exactly why it is ONE line covering both agents, printed once per
 * compile, rather than one per agent or one per stack.
 *
 * **Members, never a count.** `toHaveLength(16)` cannot see a swap: retire one
 * agent, add another, and the count is still sixteen while the roster is wrong.
 * {@link CODEX_ROSTER} is the expected value and it is spelled out rather than
 * derived from the predicate under test, because an expectation derived from the
 * mapping it checks agrees with it however that mapping changes.
 *
 * **The two messages are separate claims and do not merge.** One says which
 * sub-agents are absent from this provider; the other says which SETTINGS of the
 * sub-agents that ARE here have no Codex expression. A single "here is what we
 * dropped" line would be a user unable to tell whether their reviewer exists.
 *
 * Measured, 2026-09-22, against the pinned `@openai/codex` 0.155.1 and the
 * shipped definitions in `packages/matrix/src/generated/agents.ts`:
 *
 *   - eighteen agents ship; exactly one of them (`skill-summoner`) omits Bash,
 *     and it is one of the two left out — so `[features] shell_tool = false` is
 *     emitted for no shipped agent on Codex today;
 *   - all eighteen declare `model`, and none declares `effort`,
 *     `disallowedTools`, `permissionMode`, `isolation` or `experimental`.
 *     `effort` is the one of those with a Codex home, which is why it is not in
 *     {@link UNEXPRESSIBLE_ON_CODEX}: a configuration can still set one per
 *     sub-agent, and `agent-role-toml.ts` carries it as `model_reasoning_effort`;
 *   - `model = "opus"` parses and REGISTERS on Codex (both probe roles reached
 *     the model's `spawn_agent` roster with it set). _Corrected 2026-09-26:_
 *     this said `model` was therefore carried rather than reported. On a real
 *     subscription (codex-cli 0.157.1) no role naming a Claude model can be
 *     SPAWNED, so `model` is now never written and "Claude models" is reported
 *     with the rest. `model_reasoning_effort` was measured on the same run and
 *     does resolve.
 *
 * Written before `./roster` existed and red on the missing module.
 */

import { describe, expect, it } from "vitest"

import {
  AGENTS_NOT_ON_CODEX,
  CODEX_AGENT_ROSTER,
  agentsLeftOutOfCodexMessage,
  compilesForCodex,
  unexpressibleOnCodexMessage,
  UNEXPRESSIBLE_ON_CODEX,
} from "./roster"

/**
 * The sixteen sub-agents a Codex installation compiles.
 *
 * Spelled out rather than read off `AGENT_DEFINITIONS` minus a filter: deriving
 * the expectation from the roster under test would make this assertion agree
 * with any future change to either. A sub-agent added to the product lands here
 * deliberately or the spec reddens, which is the point.
 */
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

/** The two the owner ruled out of v1. */
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
    // Over plain strings, so the two rosters need not share a narrow literal union for the
    // question to be askable at all — an agent in both lists is a contradiction whatever they
    // are typed as.
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
    // The line OPENS by naming Codex, so the assertion above holds for a line that gives no reason
    // at all. The reason is the owner's recorded one — `AGENTS_NOT_ON_CODEX` in `roster.ts` says
    // where — held as a literal because a reason restated from the constant that prints it could
    // not go missing.
    expect(
      agentsLeftOutOfCodexMessage(),
      "the line says which sub-agents are absent without saying why"
    ).toContain(
      "are left out for v1, because their roster mechanics on Codex are not proven."
    )
  })
})

describe("the settings a Codex role file cannot express", () => {
  /**
   * The six things with NO Codex expression at all. Five were measured against
   * the pinned binary's deserializer rather than inferred from its
   * documentation; the sixth, a Claude model, only on a real subscription —
   * it registers and then cannot be spawned (codex-cli 0.157.1, 2026-09-26).
   *
   * `tools` as an allowlist is the one that bites today: every shipped agent
   * declares one, so the five read-only sub-agents can still edit files on
   * Codex. The other four are absent from every shipped definition, which is
   * why they must be REPORTED rather than quietly not-emitted — a user-authored
   * agent setting one would otherwise lose it in silence.
   */
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
