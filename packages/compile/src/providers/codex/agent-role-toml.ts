import type { AgentConfig, EffortLevel } from "../../types.js"

/**
 * One compiled sub-agent as a Codex agent role file.
 *
 * Codex 0.155.1's deserializer is strict: one unlisted key drops the whole file, with a startup
 * warning a normal run never shows. Measured on the pinned binary, each run under its own `HOME`
 * and `CODEX_HOME`:
 *
 *     accepted: name / description / developer_instructions / model / model_reasoning_effort /
 *               sandbox_mode / approval_policy / instructions / [[hooks.pre_tool_use]] /
 *               [features] shell_tool / skills = { enabled = true }
 *     refused:  reasoning_effort, effort, disallowed_tools, permissionMode, isolation,
 *               experimental, and anything unlisted; tools = [...] and skills = ["a"] fail on
 *               their value's shape
 *
 * A frontmatter field with no Codex expression is omitted and reported once by `./roster`. The TOML
 * is written by hand; `agent-role-toml.test.ts` parses every render back with a real parser.
 */

export const CODEX_REQUIRED_ROLE_KEYS = [
  "name",
  "description",
  "developer_instructions",
] as const

/** Each measured as its own one-key role against the pinned binary. */
export const CODEX_REJECTED_ROLE_KEYS = [
  "reasoning_effort",
  "effort",
  "disallowed_tools",
  "tools",
  "permissionMode",
  "isolation",
  "experimental",
] as const

/** The tool whose absence is the one per-agent limit Codex CAN express. */
const SHELL_TOOL = "Bash"

/**
 * One compiled sub-agent's role file. `body` is the frontmatter-free render (`renderAgentBody`),
 * already carrying the provenance marker, and becomes `developer_instructions` whole. The role id
 * is the `name` key, never the filename.
 */
export function renderAgentRoleToml(agent: AgentConfig, body: string): string {
  refuseBlankInstructions(agent.name, body)

  return [
    ...scalarLines(agent, body),
    // Last: every bare key after a table header belongs to that table.
    ...shellToolTable(agent),
  ].join("\n")
}

/** Exported so `hasCodexRoleMarker` in `../../agent-source.ts` finds the marker line after it. */
export const CODEX_DEVELOPER_INSTRUCTIONS_OPENER = `developer_instructions = """`

/** `effort = "high"` drops the whole file; `model_reasoning_effort = "high"` registers and resolves. */
const CODEX_EFFORT_KEY = "model_reasoning_effort"

/**
 * A pinned role with no effort inherits the parent's, which a small model may refuse at spawn.
 * Every offered Codex model accepts `medium`.
 */
const PINNED_MODEL_RESTING_EFFORT: EffortLevel = "medium"

function scalarLines(agent: AgentConfig, body: string): string[] {
  return [
    `name = ${basicString(agent.name)}`,
    `description = ${basicString(agent.description)}`,
    ...modelLines(agent),
    developerInstructions(body),
  ]
}

/**
 * The Codex pin and its effort, or the effort alone. `agent.model` is never written: it is a
 * Claude selector, and Codex refuses to spawn a role naming one (codex-cli 0.157.1, on a ChatGPT
 * account), where a role with no `model` runs on the session's.
 */
function modelLines(agent: AgentConfig): string[] {
  if (agent.codexModel === undefined) {
    return agent.effort === undefined ? [] : [effortLine(agent.effort)]
  }

  return [
    `model = ${basicString(agent.codexModel)}`,
    effortLine(agent.effort ?? PINNED_MODEL_RESTING_EFFORT),
  ]
}

function effortLine(effort: EffortLevel): string {
  return `${CODEX_EFFORT_KEY} = ${basicString(effort)}`
}

/** The prose, as a multi-line TOML string whose opening delimiter's own newline TOML discards. */
function developerInstructions(body: string): string {
  return `${CODEX_DEVELOPER_INSTRUCTIONS_OPENER}\n${asMultilineString(body)}\n"""`
}

/**
 * `[features] shell_tool = false` for an agent granted no Bash. No shipped agent Codex compiles
 * reaches it; a user-authored one can.
 */
function shellToolTable(agent: AgentConfig): string[] {
  if (agent.tools.includes(SHELL_TOOL)) return []
  return ["", "[features]", "shell_tool = false"]
}

/** Codex drops a role whose `developer_instructions` is blank, so it is refused here instead. */
function refuseBlankInstructions(name: string, body: string): void {
  if (body.trim() !== "") return
  throw new Error(
    `Cannot write a Codex agent role for "${name}": its compiled body is empty, and Codex refuses a blank developer_instructions.`
  )
}

/**
 * The codepoints TOML refuses raw in a string, tab and newline excepted. Read off the codepoint
 * because a regex would need control characters in a class (`no-control-regex`). `0x7f` is DEL.
 */
function isForbiddenRaw(codepoint: number): boolean {
  if (codepoint === 0x7f) return true
  if (codepoint <= 0x08) return true
  return codepoint >= 0x0b && codepoint <= 0x1f
}

/** A run of three or more quotes: the closing delimiter, wherever it appears in the prose. */
const A_CLOSING_DELIMITER = /"{3,}/g

const EVERY_BACKSLASH = /\\/g
const EVERY_QUOTE = /"/g

/** Every backslash doubled: a trailing one is TOML's line continuation and would eat a newline. */
function escapeBackslashes(text: string): string {
  return text.replace(EVERY_BACKSLASH, "\\\\")
}

/** Any run of quotes long enough to close the string, broken by escaping each quote in it. */
function escapeClosingDelimiters(text: string): string {
  return text.replace(A_CLOSING_DELIMITER, (quotes) =>
    quotes.replace(EVERY_QUOTE, '\\"')
  )
}

/** The rest, as `\uXXXX` — which TOML accepts in both string forms. */
function escapeControlCharacters(text: string): string {
  return [...text].map(escapedWhereTomlRefusesItRaw).join("")
}

/** One character: itself, or its `\uXXXX` escape where TOML will not take it raw. */
function escapedWhereTomlRefusesItRaw(character: string): string {
  const codepoint = character.charCodeAt(0)
  if (!isForbiddenRaw(codepoint)) return character

  return `\\u${codepoint.toString(16).padStart(4, "0")}`
}

/** A one-line TOML basic string: every escape TOML defines, and nothing left to interpretation. */
function basicString(value: string): string {
  const literalBackslashes = escapeBackslashes(value)
  const literalQuotes = literalBackslashes.replace(EVERY_QUOTE, '\\"')
  const onOneLine = literalQuotes.replace(/\n/g, "\\n").replace(/\t/g, "\\t")

  return `"${escapeControlCharacters(onOneLine)}"`
}

/**
 * The compiled prose as the inside of a multi-line basic string, so the markdown stays readable.
 * Only what would end the string early or change its meaning is escaped.
 */
function asMultilineString(body: string): string {
  const literalBackslashes = escapeBackslashes(body)
  const safeDelimiters = escapeClosingDelimiters(literalBackslashes)

  return escapeControlCharacters(safeDelimiters)
}
