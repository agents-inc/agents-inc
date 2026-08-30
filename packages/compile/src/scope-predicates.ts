import type {
  AgentName,
  AgentScopeConfig,
  SkillConfig,
  SkillId,
  SkillScope,
} from "./types.js"

/** Shared shape of scoped config entries (skills and agents). */
export type ScopedEntry = { scope?: SkillScope; excluded?: boolean }

/** Active (non-excluded) entry at the given scope. */
export function isActiveAt(entry: ScopedEntry, scope: SkillScope): boolean {
  return entry.scope === scope && !entry.excluded
}

/** Tombstone masking a global install (`scope === "global"` + excluded). */
export function isGlobalTombstone(entry: ScopedEntry): boolean {
  return entry.scope === "global" && !!entry.excluded
}

/**
 * Entry the project owns: a project-scoped entry, or the project's own global
 * tombstone. Inherited global-active entries belong to the global config.
 */
export function isProjectOwned(entry: ScopedEntry): boolean {
  return entry.scope === "project" || isGlobalTombstone(entry)
}

/** Names of active project-scoped agents. */
export function activeProjectAgentNames(
  agents: readonly AgentScopeConfig[]
): AgentName[] {
  return agents.filter((a) => isActiveAt(a, "project")).map((a) => a.name)
}

/**
 * Names of every active (non-excluded) agent, at either scope — the config's own
 * record of who is selected, now that no flat `selectedAgents` list is persisted.
 * Exported ahead of a second caller by the key-builder exception: the emitted
 * `SelectedAgentName` union and the wizard's agent hydration must derive the same
 * set from the same rows, and two surfaces each writing their own filter is the
 * drift this replaces.
 */
export function activeAgentNames(
  agents: readonly AgentScopeConfig[]
): AgentName[] {
  return agents.filter((a) => !a.excluded).map((a) => a.name)
}

/** Scope of each active (non-excluded) skill, keyed by id. */
export function activeSkillScopeMap(
  skills: readonly SkillConfig[] | undefined
): Map<SkillId, SkillScope> {
  return new Map(
    (skills ?? []).filter((s) => !s.excluded).map((s) => [s.id, s.scope])
  )
}

/** Scope of each active (non-excluded) agent, keyed by name. */
export function activeAgentScopeMap(
  agents: readonly AgentScopeConfig[] | undefined
): Map<AgentName, SkillScope> {
  return new Map(
    (agents ?? []).filter((a) => !a.excluded).map((a) => [a.name, a.scope])
  )
}

/**
 * Ids of skills that are effectively excluded: they have an excluded entry and no
 * active (non-excluded) entry with the same id rescues them. A skill with an
 * excluded global entry AND an active project entry is NOT effectively excluded.
 */
export function effectivelyExcludedSkillIds(
  skills: readonly SkillConfig[]
): Set<SkillId> {
  const activeIds = new Set(skills.filter((s) => !s.excluded).map((s) => s.id))
  return new Set(
    skills.filter((s) => s.excluded && !activeIds.has(s.id)).map((s) => s.id)
  )
}
