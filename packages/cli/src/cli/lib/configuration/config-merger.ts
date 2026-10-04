import { indexBy, omit, pick, uniqueBy } from "remeda";
import { HAND_WRITTEN_FIELDS } from "@workspace/compile/config-source";

import type { ProjectConfig } from "../../types";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";
import { getProjectConfigPath } from "../installation/install-base-dir";
import { loadProjectConfig, type LoadedProjectConfig } from "./project-config";
import { loadProjectSourceConfig } from "./config";
import { isGlobalTombstone, isProjectOwned, type ScopedEntry } from "./scope-predicates";

/**
 * How authoritative `newConfig` is over entries absent from it:
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
 * collapsed onto `name` alone.
 */
const agentKey = (a: AgentScopeConfig): string =>
  `${a.name}:${a.scope}${a.excluded ? ":excluded" : ""}`;

/**
 * Compound identity key for a skill entry. Same shape as {@link agentKey}:
 * `id:scope` for actives, `id:scope:excluded` for tombstones. Prevents the
 * class of bugs where two distinct-scope entries collide onto `id`.
 */
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

/**
 * True when an existing entry is within the current edit session's authority, so its absence
 * from `newConfig` means a deliberate removal (drop) rather than an untouched entry (preserve).
 *
 * `"all"` (global edit): every entry is owned. `"owned"` (project edit): only project-scoped
 * entries and the project's own global tombstones — inherited global-active entries belong to
 * the global config and must never be dropped from a project edit.
 */
function isWithinSessionAuthority(entry: ScopedEntry, scope: AuthoritativeScope): boolean {
  if (scope === "all") return true;
  return isProjectOwned(entry);
}

/**
 * One roster — agents or skills — merged by the rules {@link mergeConfigs} states: an existing
 * entry is replaced by the incoming entry with its compound key, dropped when the incoming roster
 * manages its name/id under another key, dropped when it was the project's dual-scope entry and
 * the incoming roster carries nothing for it, dropped when an authoritative session left it out,
 * and otherwise preserved. Incoming entries with new keys are appended, and the result is deduped
 * by compound key, keeping the first occurrence.
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
  // Names/ids the project managed as dual-scope this session: a global tombstone in the existing
  // config marks an entry whose global install the project actively overrode. When the incoming
  // roster carries NO entry for such a name, the user fully deselected the dual-scope row — both
  // the lingering active project entry and the stale tombstone must drop together, not be
  // preserved — the full-deselect case.
  const dualScopeIdentities = new Set(existing.filter(isGlobalTombstone).map(identity.identityOf));

  const updatedExisting = existing.flatMap((entry) => {
    const matching = incomingByKey[identity.keyOf(entry)];
    if (matching !== undefined) return [matching];
    // Name is actively managed by the incoming roster but this exact (scope, excluded) slot is
    // NOT in it → the wizard intentionally dropped this row (scope migration or tombstone
    // cleanup). Drop it.
    if (incomingIdentities.has(identity.identityOf(entry))) return [];
    if (dualScopeIdentities.has(identity.identityOf(entry))) return [];
    // Authoritative edit: an in-authority entry absent from the incoming roster (even a plain
    // active one with no tombstone) was deselected and must be dropped.
    if (authoritativeScope && isWithinSessionAuthority(entry, authoritativeScope)) return [];
    return [entry];
  });
  const added = incoming.filter((entry) => !existingKeys.has(identity.keyOf(entry)));
  return uniqueBy([...updatedExisting, ...added], identity.keyOf);
}

type MergeOptions = Pick<MergeContext, "authoritativeScope">;

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
 * the stale tombstone are dropped together — the full-deselect case.
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
 * Root cause of the duplicate rows this key fixes: the prior name-only key collapsed
 * distinct-scope entries, and the positional `.map()` over existing rewrote
 * every collision slot — multiplying pre-existing duplicates and failing to
 * drop stale rows on scope migration.
 *
 * `authoritativeScope`: a full `cc edit` pass presents the complete roster
 * the wizard could edit, so an entry within that authority which is absent from `newConfig` was
 * deliberately removed and must be dropped (even a plain active entry with no tombstone), rather
 * than union-preserved. `"all"` (global edit) covers every entry; `"owned"` (project edit) covers
 * only project-scoped entries and the project's own global tombstones — inherited global-active
 * entries are always preserved. `undefined` (init) keeps additive union-preserve.
 *
 * A skill the wizard could not resolve from the loaded source this session is NOT exempt from that
 * drop: it is removed like any other absent entry, and `edit` names it and says why in its Changes
 * block. Exempting it used to keep an entry in `config.ts` that the same run's summary announced as
 * gone and the compiled agent no longer carried — three surfaces, three answers about one skill.
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

  // The existing name labels the marketplace it was recorded beside. A project set up from another
  // merges over the GLOBAL config, and that name would otherwise be written in as the project's.
  if (existingConfig.marketplaceName && merged.marketplace === existingConfig.marketplace) {
    merged.marketplaceName = existingConfig.marketplaceName;
  }

  // Written by hand into this file and by nothing the session produces, so the file is their only
  // record: a rewrite that dropped them put a white-labelled install back on the shipped name.
  Object.assign(merged, pick(existingConfig, HAND_WRITTEN_FIELDS));

  // Preserve the registered project paths from the existing (global) config — the wizard
  // result never carries them, and losing them silently disables propagation of global
  // changes to registered projects — the tombstone reconcile never runs.
  if (existingConfig.projects && !newConfig.projects) {
    merged.projects = existingConfig.projects;
  }

  return merged;
}

/**
 * The config the merge reconciles against, wearing an identity this directory can own.
 *
 * `loadProjectConfig` falls back to `os.homedir()` for a project that carries no config of
 * its own, so a first save into a project sitting under an existing global install
 * reconciles against the GLOBAL config — whose `name` identifies that installation and no
 * directory here. `mergeConfigs`' identity-field carry-forward would then stamp it onto the
 * project's own file.
 *
 * The carry-forward itself is intentional and stays: a project's OWN prior config is how a
 * hand-renamed `config.ts` keeps its name across saves. What decides between the two is the
 * provenance of the load, which is known here and nowhere inside the pure merge — so a
 * config that came from the home fallback lends this save every field except its name and its
 * {@link HAND_WRITTEN_FIELDS}. A project that declares none of those reads the global's at run
 * time, so a copy lent here would become the project's own and keep the old value after the
 * global changed.
 */
function existingConfigForMerge(
  loaded: LoadedProjectConfig,
  projectDir: string,
  ownName: string,
): ProjectConfig {
  // Against the SAME installation's path: the load says which provider it came out of, and a
  // comparison against another provider's file would read a project's own config as inherited.
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
    // A full `cc edit` pass loads the complete roster, so newConfig is authoritative over the
    // entries it owns — every entry for a global edit (`"all"`), or project-owned entries for a
    // project edit (`"owned"`). Absent owned entries were deselected and are dropped rather than
    // union-preserved. Init leaves the scope undefined (additive union).
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

  // No existing full config, try simple project source config for author/agentsSource.
  // ABORT on an unreadable config, and unreachable here: `loadProjectConfig` above reads the same
  // file and already threw `ConfigLoadError` for one it could not load, so this rung is only
  // reached when there is no config to read.
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
