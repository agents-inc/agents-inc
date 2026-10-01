/**
 * The Codex agent ROLE DEFINITION renderer, pinned against what the pinned
 * binary actually does with the file — not against a schema anybody wrote down.
 *
 * **Why every claim here is a measurement.** Codex 0.155.1 parses
 * `$CODEX_HOME/agents/<file>.toml` and `<project>/.codex/agents/<file>.toml`
 * with a STRICT deserializer: one unlisted key and the WHOLE FILE is dropped,
 * with a startup warning nothing in a normal run shows. So "we emitted an extra
 * key" is not a cosmetic defect, it is sixteen sub-agents that silently do not
 * exist. Re-derived here, 2026-09-22, against the pinned `@openai/codex`
 * 0.155.1, each run under its own `HOME` and `CODEX_HOME` with the global
 * `config.toml` deleted first:
 *
 *     # accepted, no startup warning
 *     name / description / developer_instructions / model /
 *     model_reasoning_effort / sandbox_mode / approval_policy / instructions /
 *     [[hooks.pre_tool_use]] / [features] shell_tool / skills = { enabled = true }
 *
 *     # REJECTED — "Ignoring malformed agent role definition: failed to
 *     # deserialize agent role file at <path>: unknown field `<key>`"
 *     reasoning_effort, effort, disallowed_tools, permissionMode, isolation,
 *     experimental, and any unlisted key (`color` was the control)
 *     tools = [...]    -> "data did not match any variant of untagged enum
 *                          WebSearchToolConfigInput"
 *     skills = ["a"]   -> "invalid type: string \"a\", expected struct
 *                          BundledSkillsConfig"
 *
 * The three required keys were measured the same way, each omission on its own:
 * no `name` -> "must define a non-empty `name`"; no `description` -> "agent role
 * `p` must define a description"; no `developer_instructions`, and
 * `instructions` supplied in its place, both -> "must define
 * `developer_instructions`"; an EMPTY one -> "`.developer_instructions` cannot
 * be blank".
 *
 * **The role id is the `name` key, never the filename.** Measured twice: a
 * global role in `web-developer-role.toml` whose `name` was `web-developer`
 * reached the model's `spawn_agent` roster as `web-developer`, and a project
 * role in `anything.toml` whose `name` was `proj-role` reached it as
 * `proj-role`. That is why the id is asserted from the rendered file's `name`
 * key rather than from a path this renderer never sees.
 *
 * **What this file cannot answer**, and what therefore sits on the owner's
 * end-of-programme hand-check list rather than being guessed at here: whether a
 * SPAWNED sub-agent's context actually receives its `developer_instructions`
 * whole. Registration is measurable offline and delivery is not.
 *
 * Written before `./agent-role-toml` existed and red on the missing module.
 */

import { EFFORT_NAMES, MODEL_NAMES } from "@workspace/matrix"
import { parse } from "smol-toml"
import { describe, expect, it } from "vitest"

import {
  CODEX_REJECTED_ROLE_KEYS,
  CODEX_REQUIRED_ROLE_KEYS,
  renderAgentRoleToml,
} from "./agent-role-toml"
import { provenanceMarker } from "../../agent-source"
import type { AgentConfig } from "../../types"
import { buildAgentConfig } from "../../__tests__/factories/agent-config-factories"

/**
 * Every reasoning effort this product can express, read off the vocabulary rather than spelled
 * out beside it.
 *
 * Derived on purpose, and it is the one place in this file that is: the claim below is universally
 * quantified over the product's OWN effort levels, so a sixth level added to `EFFORT_NAMES` must
 * be covered the day it ships rather than the day somebody remembers this list. `EFFORT_NAMES` is
 * not the subject here — the renderer is — so nothing moves with the thing under test.
 */
const EVERY_EFFORT_LEVEL = EFFORT_NAMES

/**
 * Every model this product can name — all of them Claude's — read off the vocabulary for the same
 * reason as {@link EVERY_EFFORT_LEVEL}: a model added to `MODEL_NAMES` must be kept out of a Codex
 * role the day it ships.
 */
const EVERY_MODEL = MODEL_NAMES

/**
 * The body a role's `developer_instructions` carries, standing in for the
 * compiled markdown an install renders.
 *
 * Multi-line and carrying a double quote on purpose: TOML has three string
 * forms and only one of them survives both, so a renderer that concatenated
 * strings instead of encoding them fails here rather than in a user's home
 * directory.
 */
const BODY = [
  provenanceMarker(),
  "",
  "# Web Developer Agent",
  "",
  '<role>He said "ship it" and meant it.</role>',
  "",
  "Tabs\tand a trailing backslash \\",
].join("\n")

