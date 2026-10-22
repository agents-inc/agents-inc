/**
 * Held to what the pinned Codex binary accepts (the measured keys are in `agent-role-toml.ts`):
 * one unlisted key drops the whole file, so every render is parsed back with a real TOML parser.
 */

import { CODEX_MODEL_NAMES, EFFORT_NAMES, MODEL_NAMES } from "@workspace/matrix"
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

const EVERY_EFFORT_LEVEL = EFFORT_NAMES
const EVERY_CLAUDE_MODEL = MODEL_NAMES
const EVERY_CODEX_MODEL = CODEX_MODEL_NAMES

const PINNED_CODEX_MODEL = "gpt-5.6-terra"

/** Multi-line and quoted on purpose: only one of TOML's string forms survives both. */
const BODY = [
  provenanceMarker(),
  "",
  "# Web Developer Agent",
  "",
  '<role>He said "ship it" and meant it.</role>',
  "",
  "Tabs\tand a trailing backslash \\",
].join("\n")

const WRITER = buildAgentConfig("web-developer", {
  tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
  model: "opus",
  skills: [],
})

/** Bash is still granted, so it can still edit files. */
const READ_ONLY = buildAgentConfig("web-researcher", {
  tools: ["Read", "Grep", "Glob", "Bash"],
  model: "opus",
  skills: [],
})

/** Synthetic: no shipped agent Codex compiles omits Bash, but a user-authored one can. */
const NO_BASH = buildAgentConfig("no-bash", {
  tools: ["Read", "Write", "Edit", "Grep", "Glob"],
  model: "opus",
  skills: [],
})

const PINNED = buildAgentConfig("web-developer", {
  tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
  model: "opus",
  codexModel: PINNED_CODEX_MODEL,
  skills: [],
})

/** Spelled out rather than imported from the module under test. */
const REJECTED_BY_CODEX = [
  "disallowed_tools",
  "effort",
  "experimental",
  "isolation",
  "permissionMode",
  "reasoning_effort",
  "tools",
] as const

const REQUIRED_BY_CODEX = [
  "description",
  "developer_instructions",
  "name",
] as const

function rolesKeysOf(rendered: string): string[] {
  return Object.keys(parse(rendered)).sort()
}

/** A parsed value narrowed to a string, so a table cannot compare as `[object Object]`. */
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

    for (const agent of [WRITER, READ_ONLY, NO_BASH, PINNED]) {
      const emitted = rolesKeysOf(renderAgentRoleToml(agent, BODY))

      expect(
        emitted.filter((key) => !accepted.includes(key)),
        `${agent.name} emits a key Codex does not accept, which drops the whole file`
      ).toStrictEqual([])
    }
  })
})

