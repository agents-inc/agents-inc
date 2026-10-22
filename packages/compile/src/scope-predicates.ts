import type {
  AgentName,
  AgentScopeConfig,
  SkillConfig,
  SkillId,
  SkillScope,
} from "./types.js"

export type ScopedEntry = { scope?: SkillScope; excluded?: boolean }

export function isActiveAt(entry: ScopedEntry, scope: SkillScope): boolean {
  return entry.scope === scope && !entry.excluded
}

/** Tombstone masking a global install. */
export function isGlobalTombstone(entry: ScopedEntry): boolean {
  return entry.scope === "global" && !!entry.excluded
}

export function isProjectOwned(entry: ScopedEntry): boolean {
  return entry.scope === "project" || isGlobalTombstone(entry)
}

export function activeProjectAgentNames(
  agents: readonly AgentScopeConfig[]
): AgentName[] {
  return agents.filter((a) => isActiveAt(a, "project")).map((a) => a.name)
}

/** Exported so the emitted `SelectedAgentName` union derives the same set from the same rows. */
export function activeAgentNames(
  agents: readonly AgentScopeConfig[]
): AgentName[] {
  return agents.filter((a) => !a.excluded).map((a) => a.name)
}

export function activeSkillScopeMap(
  skills: readonly SkillConfig[] | undefined
): Map<SkillId, SkillScope> {
  return new Map(
    (skills ?? []).filter((s) => !s.excluded).map((s) => [s.id, s.scope])
  )
}

export function activeAgentScopeMap(
  agents: readonly AgentScopeConfig[] | undefined
): Map<AgentName, SkillScope> {
  return new Map(
    (agents ?? []).filter((a) => !a.excluded).map((a) => [a.name, a.scope])
  )
}

/** Excluded with no active entry of the same id rescuing them. */
export function effectivelyExcludedSkillIds(
  skills: readonly SkillConfig[]
): Set<SkillId> {
  const activeIds = new Set(skills.filter((s) => !s.excluded).map((s) => s.id))
  return new Set(
    skills.filter((s) => s.excluded && !activeIds.has(s.id)).map((s) => s.id)
  )
}
