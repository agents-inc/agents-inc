import type { AgentConfig, EffortLevel } from "../../types.js"

/**
 * Codex's deserializer drops a whole role file for one unlisted key, so only accepted keys are
 * written; fields with no Codex expression are reported once by `./roster`.
 */

export const CODEX_REQUIRED_ROLE_KEYS = [
  "name",
  "description",
  "developer_instructions",
] as const

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

/** `body` is the frontmatter-free render and becomes `developer_instructions` whole. */
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

/** `effort = "high"` drops the file; this key registers. */
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

// `agent.model` is a Claude selector and is never written: Codex cannot spawn a role naming one.
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

/** TOML discards the opening delimiter's own newline. */
function developerInstructions(body: string): string {
  return `${CODEX_DEVELOPER_INSTRUCTIONS_OPENER}\n${asMultilineString(body)}\n"""`
}

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

// Read off the codepoint: a regex would need control characters in a class (`no-control-regex`).
function isForbiddenRaw(codepoint: number): boolean {
  if (codepoint === 0x7f) return true
  if (codepoint <= 0x08) return true
  return codepoint >= 0x0b && codepoint <= 0x1f
}

const A_CLOSING_DELIMITER = /"{3,}/g

const EVERY_BACKSLASH = /\\/g
const EVERY_QUOTE = /"/g

/** A trailing backslash is TOML's line continuation and would eat a newline. */
function escapeBackslashes(text: string): string {
  return text.replace(EVERY_BACKSLASH, "\\\\")
}

function escapeClosingDelimiters(text: string): string {
  return text.replace(A_CLOSING_DELIMITER, (quotes) =>
    quotes.replace(EVERY_QUOTE, '\\"')
  )
}

function escapeControlCharacters(text: string): string {
  return [...text].map(escapedWhereTomlRefusesItRaw).join("")
}

function escapedWhereTomlRefusesItRaw(character: string): string {
  const codepoint = character.charCodeAt(0)
  if (!isForbiddenRaw(codepoint)) return character

  return `\\u${codepoint.toString(16).padStart(4, "0")}`
}

function basicString(value: string): string {
  const literalBackslashes = escapeBackslashes(value)
  const literalQuotes = literalBackslashes.replace(EVERY_QUOTE, '\\"')
  const onOneLine = literalQuotes.replace(/\n/g, "\\n").replace(/\t/g, "\\t")

  return `"${escapeControlCharacters(onOneLine)}"`
}

/** Escapes only what would end the string early, so the markdown stays readable. */
function asMultilineString(body: string): string {
  const literalBackslashes = escapeBackslashes(body)
  const safeDelimiters = escapeClosingDelimiters(literalBackslashes)

  return escapeControlCharacters(safeDelimiters)
}
