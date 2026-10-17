import { AGENT_NAMES } from "@workspace/matrix"

import { inAnEnglishList } from "../../string.js"
import type { AgentName } from "../../types.js"

// Two separate lines: absent sub-agents, and unexpressible settings of present ones.

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

/** Reported because a user-authored agent setting one would otherwise lose it silently. */
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
