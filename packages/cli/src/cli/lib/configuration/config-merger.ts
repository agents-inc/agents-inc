import { indexBy, omit, pick, uniqueBy } from "remeda";
import { DEFAULT_SOURCE } from "@workspace/compile";
import { GLOBAL_IDENTITY_FIELDS, HAND_WRITTEN_FIELDS } from "@workspace/compile/config-source";

import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../consts";
import type { ProjectConfig } from "../../types";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";
import { getProjectConfigPath } from "../installation/install-base-dir";
import { loadProjectConfig, type LoadedProjectConfig } from "./project-config";
import { isGlobalTombstone, isProjectOwned, type ScopedEntry } from "./scope-predicates";

/**
 * How authoritative `newConfig` is over absent entries: `"all"` (global edit) drops any; `"owned"`
 * (project edit) drops absent project-owned ones only; `undefined` (init) never drops.
 */
export type AuthoritativeScope = "all" | "owned";

type MergeContext = {
  projectDir: string;
  authoritativeScope?: AuthoritativeScope;
};

export type MergeResult = {
  config: ProjectConfig;
  merged: boolean;
  existingConfigPath?: string;
};

/** How one roster's entries are told apart: the compound key, and the name or id it extends. */
type RosterIdentity<Entry> = {
  keyOf: (entry: Entry) => string;
  identityOf: (entry: Entry) => string;
};

/** The key adds scope and the excluded flag, so scoped entries and tombstones stay distinct. */
function rosterIdentity<Entry extends ScopedEntry>(
  identityOf: (entry: Entry) => string,
): RosterIdentity<Entry> {
  return {
    keyOf: (entry) => `${identityOf(entry)}:${entry.scope}${entry.excluded ? ":excluded" : ""}`,
    identityOf,
  };
}

const AGENT_IDENTITY = rosterIdentity<AgentScopeConfig>((agent) => agent.name);

const SKILL_IDENTITY = rosterIdentity<SkillConfig>((skill) => skill.id);

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
  const existingKeys = new Set(existing.map(identity.keyOf));
  const isDroppedByEdit = editDrops(incoming, existing, identity, authoritativeScope);

  const updatedExisting = existing.flatMap((entry) => {
    const matching = incomingByKey[identity.keyOf(entry)];
    if (matching !== undefined) return [matching];
    return isDroppedByEdit(entry) ? [] : [entry];
  });
  const added = incoming.filter((entry) => !existingKeys.has(identity.keyOf(entry)));
  return uniqueBy([...updatedExisting, ...added], identity.keyOf);
}

/** Whether the edit drops an existing entry that nothing incoming shares a compound key with. */
function editDrops<Entry extends ScopedEntry>(
  incoming: Entry[],
  existing: Entry[],
  identity: RosterIdentity<Entry>,
  authoritativeScope: AuthoritativeScope | undefined,
): (entry: Entry) => boolean {
  const incomingIdentities = new Set(incoming.map(identity.identityOf));
  // A global tombstone marks a dual-scope entry; with nothing incoming for it, both rows drop.
  const dualScopeIdentities = new Set(existing.filter(isGlobalTombstone).map(identity.identityOf));

  return (entry) =>
    // The incoming roster manages this name under another key: the edit dropped this row.
    incomingIdentities.has(identity.identityOf(entry)) ||
    dualScopeIdentities.has(identity.identityOf(entry)) ||
    (authoritativeScope !== undefined && isWithinSessionAuthority(entry, authoritativeScope));
}

type MergeOptions = Pick<MergeContext, "authoritativeScope">;

/**
 * A stored name labels only the marketplace it was recorded beside. The public catalogue loads
 * unnamed, so it is named where another marketplace's name stands to be lent: the writer fills a
 * project's missing name from the global config.
 */
function marketplaceNameBeside(merged: ProjectConfig, existing: ProjectConfig): string | undefined {
  if (merged.marketplace === existing.marketplace) {
    return existing.marketplaceName ?? merged.marketplaceName;
  }
  if (wouldBorrowAnotherMarketplaceName(merged, existing)) return DEFAULT_PUBLIC_SOURCE_NAME;
  return merged.marketplaceName;
}

function wouldBorrowAnotherMarketplaceName(
  merged: ProjectConfig,
  existing: ProjectConfig,
): boolean {
  return (
    merged.marketplace === DEFAULT_SOURCE &&
    merged.marketplaceName === undefined &&
    existing.marketplaceName !== undefined
  );
}

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

  const marketplaceName = marketplaceNameBeside(merged, existingConfig);
  if (marketplaceName !== undefined) {
    merged.marketplaceName = marketplaceName;
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
 * A config from the home fallback lends every field except its name, its description and the
 * hand-written fields: the incoming configuration describes the project.
 */
function existingConfigForMerge(
  loaded: LoadedProjectConfig,
  projectDir: string,
  ownName: string,
): ProjectConfig {
  // Compared against the same provider's path, or a project's own config reads as inherited.
  const isProjectsOwnFile = loaded.configPath === getProjectConfigPath(projectDir, loaded.provider);
  if (isProjectsOwnFile) return loaded.config;

  return { ...omit(loaded.config, GLOBAL_IDENTITY_FIELDS), name: ownName };
}

export async function mergeWithExistingConfig(
  newConfig: ProjectConfig,
  context: MergeContext,
): Promise<MergeResult> {
  const existingFullConfig = await loadProjectConfig(context.projectDir);
  if (!existingFullConfig) return { config: { ...newConfig }, merged: false };

  const existingConfig = existingConfigForMerge(
    existingFullConfig,
    context.projectDir,
    newConfig.name,
  );
  return {
    config: mergeConfigs(newConfig, existingConfig, context),
    merged: true,
    existingConfigPath: existingFullConfig.configPath,
  };
}