/** A writer: the shape sixteen of the eighteen shipped sub-agents have. */
const WRITER = buildAgentConfig("web-developer", {
  tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
  model: "opus",
  skills: [],
})

/** A reader: Bash is still granted, which is why it can still edit files. */
const READ_ONLY = buildAgentConfig("web-researcher", {
  tools: ["Read", "Grep", "Glob", "Bash"],
  model: "opus",
  skills: [],
})

/**
 * An agent granted no Bash.
 *
 * **Synthetic on purpose, and the spec below says so.** Of the eighteen shipped
 * definitions exactly one omits Bash — `skill-summoner` — and that is one of the
 * two Codex does not compile, so `[features] shell_tool = false` is emitted for
 * NO shipped agent today. The rule is still rendered and still tested, because
 * a user-authored agent reaches the same renderer.
 */
const NO_BASH = buildAgentConfig("no-bash", {
  tools: ["Read", "Write", "Edit", "Grep", "Glob"],
  model: "opus",
  skills: [],
})

/**
 * The keys Codex's deserializer refuses, each one taking the whole file with it.
 *
 * A named constant compared by MEMBER rather than a count: a count cannot see a
 * swap, and the population here is the difference between sixteen sub-agents and
 * zero. Spelled out here rather than imported into the expectation for the
 * reason the repository's own rule gives — an assertion bound to the constant it
 * is checking moves with it and cannot fail.
 */
const REJECTED_BY_CODEX = [
  "disallowed_tools",
  "effort",
  "experimental",
  "isolation",
  "permissionMode",
  "reasoning_effort",
  "tools",
] as const

/** What a role file must carry, or Codex drops it whole. */
const REQUIRED_BY_CODEX = [
  "description",
  "developer_instructions",
  "name",
] as const

/** The rendered file's TOML, parsed — the only way a key claim is checked. */
function rolesKeysOf(rendered: string): string[] {
  return Object.keys(parse(rendered)).sort()
}

/**
 * A parsed value held to being a string before anything reads it.
 *
 * Stronger than the `String(value)` these call sites used to spell, which any object satisfies by
 * stringifying to `[object Object]` — so a `developer_instructions` that came back as a table
 * would have been compared as that literal rather than reported. Three lines and no parsing: this
 * is a type narrowing, not a helper that would need tests of its own.
 */
function asString(value: unknown, key: string): string {
  if (typeof value !== "string")
    throw new Error(`${key} did not parse back as a string`)
  return value
}

describe("what Codex requires of an agent role file", () => {
  it("emits all three required keys for every agent", () => {
    for (const agent of [WRITER, READ_ONLY, NO_BASH]) {
      const parsed = parse(renderAgentRoleToml(agent, BODY))

      expect(
        REQUIRED_BY_CODEX.filter((key) => parsed[key] === undefined),
        `${agent.name} is missing a key Codex requires, so Codex drops the whole file`
      ).toStrictEqual([])
    }
  })

  it("exports the three it requires, so one place says what they are", () => {
    expect([...CODEX_REQUIRED_ROLE_KEYS].sort()).toStrictEqual([
      ...REQUIRED_BY_CODEX,
    ])
  })

  it("never emits a blank developer_instructions, which Codex refuses", () => {
    const parsed = parse(renderAgentRoleToml(WRITER, BODY))

    expect(parsed.developer_instructions).not.toBe("")
    expect(typeof parsed.developer_instructions).toBe("string")
  })

  // The refusal the spec above names and its input never reaches: BODY is not blank, so that spec
  // passed with nothing between an empty compiled body and a role file Codex drops. A body of
  // nothing but whitespace is refused the same way, because the renderer judges it trimmed.
  it.each([
    ["an empty body", ""],
    ["a body of nothing but whitespace", "\n\n \t\n"],
  ])("refuses %s rather than writing a role Codex drops", (_shape, body) => {
    expect(
      () => renderAgentRoleToml(WRITER, body),
      "a blank developer_instructions drops the whole role file, so the render has to refuse it and name the agent"
    ).toThrow(`"${WRITER.name}"`)
  })

  it("carries the provenance marker at the head of developer_instructions", () => {
    const parsed = parse(renderAgentRoleToml(WRITER, BODY))
    const instructions = asString(
      parsed.developer_instructions,
      "developer_instructions"
    )

    expect(instructions.startsWith(provenanceMarker())).toBe(true)
  })

  it("carries the body whole, quotes, tabs and backslashes included", () => {
    const parsed = parse(renderAgentRoleToml(WRITER, BODY))

    expect(
      asString(parsed.developer_instructions, "developer_instructions")
    ).toContain('<role>He said "ship it" and meant it.</role>')
    expect(
      asString(parsed.developer_instructions, "developer_instructions")
    ).toContain("Tabs\tand a trailing backslash \\")
  })
})

