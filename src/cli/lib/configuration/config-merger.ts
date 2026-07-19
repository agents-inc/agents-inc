import { indexBy, uniqueBy } from "remeda";

import type { ProjectConfig, SkillId } from "../../types";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";
import { loadProjectConfig } from "./project-config";
import { loadProjectSourceConfig } from "./config";
import { isGlobalTombstone, isProjectOwned } from "./scope-predicates";

/**
 * How authoritative `newConfig` is over entries absent from it (D-233 Scenario C):
 *  - `"all"`  — global-context EDIT at ~/: the wizard loaded the ENTIRE global config, so any
 *               absent agent/skill was removed. Every existing entry is in scope.
 *  - `"owned"` — project-context EDIT: the wizard loaded the full project roster and owns only
 *               PROJECT-OWNED entries (project-scoped + the project's own global tombstones).
 *               Inherited global-active entries are read-only and are always preserved.
 *  - `undefined` — init / non-edit merges: additive union-preserve (never drop absent entries).
 */
export type AuthoritativeScope = "all" | "owned";

export type MergeContext = {
  projectDir: string;
  authoritativeScope?: AuthoritativeScope;
  /**
   * Skill ids the wizard could NOT resolve against the loaded source matrix this session
   * (D-233 Scenario C). An existing config entry whose id is in this set must always be preserved:
   * the wizard never offered a choice about it, so its absence from `newConfig` is not a
   * deselection and must not be dropped by `authoritativeScope`.
   */
  unresolvableSkillIds?: readonly SkillId[];
};

export type MergeResult = {
  config: ProjectConfig;
  merged: boolean;
  existingConfigPath?: string;
};

/**
 * Compound identity key for an agent entry. Includes scope and the excluded
 * discriminator so that `{name, scope:"project"}` and `{name, scope:"global"}`
 * (and their tombstone variants) are treated as distinct entries rather than
 * collapsed onto `name` alone (D-221).
 */
const agentKey = (a: AgentScopeConfig): string =>
  `${a.name}:${a.scope}${a.excluded ? ":excluded" : ""}`;

/**
 * Compound identity key for a skill entry. Same shape as {@link agentKey}:
 * `id:scope` for actives, `id:scope:excluded` for tombstones. Prevents the
 * D-221 class of bugs where two distinct-scope entries collide onto `id`.
 */
const skillKey = (s: SkillConfig): string => `${s.id}:${s.scope}${s.excluded ? ":excluded" : ""}`;

/** Names of agents carrying a global tombstone — i.e. dual-scope entries the project owns. */
function agentTombstoneNames(agents: AgentScopeConfig[]): Set<string> {
  return new Set(agents.filter(isGlobalTombstone).map((a) => a.name));
}

/** Ids of skills carrying a global tombstone — i.e. dual-scope entries the project owns. */
function skillTombstoneIds(skills: SkillConfig[]): Set<string> {
  return new Set(skills.filter(isGlobalTombstone).map((s) => s.id));
}

/**
 * True when an existing entry is within the current edit session's authority, so its absence
 * from `newConfig` means a deliberate removal (drop) rather than an untouched entry (preserve).
 *
 * `"all"` (global edit): every entry is owned. `"owned"` (project edit): only project-scoped
 * entries and the project's own global tombstones — inherited global-active entries belong to
 * the global config and must never be dropped from a project edit.
 */
function isWithinSessionAuthority(
  entry: { scope?: string; excluded?: boolean },
  scope: AuthoritativeScope,
): boolean {
  if (scope === "all") return true;
  return isProjectOwned(entry);
}

