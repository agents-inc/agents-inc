import { AGENT_NAMES } from "@workspace/matrix"

import { inAnEnglishList } from "../../string.js"
import type { AgentName } from "../../types.js"

/**
 * Which sub-agents a Codex installation compiles, and the two lines a Codex compile prints once
 * about what it did not do: which sub-agents are absent, and which settings of the present ones
 * have no Codex expression. Kept apart so a user can tell whether their reviewer exists.
 */

/**
 * Left out of every Codex install for v1 because their roster mechanics on Codex are not proven.
 * Not a capability claim: both compile as roles.
 */
export const AGENTS_NOT_ON_CODEX = [
  "agent-summoner",
  "skill-summoner",
] as const satisfies readonly AgentName[]

const leftOut: ReadonlySet<AgentName> = new Set(AGENTS_NOT_ON_CODEX)

export function compilesForCodex(agent: AgentName): boolean {
  return !leftOut.has(agent)
}

export const CODEX_AGENT_ROSTER: readonly AgentName[] =
  AGENT_NAMES.filter(compilesForCodex)

/**
 * What a Codex role file cannot express, as the compile line names them. A Claude model never
 * reaches a role — Codex refuses to spawn one naming it — so a role runs on its `codexModel` pin,
 * or on the session's model. The other five were measured against the pinned binary's
 * deserializer, and are reported because a user-authored agent setting one would otherwise lose it
 * in silence.
 */
export const UNEXPRESSIBLE_ON_CODEX = [
  "Claude models",
  "tool allowlists",
  "permissionMode",
  "isolation",
  "experimental",
  "preloaded skills",
] as const

export function agentsLeftOutOfCodexMessage(): string {
  return (
    `Codex compiles ${CODEX_AGENT_ROSTER.length} of the ${AGENT_NAMES.length} sub-agents: ` +
    `${inAnEnglishList(AGENTS_NOT_ON_CODEX)} are left out for v1, because their roster ` +
    `mechanics on Codex are not proven.`
  )
}

export function unexpressibleOnCodexMessage(): string {
  return (
    `Codex cannot express ${inAnEnglishList(UNEXPRESSIBLE_ON_CODEX)}, ` +
    `so the agent role files it wrote carry none of them.`
  )
}