describe("the role id", () => {
  it("is the name key and not the file it is written to", () => {
    const parsed = parse(renderAgentRoleToml(WRITER, BODY))

    expect(parsed.name).toBe("web-developer")
  })

  it("is the agent's own name for every agent rendered", () => {
    for (const agent of [WRITER, READ_ONLY, NO_BASH]) {
      expect(parse(renderAgentRoleToml(agent, BODY)).name).toBe(agent.name)
    }
  })
})

describe("the keys Codex's deserializer refuses", () => {
  it("names them in one exported roster, by member", () => {
    expect([...CODEX_REJECTED_ROLE_KEYS].sort()).toStrictEqual([
      ...REJECTED_BY_CODEX,
    ])
  })

  it("emits none of them, for an agent that sets every one of them", () => {
    const everything: AgentConfig = {
      ...WRITER,
      effort: "high",
      disallowedTools: ["Bash"],
      permissionMode: "acceptEdits",
      isolation: "worktree",
      experimental: { cacheTtl: "1h" },
    }

    const emitted = rolesKeysOf(renderAgentRoleToml(everything, BODY))

    expect(
      REJECTED_BY_CODEX.filter((key) => emitted.includes(key)),
      "a key Codex refuses was emitted, which drops the whole file"
    ).toStrictEqual([])
  })

  /**
   * The four frontmatter fields with no Codex expression at all still render byte-identically to
   * an agent that declares none of them.
   *
   * `effort` was the fifth member of this case until 2026-09-22 and is deliberately no longer in
   * it. The KEY `effort` is still refused and is still never emitted — the case above is where
   * that is asserted — but the VALUE has a Codex home, `model_reasoning_effort`, so an agent that
   * sets it no longer renders like one that does not. Splitting the two keeps this a claim about
   * silence rather than one that quietly acquired an exception, and it is a byte comparison rather
   * than a key comparison because "renders identically" is the claim.
   */
  it("renders an agent setting the four unexpressible fields exactly like one that sets none", () => {
    const unexpressible: AgentConfig = {
      ...WRITER,
      disallowedTools: ["Bash"],
      permissionMode: "acceptEdits",
      isolation: "worktree",
      experimental: { cacheTtl: "1h" },
    }

    expect(renderAgentRoleToml(unexpressible, BODY)).toBe(
      renderAgentRoleToml(WRITER, BODY)
    )
  })

  it("emits no key outside what Codex accepts, for any shipped shape", () => {
    const accepted = [
      "approval_policy",
      "description",
      "developer_instructions",
      "features",
      "hooks",
      "instructions",
      "model",
      "model_reasoning_effort",
      "name",
      "sandbox_mode",
      "skills",
    ]

    for (const agent of [WRITER, READ_ONLY, NO_BASH]) {
      const emitted = rolesKeysOf(renderAgentRoleToml(agent, BODY))

      expect(
        emitted.filter((key) => !accepted.includes(key)),
        `${agent.name} emits a key Codex does not accept, which drops the whole file`
      ).toStrictEqual([])
    }
  })
})

