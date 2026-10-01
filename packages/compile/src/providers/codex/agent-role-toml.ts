import type { AgentConfig } from "../../types.js"

/**
 * One compiled sub-agent as a Codex **agent role definition** file.
 *
 * **The deserializer is strict and the failure is silent, which decides everything below.** Codex
 * 0.155.1 parses `$CODEX_HOME/agents/<file>.toml` and `<project>/.codex/agents/<file>.toml` at
 * startup, and ONE unlisted key drops the WHOLE file — reported as a startup warning nothing in a
 * normal run shows. So an over-generous renderer does not produce a slightly-wrong sub-agent, it
 * produces sixteen sub-agents that do not exist. Every key here was measured against the pinned
 * binary, 2026-09-22, each run under its own `HOME` and `CODEX_HOME` with the global `config.toml`
 * deleted first:
 *
 *     # accepted, no startup warning (`model` is accepted and still never written — see
 *     # `scalarLines`: every value this product has for it is a Claude model)
 *     name / description / developer_instructions / model / model_reasoning_effort /
 *     sandbox_mode / approval_policy / instructions / [[hooks.pre_tool_use]] /
 *     [features] shell_tool / skills = { enabled = true }
 *
 *     # rejected — "unknown field `<key>`", and the whole file goes
 *     reasoning_effort, effort, disallowed_tools, permissionMode, isolation, experimental,
 *     and anything unlisted;  tools = [...] and skills = ["a"] fail on their VALUE's shape
 *
 * **A frontmatter field with no Codex expression is omitted, never guessed at.** The compile says
 * once what it could not carry — see `./roster` — because an omission nobody is told about is a
 * sub-agent whose permission mode or preloaded skills silently stopped applying.
 *
 * **One field is translated rather than omitted, and exactly one.** `effort` has no Codex key of
 * that name and every value of it has a Codex home, so it travels as `model_reasoning_effort` —
 * see {@link CODEX_EFFORT_KEY} for the measurement and for what the measurement does not cover.
 * Dropping it silently lost the per-agent tuning a shared configuration expresses.
 *
 * **The TOML is written here rather than through a library.** The emitted surface is four scalars
 * and one table, and this package declares no TOML dependency; `agent-role-toml.test.ts` parses
 * every rendered file back with `smol-toml` and compares, so the encoding is held against a real
 * parser rather than against this file's own idea of one.
 */

/**
 * What a role file must carry, or Codex drops it whole.
 *
 * Exported so one place says what they are: the renderer emits them unconditionally and the spec
 * checks the rendered file against this roster by MEMBER, which a count could not do.
 */
export const CODEX_REQUIRED_ROLE_KEYS = [
  "name",
  "description",
  "developer_instructions",
] as const

/**
 * The keys that cost the whole file, each measured as its own one-key role against the pinned
 * binary.
 *
 * Two vocabularies on purpose: `reasoning_effort`, `effort`, `disallowed_tools` and `tools` are
 * TOML keys a renderer might reasonably reach for, while `permissionMode`, `isolation` and
 * `experimental` are the Claude frontmatter fields that would arrive spelled exactly like that.
 * Both are `unknown field` to Codex, and both are absent from everything this module writes.
 */
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
 * One compiled sub-agent's role file.
 *
 * `body` is the frontmatter-free render — `renderAgentBody` in `../../agent-source.ts` — and it
 * becomes `developer_instructions` whole. The role id is the `name` key rather than the filename:
 * measured twice on 0.155.1, a role in `web-developer-role.toml` naming itself `web-developer`
 * reached the model's `spawn_agent` roster as `web-developer`, and one in `anything.toml` naming
 * itself `proj-role` reached it as `proj-role`.
 */
export function renderAgentRoleToml(agent: AgentConfig, body: string): string {
  refuseBlankInstructions(agent.name, body)

  return [
    ...scalarLines(agent, body),
    // Last, always: every bare key after a table header belongs to that table, so a scalar
    // emitted below `[features]` would become `features.model` and take the file with it.
    ...shellToolTable(agent),
  ].join("\n")
}

/**
 * The key and the multi-line delimiter, as one line.
 *
 * Exported because the provenance reader has to find the line the marker sits on and cannot
 * spell this a second time: `hasCodexRoleMarker` in `../../agent-source.ts` looks at the line
 * immediately after it. A writer and a reader with their own copies of a delimiter is how a file
 * this CLI wrote stops being recognisable as ours.
 */
export const CODEX_DEVELOPER_INSTRUCTIONS_OPENER = `developer_instructions = """`

