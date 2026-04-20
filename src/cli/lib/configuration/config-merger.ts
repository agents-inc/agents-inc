import { indexBy, uniqueBy } from "remeda";

import type { ProjectConfig } from "../../types";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";
import { loadProjectConfig } from "./project-config";
import { loadProjectSourceConfig } from "./config";

export type MergeContext = {
  projectDir: string;
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

/**
 * Pure merge logic: existing values take precedence for identity fields;
 * agents and skills are merged so that `newConfig` is authoritative for every
 * `name`/`id` it references. Existing entries survive in-place when their
 * compound key matches a new entry (same name, scope, excluded). Existing
 * entries whose NAME/ID appears in new but whose compound key does NOT match
 * a new entry are dropped — this is how scope migrations (P→G, G→P) remove
 * stale rows and how P→G tombstone removal is honored. Existing entries whose
 * name/ID is absent from new are preserved unchanged.
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
 */
export function mergeConfigs(
  newConfig: ProjectConfig,
  existingConfig: ProjectConfig,
): ProjectConfig {
  const merged = { ...newConfig };

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
    const updatedExisting = existingConfig.agents.flatMap((existing) => {
      const matching = newAgentsByKey[agentKey(existing)];
      if (matching) return [matching];
      // Name is actively managed by newConfig but this exact (scope, excluded)
      // slot is NOT in new → the wizard intentionally dropped this row
      // (scope migration or tombstone cleanup). Drop it.
      if (newAgentNames.has(existing.name)) return [];
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
    const updatedExisting = existingConfig.skills.flatMap((existing) => {
      const matching = newSkillsByKey[skillKey(existing)];
      if (matching) return [matching];
      if (newSkillIds.has(existing.id)) return [];
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

  return merged;
}

export async function mergeWithExistingConfig(
  newConfig: ProjectConfig,
  context: MergeContext,
): Promise<MergeResult> {
  const existingFullConfig = await loadProjectConfig(context.projectDir);
  if (existingFullConfig) {
    const config = mergeConfigs(newConfig, existingFullConfig.config);

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