/**
 * Pure merge logic: existing values take precedence for identity fields;
 * agents and skills are merged so that `newConfig` is authoritative for every
 * `name`/`id` it references. Existing entries survive in-place when their
 * compound key matches a new entry (same name, scope, excluded). Existing
 * entries whose NAME/ID appears in new but whose compound key does NOT match
 * a new entry are dropped — this is how scope migrations (P→G, G→P) remove
 * stale rows and how P→G tombstone removal is honored. Existing entries whose
 * name/ID is absent from new are preserved unchanged — EXCEPT names/ids the
 * project owned as dual-scope this session (they carry a global tombstone in the
 * existing config): when new carries nothing for such a name, the user fully
 * deselected the dual-scope row, so both the lingering active project entry and
 * the stale tombstone are dropped together (D-233 Scenario B full-deselect).
 *
 * A final compound-key dedup (keeping first occurrence, which in our concat
 * order is the existing-derived or first-new entry) collapses any pre-existing
 * on-disk corruption rather than carrying multiplied duplicates forward.
 *
 * Dual-scope semantics (active at one scope + excluded tombstone at another)
 * are preserved because `newConfig.agents`/`newConfig.skills` carry BOTH
 * entries for the same name/id when that dual state is legitimate (wizard
 * output from `generateProjectConfigFromSkills` + `toggleAgentScope`).
 *
 * D-221 root cause (fixed here): the prior name-only key collapsed
 * distinct-scope entries, and the positional `.map()` over existing rewrote
 * every collision slot — multiplying pre-existing duplicates and failing to
 * drop stale rows on scope migration.
 *
 * `authoritativeScope` (D-233 Scenario C): a full `cc edit` pass presents the complete roster
 * the wizard could edit, so an entry within that authority which is absent from `newConfig` was
 * deliberately removed and must be dropped (even a plain active entry with no tombstone), rather
 * than union-preserved. `"all"` (global edit) covers every entry; `"owned"` (project edit) covers
 * only project-scoped entries and the project's own global tombstones — inherited global-active
 * entries are always preserved. `undefined` (init) keeps additive union-preserve.
 *
 * `unresolvableSkillIds` narrows the authoritative drop: a skill id the wizard could not resolve
 * from the loaded source this session is exempt and always preserved, because the wizard had no way
 * to offer a choice about it, so its absence is not a deselection (D-233 Scenario C data-loss guard).
 */
type MergeOptions = Pick<MergeContext, "authoritativeScope" | "unresolvableSkillIds">;