/**
 * The Codex key an agent's `effort` travels under.
 *
 * **The key is refused and the VALUE is not, which is the whole of this mapping.** A role carrying
 * `effort = "high"` is dropped whole — `unknown field \`effort\``, the subject absent from
 * `spawn_agent`'s roster while a valid control beside it registers — and the same role carrying
 * `model_reasoning_effort = "high"` registers. Measured on the pinned 0.155.1, 2026-09-22, each
 * run under its own `HOME` and `CODEX_HOME` with the global `config.toml` deleted first.
 *
 * **Every level this product can express has a Codex counterpart**, so nothing is reported instead
 * of emitted: all five of `low medium high xhigh max` were put through that rig and every one
 * registered, and Codex's own effort vocabulary — `minimal low medium high xhigh max ultra`, read
 * off the pinned binary's interned variant list — is a superset of ours.
 *
 * **And it RESOLVES, which the offline rig could not settle**: the role deserializer takes the value
 * as a string and accepts one no vocabulary contains, so "registers" was never "resolves". On a
 * real subscription, codex-cli 0.157.1, 2026-09-26, a role carrying `model_reasoning_effort =
 * "high"` was spawned, and the session log recorded `reasoning_effort: high` for it.
 */
const CODEX_EFFORT_KEY = "model_reasoning_effort"

/**
 * The scalar keys, in the order a reader meets them: who this role is, then the whole prose.
 *
 * **`model` is NEVER written, whatever the agent declares.** Every model this product can name —
 * `MODEL_NAMES` in `@workspace/matrix`: `sonnet opus haiku fable inherit` — is a CLAUDE selector,
 * and Codex has none of them. `model = "opus"` parses and registers, which is all the offline rig
 * could see, and then the role cannot be spawned: measured on a real ChatGPT subscription,
 * codex-cli 0.157.1, 2026-09-26, every compiled sub-agent failed to start with `The 'opus' model is
 * not supported when using Codex with a ChatGPT account.` With the line absent, the same role ran
 * on the session's own model. So the role inherits the session's model, and `./roster` reports the
 * setting as one Codex cannot express. _(Until 2026-09-26 this function passed `model` through,
 * on the strength of "parses and registers [V]" — true, and not the question.)_
 *
 * `effort` is emitted only when the agent declares one, as {@link CODEX_EFFORT_KEY}; none of the
 * shipped sub-agents does. Nothing else on `AgentConfig` has a Codex expression at all.
 *
 * `body` arrives already carrying the provenance marker on its first line — `renderAgentBody`
 * stamps it, exactly as `renderAgent` does for a Claude agent — so nothing here inserts one and
 * there is no second place the marker can be written from.
 */
function scalarLines(agent: AgentConfig, body: string): string[] {
  return [
    `name = ${basicString(agent.name)}`,
    `description = ${basicString(agent.description)}`,
    ...(agent.effort === undefined
      ? []
      : [`${CODEX_EFFORT_KEY} = ${basicString(agent.effort)}`]),
    developerInstructions(body),
  ]
}

/** The prose, as a multi-line TOML string whose opening delimiter's own newline TOML discards. */
function developerInstructions(body: string): string {
  return `${CODEX_DEVELOPER_INSTRUCTIONS_OPENER}\n${asMultilineString(body)}\n"""`
}

/**
 * `[features] shell_tool = false` for an agent granted no Bash, and nothing at all otherwise.
 *
 * The one per-agent limit Codex can express, and today no SHIPPED agent reaches it: of the
 * eighteen definitions exactly one omits Bash — `skill-summoner` — and that is one of the two
 * Codex leaves out. It is rendered because a user-authored agent arrives through the same door.
 */
function shellToolTable(agent: AgentConfig): string[] {
  if (agent.tools.includes(SHELL_TOOL)) return []
  return ["", "[features]", "shell_tool = false"]
}

/**
 * A blank `developer_instructions` is refused rather than written.
 *
 * Codex answers an empty one with ``.developer_instructions cannot be blank`` and drops the file
 * [V], so writing it would trade a visible compile failure for a sub-agent that silently is not
 * there. The write path collects this as that agent's failure and reports it.
 */
function refuseBlankInstructions(name: string, body: string): void {
  if (body.trim() !== "") return
  throw new Error(
    `Cannot write a Codex agent role for "${name}": its compiled body is empty, and Codex refuses a blank developer_instructions.`
  )
}

/**
 * The codepoints TOML refuses RAW in a string, tab and newline excepted — a multi-line string
 * carries both, and a one-line one escapes them by name before this runs.
 *
 * Read off the codepoint rather than matched by a regular expression, which would have to spell
 * control characters into a character class — the construct `no-control-regex` exists to stop,
 * and which is unreadable besides. `0x7f` is DEL, which TOML groups with them.
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

/**
 * Every backslash doubled.
 *
 * The one escape that is never optional: a backslash at the end of a line is TOML's line
 * continuation, so an unescaped one would silently swallow the newline after it and glue two
 * paragraphs of a sub-agent's prompt together.
 */
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
 * The compiled prose as the inside of a multi-line basic string.
 *
 * Multi-line rather than one escaped line because a user opens this file: the markdown stays
 * readable and its newlines and tabs stay newlines and tabs. What has to be escaped is only what
 * would end the string early or change its meaning — see the two helpers above.
 */
function asMultilineString(body: string): string {
  const literalBackslashes = escapeBackslashes(body)
  const safeDelimiters = escapeClosingDelimiters(literalBackslashes)

  return escapeControlCharacters(safeDelimiters)
}
