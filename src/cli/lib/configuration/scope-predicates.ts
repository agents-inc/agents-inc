import type { AgentName, SkillId } from "../../types/index.js";
import type { AgentScopeConfig, SkillConfig } from "../../types/config.js";

/** Shared shape of scoped config entries (skills and agents). */
type ScopedEntry = { scope?: string; excluded?: boolean };

/** Active (non-excluded) entry at the given scope. */
export function isActiveAt(entry: ScopedEntry, scope: "project" | "global"): boolean {
  return entry.scope === scope && !entry.excluded;
}

/** Tombstone masking a global install (`scope === "global"` + excluded). */
export function isGlobalTombstone(entry: ScopedEntry): boolean {
  return entry.scope === "global" && !!entry.excluded;
}

/**
 * Entry the project owns: a project-scoped entry, or the project's own global
 * tombstone. Inherited global-active entries belong to the global config.
 */
export function isProjectOwned(entry: ScopedEntry): boolean {
  return entry.scope === "project" || isGlobalTombstone(entry);
}

/** Names of active project-scoped agents. */
export function activeProjectAgentNames(agents: readonly AgentScopeConfig[]): AgentName[] {
  return agents.filter((a) => isActiveAt(a, "project")).map((a) => a.name);
}

/** Scope of each active (non-excluded) skill, keyed by id. */
export function activeSkillScopeMap(
  skills: readonly SkillConfig[] | undefined,
): Map<SkillId, "project" | "global"> {
  return new Map((skills ?? []).filter((s) => !s.excluded).map((s) => [s.id, s.scope]));
}

/** Scope of each active (non-excluded) agent, keyed by name. */
export function activeAgentScopeMap(
  agents: readonly AgentScopeConfig[] | undefined,
): Map<AgentName, "project" | "global"> {
  return new Map((agents ?? []).filter((a) => !a.excluded).map((a) => [a.name, a.scope]));
}
