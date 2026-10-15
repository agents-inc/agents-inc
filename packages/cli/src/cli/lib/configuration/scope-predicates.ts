/**
 * The scope predicates live in `@workspace/compile` because the emitters moved there — the
 * `SelectedAgentName` and `ProjectAgentName` unions an emitted `config-types.ts` carries are
 * derived with `activeAgentNames` and `activeProjectAgentNames`, and the scope split a config
 * write performs is derived with `isActiveAt`. Re-exported here so no CLI call site moved.
 */
export {
  activeAgentNames,
  activeAgentScopeMap,
  activeProjectAgentNames,
  activeSkillScopeMap,
  effectivelyExcludedSkillIds,
  isActiveAt,
  isGlobalTombstone,
  isProjectOwned,
  type ScopedEntry,
} from "@workspace/compile";