describe("the settings Codex can express", () => {
  // Codex cannot spawn a role naming a Claude model.
  it("never writes a Claude model into a role with no Codex pin", () => {
    for (const model of EVERY_CLAUDE_MODEL) {
      const rendered = renderAgentRoleToml({ ...WRITER, model }, BODY)

      expect(
        parse(rendered).model,
        `model = "${model}" reached a Codex role, which Codex refuses to spawn`
      ).toBeUndefined()
      expect(rendered).not.toMatch(/^model\s*=/m)
    }
  })

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

  // `effort = "high"` drops the whole file; `model_reasoning_effort = "high"` registers.
  it("carries the agent's effort as model_reasoning_effort, the key Codex takes", () => {
    const tuned: AgentConfig = { ...WRITER, effort: "high" }
    const parsed = parse(renderAgentRoleToml(tuned, BODY))

    expect(parsed.model_reasoning_effort).toBe("high")
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

/** A pin always brings an effort (configured, else `medium`): an inherited one may be refused. */
describe("a Codex model pin", () => {
  it("writes the pinned id as the role's model, never the Claude model beside it", () => {
    const parsed = parse(renderAgentRoleToml(PINNED, BODY))

    expect(parsed.model).toBe(PINNED_CODEX_MODEL)
  })

  it("writes every offered id it is handed", () => {
    for (const codexModel of EVERY_CODEX_MODEL) {
      const parsed = parse(renderAgentRoleToml({ ...PINNED, codexModel }, BODY))

      expect(parsed.model, `${codexModel} did not reach the role file`).toBe(
        codexModel
      )
    }
  })

  it("brings medium effort with a pin when the agent declares none", () => {
    const parsed = parse(renderAgentRoleToml(PINNED, BODY))

    expect(parsed.model_reasoning_effort).toBe("medium")
  })

  it("brings the agent's own effort with a pin when it declares one", () => {
    const parsed = parse(
      renderAgentRoleToml({ ...PINNED, effort: "high" }, BODY)
    )

    expect(parsed.model_reasoning_effort).toBe("high")
  })

  it("names the model and its effort after who the role is and before the prose", () => {
    const lines = renderAgentRoleToml(PINNED, BODY).split("\n")

    expect(lines.slice(0, 5)).toStrictEqual([
      'name = "web-developer"',
      'description = "The web-developer sub-agent"',
      `model = "${PINNED_CODEX_MODEL}"`,
      'model_reasoning_effort = "medium"',
      'developer_instructions = """',
    ])
  })

  it("leaves a role with no pin exactly as it was: no model and no invented effort", () => {
    const { codexModel: _unpinned, ...unpinned } = PINNED

    expect(rolesKeysOf(renderAgentRoleToml(unpinned, BODY))).toStrictEqual([
      "description",
      "developer_instructions",
      "name",
    ])
  })
})

describe("the rendered file as TOML", () => {
  // Exactly one trailing newline survives; stated rather than trimmed so either end can fail.
  const BODY_AS_TOML_RETURNS_IT = `${BODY}\n`

  it("round-trips: every scalar parses back to what was rendered", () => {
    const parsed = parse(renderAgentRoleToml(WRITER, BODY))

    expect(parsed.name).toBe(WRITER.name)
    expect(parsed.description).toBe(WRITER.description)
    expect(
      asString(parsed.developer_instructions, "developer_instructions")
    ).toBe(BODY_AS_TOML_RETURNS_IT)
  })

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

/** Each codepoint either side of the ranges TOML refuses raw inside a string. */
const CONTROL_BOUNDARIES = "a\u0000b\u0008c\td\ne\u000bf\u001fg h\u007fi~"

describe("the characters TOML refuses raw", () => {
  it("escapes every forbidden control character in the instructions and leaves tab and newline raw", () => {
    expect(renderAgentRoleToml(WRITER, CONTROL_BOUNDARIES)).toContain(
      'developer_instructions = """\na\\u0000b\\u0008c\td\ne\\u000bf\\u001fg h\\u007fi~\n"""'
    )
  })

  it("parses the escaped instructions back to the characters they stand for", () => {
    const parsed = parse(renderAgentRoleToml(WRITER, CONTROL_BOUNDARIES))

    expect(
      asString(parsed.developer_instructions, "developer_instructions")
    ).toBe(`${CONTROL_BOUNDARIES}\n`)
  })

  it("puts a description's newline and tab on one line as escapes", () => {
    const multiline: AgentConfig = {
      ...WRITER,
      description: "First line\nsecond\tline",
    }

    const rendered = renderAgentRoleToml(multiline, BODY)

    expect(rendered).toContain('\ndescription = "First line\\nsecond\\tline"\n')
    expect(parse(rendered).description).toBe(multiline.description)
  })
})

describe("the quotes in the instructions", () => {
  const BODY_ENDING_ITS_OWN_STRING =
    'Write """ to close a string, or "" for an empty one.'

  it("escapes only a run that would close the string, so the markdown stays readable", () => {
    expect(renderAgentRoleToml(WRITER, BODY_ENDING_ITS_OWN_STRING)).toContain(
      'Write \\"\\"\\" to close a string, or "" for an empty one.'
    )
  })

  it("parses that run back as the quotes it was", () => {
    const parsed = parse(
      renderAgentRoleToml(WRITER, BODY_ENDING_ITS_OWN_STRING)
    )

    expect(
      asString(parsed.developer_instructions, "developer_instructions")
    ).toBe(`${BODY_ENDING_ITS_OWN_STRING}\n`)
  })
})
