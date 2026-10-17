import { indexBy, omit, pick, uniqueBy } from "remeda";
import { HAND_WRITTEN_FIELDS } from "@workspace/compile/config-source";

import type { ProjectConfig } from "../../types";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";
import { getProjectConfigPath } from "../installation/install-base-dir";
import { loadProjectConfig, type LoadedProjectConfig } from "./project-config";
import { loadProjectSourceConfig } from "./config";
import { isGlobalTombstone, isProjectOwned, type ScopedEntry } from "./scope-predicates";

/**
 * How authoritative `newConfig` is over absent entries: `"all"` (global edit) drops any; `"owned"`
 * (project edit) drops absent project-owned ones only; `undefined` (init) never drops.
 */
export type AuthoritativeScope = "all" | "owned";

export type MergeContext = {
  projectDir: string;
  authoritativeScope?: AuthoritativeScope;
};

export type MergeResult = {
  config: ProjectConfig;
  merged: boolean;
  existingConfigPath?: string;
};

/** Includes scope and the excluded flag, so scoped entries and tombstones stay distinct. */
const agentKey = (a: AgentScopeConfig): string =>
  `${a.name}:${a.scope}${a.excluded ? ":excluded" : ""}`;

/** Same shape as the agent key. */
const skillKey = (s: SkillConfig): string => `${s.id}:${s.scope}${s.excluded ? ":excluded" : ""}`;

/** How one roster's entries are told apart: the compound key, and the name or id it extends. */
type RosterIdentity<Entry> = {
  keyOf: (entry: Entry) => string;
  identityOf: (entry: Entry) => string;
};

const AGENT_IDENTITY: RosterIdentity<AgentScopeConfig> = {
  keyOf: agentKey,
  identityOf: (agent) => agent.name,
};

const SKILL_IDENTITY: RosterIdentity<SkillConfig> = {
  keyOf: skillKey,
  identityOf: (skill) => skill.id,
};

/** Project edits own project-scoped entries and their global tombstones, not inherited globals. */
function isWithinSessionAuthority(entry: ScopedEntry, scope: AuthoritativeScope): boolean {
  if (scope === "all") return true;
  return isProjectOwned(entry);
}

/**
 * Replaces entries by compound key; drops an entry whose name the incoming roster manages under
 * another key, a dual-scope entry the incoming roster dropped, or an absent in-authority one.
 */
function mergeRoster<Entry extends ScopedEntry>(
  incoming: Entry[],
  existing: Entry[],
  identity: RosterIdentity<Entry>,
  authoritativeScope: AuthoritativeScope | undefined,
): Entry[] {
  const incomingByKey = indexBy(incoming, identity.keyOf);
  const incomingIdentities = new Set(incoming.map(identity.identityOf));
  const existingKeys = new Set(existing.map(identity.keyOf));
  // A global tombstone marks a dual-scope entry; with nothing incoming for it, both rows drop.
  const dualScopeIdentities = new Set(existing.filter(isGlobalTombstone).map(identity.identityOf));

  const updatedExisting = existing.flatMap((entry) => {
    const matching = incomingByKey[identity.keyOf(entry)];
    if (matching !== undefined) return [matching];
    // The incoming roster manages this name under another key: the edit dropped this row.
    if (incomingIdentities.has(identity.identityOf(entry))) return [];
    if (dualScopeIdentities.has(identity.identityOf(entry))) return [];
    if (authoritativeScope && isWithinSessionAuthority(entry, authoritativeScope)) return [];
    return [entry];
  });
  const added = incoming.filter((entry) => !existingKeys.has(identity.keyOf(entry)));
  return uniqueBy([...updatedExisting, ...added], identity.keyOf);
}

type MergeOptions = Pick<MergeContext, "authoritativeScope">;

/**
 * Existing identity fields win; `newConfig` is authoritative for every name or id it references. A
 * final compound-key dedup collapses on-disk duplicates. A skill the run could not resolve is
 * removed like any other absent entry.
 */
export function mergeConfigs(
  newConfig: ProjectConfig,
  existingConfig: ProjectConfig,
  options?: MergeOptions,
): ProjectConfig {
  const merged = { ...newConfig };

  if (existingConfig.name) {
    merged.name = existingConfig.name;
  }

  if (existingConfig.description) {
    merged.description = existingConfig.description;
  }

  if (existingConfig.marketplace && !newConfig.marketplace) {
    merged.marketplace = existingConfig.marketplace;
  }

  merged.agents = mergeRoster(
    merged.agents,
    existingConfig.agents,
    AGENT_IDENTITY,
    options?.authoritativeScope,
  );
  merged.skills = mergeRoster(
    merged.skills,
    existingConfig.skills,
    SKILL_IDENTITY,
    options?.authoritativeScope,
  );

  // `{}` is a deliberate mutator output; only an undefined stack keeps the existing one.
  if (newConfig.stack === undefined && existingConfig.stack) {
    merged.stack = existingConfig.stack;
  }

  if (existingConfig.author) {
    merged.author = existingConfig.author;
  }

  if (existingConfig.agentsSource) {
    merged.agentsSource = existingConfig.agentsSource;
  }

  // The stored name labels the marketplace it was recorded beside.
  if (existingConfig.marketplaceName && merged.marketplace === existingConfig.marketplace) {
    merged.marketplaceName = existingConfig.marketplaceName;
  }

  // Hand-written fields have no other record, so a rewrite must keep them.
  Object.assign(merged, pick(existingConfig, HAND_WRITTEN_FIELDS));

  // The selection never carries registered projects; losing them silently stops propagation.
  if (existingConfig.projects && !newConfig.projects) {
    merged.projects = existingConfig.projects;
  }

  return merged;
}

/**
 * A config from the home fallback lends every field except its name and the hand-written fields.
 */
function existingConfigForMerge(
  loaded: LoadedProjectConfig,
  projectDir: string,
  ownName: string,
): ProjectConfig {
  // Compared against the same provider's path, or a project's own config reads as inherited.
  const isProjectsOwnFile = loaded.configPath === getProjectConfigPath(projectDir, loaded.provider);
  if (isProjectsOwnFile) return loaded.config;

  return { ...omit(loaded.config, HAND_WRITTEN_FIELDS), name: ownName };
}

export async function mergeWithExistingConfig(
  newConfig: ProjectConfig,
  context: MergeContext,
): Promise<MergeResult> {
  const existingFullConfig = await loadProjectConfig(context.projectDir);
  if (existingFullConfig) {
    const existingConfig = existingConfigForMerge(
      existingFullConfig,
      context.projectDir,
      newConfig.name,
    );
    const config = mergeConfigs(newConfig, existingConfig, {
      ...(context.authoritativeScope !== undefined && {
        authoritativeScope: context.authoritativeScope,
      }),
    });

    return {
      config,
      merged: true,
      existingConfigPath: existingFullConfig.configPath,
    };
  }

  // Aborts on an unreadable config, but `loadProjectConfig` above has already thrown for one.
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
