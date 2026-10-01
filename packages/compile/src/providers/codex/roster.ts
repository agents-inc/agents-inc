import { AGENT_NAMES } from "@workspace/matrix"

import type { AgentName } from "../../types.js"

/**
 * Which sub-agents a Codex installation compiles, and the two sentences a Codex compile owes the
 * user about what it did NOT do.
 *
 * **Two sentences, and they never merge.** One says which sub-agents are ABSENT from this
 * provider; the other says which SETTINGS of the sub-agents that ARE here have no Codex
 * expression. Folded into one "here is what we dropped" line, a user cannot tell whether their
 * reviewer exists.
 *
 * **Each is one line, printed once per compile.** All seventeen shipped stacks list both
 * summoners and every Codex install drops them, so once per stack would be seventeen lines of one
 * fact on every install, and once per sub-agent would be thirty-two lines of the other across two
 * scopes.
 */

/**
 * The two sub-agents left out of every Codex install for v1, by the owner's ruling.
 *
 * **The recorded reason, which is not the one this file carried until 2026-09-22:** left out for
 * v1 — their roster mechanics on Codex are not proven. It is D8 of
 * `todo/plans/CLI-codex-provider-plan.md`, written down in that form precisely so nobody reopens
 * the ruling by "fixing" a reason that does not hold.
 *
 * Not a capability claim: both compile perfectly well as role files. The sentence that stood here
 * said they author Claude Code skills and sub-agents "which this provider has no equivalent of",
 * and the same output contradicts it in the same breath — the line opens by saying Codex compiles
 * sixteen of the eighteen SUB-AGENTS, and `skills = { enabled = true }` is a key a Codex role file
 * takes.
 */
export const AGENTS_NOT_ON_CODEX = [
  "agent-summoner",
  "skill-summoner",
] as const satisfies readonly AgentName[]

const leftOut: ReadonlySet<AgentName> = new Set(AGENTS_NOT_ON_CODEX)

/** Whether this sub-agent is compiled onto Codex at all. */
export function compilesForCodex(agent: AgentName): boolean {
  return !leftOut.has(agent)
}

/**
 * The sub-agents a Codex installation DOES compile: the shipped roster minus the two above.
 *
 * Derived rather than spelled out, so a nineteenth sub-agent is on Codex the day it ships and the
 * decision to leave one out is made in exactly one place. `roster.test.ts` holds the sixteen
 * members as its own literal — an expectation derived from the mapping it checks would agree with
 * that mapping however either changes.
 */
export const CODEX_AGENT_ROSTER: readonly AgentName[] =
  AGENT_NAMES.filter(compilesForCodex)

/**
 * The six things a Codex agent role file has no way to express, spelled as the compile line names
 * them.
 *
 * **A Claude model** is the one found on a real subscription rather than by the rig: every model
 * this product can name is Claude's, and Codex refuses to spawn a role naming one (codex-cli
 * 0.157.1, 2026-09-26 — `agent-role-toml.ts` `scalarLines` carries the measurement). So the role
 * runs on the session's model, and this line is what tells the user their per-agent model did not
 * travel. Unlike the four below it, EVERY shipped sub-agent declares one.
 *
 * The other five were each measured against the pinned binary's deserializer rather than read off
 * its documentation:
 * `tools` is a configuration struct and not an allowlist, so the read-only sub-agents can still
 * edit files on Codex; `permissionMode`, `isolation` and `experimental` are each an `unknown
 * field` that drops the whole file; and `skills` on a role is a bundled-skills toggle
 * (`{ enabled = true }`) rather than a list of skills to preload.
 *
 * Four of the five are absent from every shipped definition, which is exactly why they are
 * REPORTED rather than quietly not emitted: a user-authored agent setting one would otherwise
 * lose it in silence.
 */
export const UNEXPRESSIBLE_ON_CODEX = [
  "Claude models",
  "tool allowlists",
  "permissionMode",
  "isolation",
  "experimental",
  "preloaded skills",
] as const

/**
 * The line naming the sub-agents this provider does not get, and why.
 *
 * The reason is {@link AGENTS_NOT_ON_CODEX}'s recorded one, stated as a v1 scope decision rather
 * than as a claim about what Codex has — a sentence opening "Codex compiles 16 of the 18
 * sub-agents" cannot also say this provider has no sub-agents.
 */
export function agentsLeftOutOfCodexMessage(): string {
  return (
    `Codex compiles ${CODEX_AGENT_ROSTER.length} of the ${AGENT_NAMES.length} sub-agents: ` +
    `${inAnEnglishList(AGENTS_NOT_ON_CODEX)} are left out for v1, because their roster ` +
    `mechanics on Codex are not proven.`
  )
}

/** The line naming the settings a role file cannot carry, whatever the configuration asked for. */
export function unexpressibleOnCodexMessage(): string {
  return (
    `Codex cannot express ${inAnEnglishList(UNEXPRESSIBLE_ON_CODEX)}, ` +
    `so the agent role files it wrote carry none of them.`
  )
}

/**
 * `a, b and c` — built from the constant rather than restated beside it, which is what makes
 * "names every one of them, exactly once" a property of the roster instead of a sentence somebody
 * kept in step by hand.
 */
function inAnEnglishList(items: readonly string[]): string {
  const last = items.at(-1)
  if (last === undefined) return ""
  if (items.length === 1) return last

  return `${items.slice(0, -1).join(", ")} and ${last}`
}