describe("the settings Codex can express", () => {
  /**
   * **Found on a real subscription, not by the rig.** `model = "opus"` parses and registers, so
   * every offline spec passed while no compiled sub-agent could be spawned: codex-cli 0.157.1
   * refused each with `The 'opus' model is not supported when using Codex with a ChatGPT
   * account.` (2026-09-26). This spec asserted the opposite — "passes the agent's model through" —
   * until then. Every model this product names is Claude's, so none may reach a role.
   */
  it("never writes a model, because every model this product names is Claude's", () => {
    for (const model of EVERY_MODEL) {
      const rendered = renderAgentRoleToml({ ...WRITER, model }, BODY)

      expect(
        parse(rendered).model,
        `model = "${model}" reached a Codex role, which Codex refuses to spawn`
      ).toBeUndefined()
      expect(rendered).not.toMatch(/^model\s*=/m)
    }
  })

  // The control: the renderer still writes the per-agent setting Codex CAN take, so the absence
  // above is the model being dropped and not every tuning line going with it.
  it("still carries the effort of an agent that declares one alongside a model", () => {
    const parsed = parse(
      renderAgentRoleToml({ ...WRITER, model: "opus", effort: "high" }, BODY)
    )

    expect(parsed.model_reasoning_effort).toBe("high")
    expect(parsed.model).toBeUndefined()
  })

  it("turns the shell tool off exactly when the agent has no Bash", () => {
    const withoutBash = parse(renderAgentRoleToml(NO_BASH, BODY))
    const withBash = parse(renderAgentRoleToml(WRITER, BODY))

    expect(withoutBash.features).toStrictEqual({ shell_tool: false })
    expect(withBash.features).toBeUndefined()
  })

  it("never turns it off for a reader, which still has Bash", () => {
    expect(parse(renderAgentRoleToml(READ_ONLY, BODY)).features).toBeUndefined()
  })

  /**
   * `effort` travels as `model_reasoning_effort`, which is a translation rather than a pass-through
   * and is the only one this renderer performs.
   *
   * Measured on the pinned 0.155.1, 2026-09-22, each run under its own `HOME` and `CODEX_HOME`
   * with the global `config.toml` deleted first and a valid control role beside the subject:
   * a role carrying `effort = "high"` is dropped whole (`unknown field \`effort\`` and the
   * subject absent from `spawn_agent`'s roster while the control is present), and the same role
   * carrying `model_reasoning_effort = "high"` registers. Every one of this product's five effort
   * levels was put through that rig and every one registered, and Codex's own effort vocabulary
   * — `minimal low medium high xhigh max ultra`, read off the pinned binary's interned variant
   * list — is a superset of ours, so no value of ours is left without a counterpart.
   *
   * Written before the renderer emitted the key, and red on a `model_reasoning_effort` that was
   * `undefined`.
   */
  it("carries the agent's effort as model_reasoning_effort, the key Codex takes", () => {
    const tuned: AgentConfig = { ...WRITER, effort: "high" }
    const parsed = parse(renderAgentRoleToml(tuned, BODY))

    expect(parsed.model_reasoning_effort).toBe("high")
    // And never under the spelling that costs the whole file.
    expect(parsed.effort).toBeUndefined()
  })

  it("carries every effort level this product can express", () => {
    for (const effort of EVERY_EFFORT_LEVEL) {
      const parsed = parse(renderAgentRoleToml({ ...WRITER, effort }, BODY))

      expect(
        parsed.model_reasoning_effort,
        `${effort} did not reach the role file`
      ).toBe(effort)
    }
  })

  it("emits no effort key at all for an agent that declares none", () => {
    expect(
      rolesKeysOf(renderAgentRoleToml(WRITER, BODY)),
      "an agent with no effort must not acquire one"
    ).not.toContain("model_reasoning_effort")
  })
})

describe("the rendered file as TOML", () => {
  /**
   * The body as TOML hands it back: the compiled prose and one newline.
   *
   * **Stated rather than trimmed away, which is the whole point of the assertion.** This read
   * `.trimEnd()` until 2026-09-22, and a round-trip that normalises one end before comparing
   * cannot see anything the renderer does to that end — a body whose own trailing blank line was
   * dropped, or a closing delimiter that acquired a second newline, both satisfy a trimmed
   * comparison exactly as well as a correct render does.
   *
   * The newline is the renderer's and is not optional: TOML's closing `"""` must start a line of
   * its own, and TOML discards the newline immediately after the OPENING delimiter, so exactly one
   * of the two survives into the value.
   */
  const BODY_AS_TOML_RETURNS_IT = `${BODY}\n`

  it("round-trips: every scalar parses back to what was rendered", () => {
    const parsed = parse(renderAgentRoleToml(WRITER, BODY))

    expect(parsed.name).toBe(WRITER.name)
    expect(parsed.description).toBe(WRITER.description)
    expect(
      asString(parsed.developer_instructions, "developer_instructions")
    ).toBe(BODY_AS_TOML_RETURNS_IT)
  })

  /**
   * A body ending in a blank line keeps it — the case the trimmed comparison above could not
   * have failed on, and the reason it was a gap rather than a style point.
   */
  it("does not eat a trailing blank line the compiled body carries", () => {
    const withTrailingBlank = `${BODY}\n\n`
    const parsed = parse(renderAgentRoleToml(WRITER, withTrailingBlank))

    expect(
      asString(parsed.developer_instructions, "developer_instructions")
    ).toBe(`${withTrailingBlank}\n`)
  })

  it("renders a description carrying TOML syntax without breaking the file", () => {
    const awkward: AgentConfig = {
      ...WRITER,
      description: 'Handles "quotes", [brackets] and = signs',
    }

    expect(parse(renderAgentRoleToml(awkward, BODY)).description).toBe(
      awkward.description
    )
  })
})