export function mergeConfigs(
  newConfig: ProjectConfig,
  existingConfig: ProjectConfig,
  options?: MergeOptions,
): ProjectConfig {
  const merged = { ...newConfig };
  const unresolvableSkillIds = new Set(options?.unresolvableSkillIds ?? []);

  if (existingConfig.name) {
    merged.name = existingConfig.name;
  }

  if (existingConfig.description) {
    merged.description = existingConfig.description;
  }

  if (existingConfig.source && !newConfig.source) {
    merged.source = existingConfig.source;
  }

  if (existingConfig.agents && existingConfig.agents.length > 0) {
    const newAgentsByKey = indexBy(merged.agents, agentKey);
    const newAgentNames = new Set(merged.agents.map((a) => a.name));
    const existingKeys = new Set(existingConfig.agents.map(agentKey));
    // Names the project managed as dual-scope this session: a global tombstone in the
    // existing config marks an agent whose global install the project actively overrode.
    // When newConfig carries NO entry for such a name, the user fully deselected the
    // dual-scope row — both the lingering active project entry and the stale tombstone
    // must drop together, not be preserved (D-233 Scenario B full-deselect).
    const dualScopeAgentNames = agentTombstoneNames(existingConfig.agents);
    const updatedExisting = existingConfig.agents.flatMap((existing) => {
      const matching = newAgentsByKey[agentKey(existing)];
      if (matching) return [matching];
      // Name is actively managed by newConfig but this exact (scope, excluded)
      // slot is NOT in new → the wizard intentionally dropped this row
      // (scope migration or tombstone cleanup). Drop it.
      if (newAgentNames.has(existing.name)) return [];
      if (dualScopeAgentNames.has(existing.name)) return [];
      // Authoritative edit: an in-authority agent absent from newConfig (even a plain active
      // one with no tombstone) was deselected and must be dropped (D-233 Scenario C).
      if (
        options?.authoritativeScope &&
        isWithinSessionAuthority(existing, options.authoritativeScope)
      )
        return [];
      return [existing];
    });
    const addedAgents = merged.agents.filter((a) => !existingKeys.has(agentKey(a)));
    merged.agents = uniqueBy([...updatedExisting, ...addedAgents], agentKey);
  } else {
    merged.agents = uniqueBy(merged.agents, agentKey);
  }

  if (existingConfig.skills && existingConfig.skills.length > 0) {
    const newSkillsByKey = indexBy(merged.skills, skillKey);
    const newSkillIds = new Set(merged.skills.map((s) => s.id));
    const existingKeys = new Set(existingConfig.skills.map(skillKey));
    // Skill-side twin of dualScopeAgentNames — see the agent branch above (D-233).
    const dualScopeSkillIds = skillTombstoneIds(existingConfig.skills);
    const updatedExisting = existingConfig.skills.flatMap((existing) => {
      const matching = newSkillsByKey[skillKey(existing)];
      if (matching) return [matching];
      if (newSkillIds.has(existing.id)) return [];
      if (dualScopeSkillIds.has(existing.id)) return [];
      // Skill-side twin — see the agent branch above (D-233 Scenario C).
      // A skill the wizard could not resolve from the loaded source this session is exempt from
      // the authoritative drop: its absence from newConfig is a resolution gap, not a deselection,
      // so it must always be preserved (D-233 Scenario C data-loss guard).
      if (
        options?.authoritativeScope &&
        isWithinSessionAuthority(existing, options.authoritativeScope) &&
        !unresolvableSkillIds.has(existing.id)
      )
        return [];
      return [existing];
    });
    const addedSkills = merged.skills.filter((s) => !existingKeys.has(skillKey(s)));
    merged.skills = uniqueBy([...updatedExisting, ...addedSkills], skillKey);
  } else {
    merged.skills = uniqueBy(merged.skills, skillKey);
  }

  // Stack is the pure output of the mutator — trust newConfig.stack whenever it
  // is defined. Only fall back to existingConfig.stack when the new config has
  // none (preserves existing during non-stack-touching operations).
  if (newConfig.stack === undefined && existingConfig.stack) {
    merged.stack = existingConfig.stack;
  }

  if (existingConfig.author) {
    merged.author = existingConfig.author;
  }

  if (existingConfig.agentsSource) {
    merged.agentsSource = existingConfig.agentsSource;
  }

  if (existingConfig.marketplace) {
    merged.marketplace = existingConfig.marketplace;
  }

  // Preserve the registered project paths from the existing (global) config — the wizard
  // result never carries them, and losing them silently disables propagation of global
  // changes to registered projects (D-233 Scenario C: the tombstone reconcile never runs).
  if (existingConfig.projects && !newConfig.projects) {
    merged.projects = existingConfig.projects;
  }

  return merged;
}

export async function mergeWithExistingConfig(
  newConfig: ProjectConfig,
  context: MergeContext,
): Promise<MergeResult> {
  const existingFullConfig = await loadProjectConfig(context.projectDir);
  if (existingFullConfig) {
    // A full `cc edit` pass loads the complete roster, so newConfig is authoritative over the
    // entries it owns — every entry for a global edit (`"all"`), or project-owned entries for a
    // project edit (`"owned"`). Absent owned entries were deselected and are dropped rather than
    // union-preserved (D-233 Scenario C). Init leaves the scope undefined (additive union).
    const config = mergeConfigs(newConfig, existingFullConfig.config, {
      authoritativeScope: context.authoritativeScope,
      unresolvableSkillIds: context.unresolvableSkillIds,
    });

    return {
      config,
      merged: true,
      existingConfigPath: existingFullConfig.configPath,
    };
  }

  // No existing full config, try simple project source config for author/agentsSource
  const localConfig = { ...newConfig };
  const existingProjectConfig = await loadProjectSourceConfig(context.projectDir);
  if (existingProjectConfig?.author) {
    localConfig.author = existingProjectConfig.author;
  }
  if (existingProjectConfig?.agentsSource) {
    localConfig.agentsSource = existingProjectConfig.agentsSource;
  }

  return { config: localConfig, merged: false };
}
