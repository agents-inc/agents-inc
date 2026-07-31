import fs from "fs";
import { getErrorMessage } from "../../utils/errors.js";
import os from "os";
import path from "path";
import { isDeepEqual, unique } from "remeda";
import type {
  AgentDefinition,
  AgentName,
  Category,
  CompileAgentConfig,
  CompileConfig,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillAssignment,
  SkillDefinition,
  SkillId,
  Stack,
  StackAgentConfig,
} from "../../types";
import { isHomeDirectory } from "./is-home-directory";
import { getProjectConfigPath, resolveInstallPaths, type InstallPaths } from "./install-base-dir";
import { matrix } from "../matrix/matrix-provider";
import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config";
import type { WizardResultV2 } from "../../components/wizard/wizard";
import { type CopiedSkill } from "../skills";
import {
  type MergeResult,
  type AuthoritativeScope,
  mergeWithExistingConfig,
  loadProjectConfig,
  loadProjectConfigFromDir,
} from "../configuration";
import { loadMergedAgents, loadSkillsByIds, type SourceLoadResult } from "../loading";
import { loadStackById, getStackSkillIds } from "../stacks";
import { resolveAgents, buildSkillRefsFromConfig } from "../resolver";
import { createLiquidEngine } from "../compiler";
import { writeCompiledAgentsByScope } from "../agents/write-compiled-agents";
import { generateProjectConfigFromSkills, buildStackProperty } from "../configuration";
import {
  scopeEligibilityKey,
  splitConfigByScope,
  isScopePairCompatible,
} from "../configuration/config-generator";
import {
  isActiveAt,
  isGlobalTombstone,
  activeProjectAgentNames,
  activeSkillScopeMap,
  activeAgentScopeMap,
  effectivelyExcludedSkillIds,
  type ScopedEntry,
} from "../configuration/scope-predicates";
import { generateConfigSource, type ConfigSourceOptions } from "../configuration/config-writer";
import {
  type ConfigTypesBackgroundData,
  deriveCategories,
  deriveDomains,
  generateConfigTypesSource,
  regenerateConfigTypes,
  type ConfigTypesExtras,
} from "../configuration/config-types-writer";
import { ensureDir, fileExists, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedEntries, typedFromEntries, typedKeys } from "../../utils/typed-object";
import {
  DEFAULT_PLUGIN_NAME,
  GLOBAL_CONFIG_NAME,
  LOCAL_PSEUDO_CATEGORY,
  STANDARD_FILES,
} from "../../consts";

type LocalResolvedSkill = SkillDefinition & {
  content: string;
};

/**
 * Options for the eject skill installation pipeline.
 *
 * Passed to {@link installEject} to drive the full installation flow:
 * skill copying, config generation, agent compilation, and file writing.
 */
export type EjectInstallOptions = {
  /** Wizard output containing selected skills, stack, install mode, and source selections */
  wizardResult: WizardResultV2;
  /** Loaded source data including the skills matrix, source path, and source configuration */
  sourceResult: SourceLoadResult;
  /** Absolute path to the project root where `.claude/` artifacts will be written */
  projectDir: string;
  /** Optional `--source` flag override (e.g., "github:org/repo"). Takes precedence over
   *  source from config when writing the `source` field in config.ts */
  sourceFlag?: string;
};

/**
 * Result of a completed eject skill installation.
 *
 * Returned by {@link installEject} with details about what was written to disk,
 * enabling the caller to display a summary to the user.
 */
export type EjectInstallResult = {
  /** Skills that were copied to `.claude/skills/`, with source and destination paths */
  copiedSkills: CopiedSkill[];
  /** Final project configuration (may be merged with existing config.ts) */
  config: ProjectConfig;
  /** Absolute path to the written config.ts file */
  configPath: string;
  /** Agent names that were compiled and written to `.claude/agents/` */
  compiledAgents: AgentName[];
  /** Whether the config was merged with an existing config.ts (true) or freshly created (false) */
  wasMerged: boolean;
  /** Absolute path to the pre-existing config.ts that was merged, if any */
  mergedConfigPath?: string;
  /** Absolute path to the `.claude/skills/` directory */
  skillsDir: string;
  /** Absolute path to the `.claude/agents/` directory */
  agentsDir: string;
};

async function prepareDirectories(paths: InstallPaths): Promise<void> {
  await ensureDir(paths.skillsDir);
  await ensureDir(paths.agentsDir);
  await ensureDir(path.dirname(paths.configPath));
}

export function buildEjectSkillsMap(
  copiedSkills: CopiedSkill[],
): Partial<Record<SkillId, LocalResolvedSkill>> {
  return typedFromEntries(
    copiedSkills.flatMap((cs) => {
      const skill = matrix.skills[cs.skillId];
      if (!skill) return [];
      return [
        [
          cs.skillId,
          {
            id: cs.skillId,
            description: skill.description,
            path: cs.destPath,
            content: "", // Content not needed for skill references
          },
        ],
      ];
    }),
  );
}

/**
 * Returns the ids of skills active in the CURRENT wizard selection that were
 * NOT active in the persisted PRIOR config. Filters `excluded: true` on both
 * sides — excluded entries don't participate in stack membership, so flipping
 * a skill from excluded back to active counts as "newly added".
 *
 * `priorSkills === undefined` (first init) collapses the prior active set to
 * empty — every current skill is new this session. The generator's seeding
 * branch is what actually produces useful output in that case, so treating
 * every skill as "new" is safe.
 */
function computeNewlyAddedSkillIds(
  currentSkills: readonly SkillConfig[],
  priorSkills: readonly SkillConfig[] | undefined,
): readonly SkillId[] {
  const priorActiveIds = new Set((priorSkills ?? []).filter((s) => !s.excluded).map((s) => s.id));
  const currentActiveIds = currentSkills.filter((s) => !s.excluded).map((s) => s.id);
  return unique(currentActiveIds.filter((id) => !priorActiveIds.has(id)));
}

/**
 * Returns `(agent, skillId)` keys whose scope-compatibility was GAINED this
 * session — the pair is scope-compatible now but was NOT scope-compatible (or
 * was absent entirely) in the persisted config. Admits pure scope-flip cases
 * that `computeNewlyAddedSkillIds` (keyed by id only) cannot express.
 *
 * Scope rule: `isScopePairCompatible` from config-generator — the single
 * definition shared with the generator's own compatibility filter.
 *
 * Keys are produced by `scopeEligibilityKey` so lookup membership matches the
 * generator's internal set-membership check.
 */
function computeScopeEligibilityGained(
  currentSkills: readonly SkillConfig[],
  currentAgents: readonly AgentScopeConfig[],
  priorSkills: readonly SkillConfig[] | undefined,
  priorAgents: readonly AgentScopeConfig[] | undefined,
): ReadonlySet<string> {
  const priorSkillScope = activeSkillScopeMap(priorSkills);
  const priorAgentScope = activeAgentScopeMap(priorAgents);

  const gained = new Set<string>();
  const activeCurrentSkills = currentSkills.filter((s) => !s.excluded);
  const activeCurrentAgents = currentAgents.filter((a) => !a.excluded);

  for (const agent of activeCurrentAgents) {
    for (const skill of activeCurrentSkills) {
      if (!isScopePairCompatible(skill.scope, agent.scope)) continue;

      const priorSkillScopeValue = priorSkillScope.get(skill.id);
      const priorAgentScopeValue = priorAgentScope.get(agent.name);
      const wasCompatiblePreviously =
        priorSkillScopeValue !== undefined &&
        priorAgentScopeValue !== undefined &&
        isScopePairCompatible(priorSkillScopeValue, priorAgentScopeValue);

      if (!wasCompatiblePreviously) {
        gained.add(scopeEligibilityKey(agent.name, skill.id));
      }
    }
  }
  return gained;
}

async function buildEjectConfig(
  wizardResult: WizardResultV2,
  sourceResult: SourceLoadResult,
  projectDir: string,
): Promise<{ config: ProjectConfig; loadedStack: Stack | null }> {
  const skillIds = unique(wizardResult.skills.map((s) => s.id));
  verbose(
    `buildEjectConfig: selectedStackId='${wizardResult.selectedStackId}', ` +
      `skills=[${skillIds.join(", ")}], ` +
      `selectedAgents=[${wizardResult.selectedAgents.join(", ")}]`,
  );

  const loadedStack = wizardResult.selectedStackId
    ? await loadStackById(wizardResult.selectedStackId, sourceResult.sourcePath)
    : null;
  if (wizardResult.selectedStackId) {
    verbose(
      `buildEjectConfig: loadedStack=${loadedStack ? `found (id='${loadedStack.id}')` : "NOT FOUND"}`,
    );
    if (!loadedStack) {
      throw new Error(
        `Stack '${wizardResult.selectedStackId}' not found in config/stacks.ts. ` +
          `Available stacks are defined in the CLI's config/stacks.ts file.`,
      );
    }
  }

  const existing = await loadProjectConfig(projectDir);
  // Boundary cast: ProjectConfig.stack types agents as Record<string, StackAgentConfig>
  // (it comes from parsed TS/JSON); narrow to typed AgentName keys at the load boundary.
  // The `?? {}` is a first-init fallback when no prior config exists — not a silent
  // fallback on data that must exist.
  const existingStack = (existing?.config.stack ?? {}) as Partial<
    Record<AgentName, StackAgentConfig>
  >;

  // D-220 delta: skills that are new to this session's top-level selection
  // relative to the persisted config. The diff is filtered to active (non-excluded)
  // skills on BOTH sides — excluded entries are not "present" from the perspective
  // of stack membership, so flipping an exclusion back to active should register
  // as a newly-added skill. `existing === null` (first init) collapses to "every
  // skill is new this session", which the generator's seeding branch tolerates.
  const newlyAddedSkillIds = computeNewlyAddedSkillIds(
    wizardResult.skills,
    existing?.config.skills,
  );

  // D-220 scope-eligibility delta: `(agent, skillId)` pairs that are scope-compatible
  // NOW but were not scope-compatible in the persisted config (either the skill's
  // scope was flipped, the agent's scope was flipped, or one of them was absent
  // before). Admits the scope-flip case that a skill-id-only diff would miss.
  const scopeEligibilityGained = computeScopeEligibilityGained(
    wizardResult.skills,
    wizardResult.agentConfigs,
    existing?.config.skills,
    existing?.config.agents,
  );

  // Pass user's agent selection and skill configs to config generator.
  // Both skillConfigs and agentConfigs are always passed when selectedAgents is
  // set — the config generator enforces that invariant to prevent silent
  // "project" scope defaults on missing lookups.
  const agentOptions: {
    selectedAgents?: AgentName[];
    skillConfigs: SkillConfig[];
    agentConfigs: AgentScopeConfig[];
    existingStack: Partial<Record<AgentName, StackAgentConfig>>;
    newlyAddedSkillIds: readonly SkillId[];
    scopeEligibilityGained: ReadonlySet<string>;
  } = {
    skillConfigs: wizardResult.skills,
    agentConfigs: wizardResult.agentConfigs,
    existingStack,
    newlyAddedSkillIds,
    scopeEligibilityGained,
    ...(wizardResult.selectedAgents.length > 0 && {
      selectedAgents: wizardResult.selectedAgents,
    }),
  };

  // With a stack: overlay the YAML stack as `existingStack` so the ownership-based
  // builder inherits preloaded flags for (agent, category, skill) triples the stack
  // author marked. Ownership rules still govern which agents and categories land in
  // the final stack, so Phase A (init) and Phase B (edit) produce equivalent stacks
  // for the same selection.
  const effectiveOptions = loadedStack
    ? { ...agentOptions, existingStack: { ...buildStackProperty(loadedStack), ...existingStack } }
    : agentOptions;
  const localConfig: ProjectConfig = {
    ...generateProjectConfigFromSkills(DEFAULT_PLUGIN_NAME, skillIds, effectiveOptions),
    ...(loadedStack ? { description: loadedStack.description } : {}),
  };

  verbose(
    `buildEjectConfig result: stack=${localConfig.stack ? Object.keys(localConfig.stack).length + " agents" : "UNDEFINED"}, ` +
      `agents=[${localConfig.agents.map((a) => a.name).join(", ")}], skills=${localConfig.skills.length}`,
  );

  return { config: localConfig, loadedStack };
}

export function setConfigMetadata(
  config: ProjectConfig,
  wizardResult: WizardResultV2,
  sourceResult: SourceLoadResult,
  sourceFlag?: string,
): ProjectConfig {
  const result = { ...config };

  // Only persist domains when non-empty (sparse output)
  if (wizardResult.selectedDomains && wizardResult.selectedDomains.length > 0) {
    result.domains = wizardResult.selectedDomains;
  }

  // Only persist selectedAgents when non-empty (sparse output)
  if (wizardResult.selectedAgents && wizardResult.selectedAgents.length > 0) {
    result.selectedAgents = wizardResult.selectedAgents;
  }

  if (sourceFlag) {
    result.source = sourceFlag;
  } else if (sourceResult.sourceConfig.source) {
    result.source = sourceResult.sourceConfig.source;
  }

  if (sourceResult.marketplace) {
    result.marketplace = sourceResult.marketplace;
  }

  return result;
}

export async function buildAndMergeConfig(
  wizardResult: WizardResultV2,
  sourceResult: SourceLoadResult,
  projectDir: string,
  sourceFlag?: string,
  authoritativeScope?: AuthoritativeScope,
): Promise<MergeResult> {
  const { config } = await buildEjectConfig(wizardResult, sourceResult, projectDir);
  verbose(
    `buildAndMergeConfig: before merge — stack=${config.stack ? Object.keys(config.stack).length + " agents" : "UNDEFINED"}`,
  );
  const configWithMetadata = setConfigMetadata(config, wizardResult, sourceResult, sourceFlag);
  const result = await mergeWithExistingConfig(configWithMetadata, {
    projectDir,
    authoritativeScope,
    // Skills the wizard could not resolve from the loaded source this session must survive an
    // authoritative edit — their absence from the wizard result is a resolution gap, not a
    // deselection (D-233 Scenario C data-loss guard).
    unresolvableSkillIds: wizardResult.unresolvableSkillIds,
  });
  verbose(
    `buildAndMergeConfig: after merge — stack=${result.config.stack ? Object.keys(result.config.stack).length + " agents" : "UNDEFINED"}, merged=${result.merged}`,
  );
  return result;
}

export async function writeConfigFile(
  config: ProjectConfig,
  configPath: string,
  options?: ConfigSourceOptions,
): Promise<void> {
  const source = generateConfigSource(config, options);
  await writeFile(configPath, source);
}

export function buildCompileAgents(
  config: ProjectConfig,
  agents: Record<AgentName, AgentDefinition>,
): Record<string, CompileAgentConfig> {
  const activeAgents = config.agents.filter((a) => !a.excluded);
  const excludedSkillIds = effectivelyExcludedSkillIds(config.skills);

  // D7 cross-scope safety net: build set of global skill IDs so global agents only see global skills
  const globalSkillIds = new Set(
    config.skills.filter((s) => isActiveAt(s, "global")).map((s) => s.id),
  );

  // D-217: attach per-skill `source` to each SkillReference so the compiler can
  // decide between `${id}:${id}` (plugin) and bare id (eject) on a per-skill
  // basis. Missing entries are intentional — user-authored local skills have no
  // SkillConfig and legitimately carry no source.
  const sourceById = new Map<SkillId, string>(config.skills.map((s) => [s.id, s.source]));

  const buildAgentCompileEntry = (agentConfig: AgentScopeConfig): CompileAgentConfig => {
    const agentStack = config.stack?.[agentConfig.name];
    if (!agentStack) return {};
    // Filter out excluded skills; global agents only see global skills (cross-scope safety net)
    const filteredRefs = buildSkillRefsFromConfig(agentStack)
      .filter(
        (ref) =>
          !excludedSkillIds.has(ref.id) &&
          (agentConfig.scope !== "global" || globalSkillIds.has(ref.id)),
      )
      .map((ref) => ({ ...ref, source: sourceById.get(ref.id) }));
    return { skills: filteredRefs };
  };

  return Object.fromEntries(
    activeAgents
      .filter((agentConfig) => agents[agentConfig.name])
      .map((agentConfig) => [agentConfig.name, buildAgentCompileEntry(agentConfig)]),
  );
}

export function buildAgentScopeMap(config: ProjectConfig): Map<AgentName, SkillScope> {
  return activeAgentScopeMap(config.agents);
}

/**
 * Deep-additive stack merge: appends any (agent, category, skill) triple present in
 * `incoming` but missing in `existing`. Never removes or overwrites existing entries
 * (including their `preloaded` flags). Returns a fresh stack object — inputs are not
 * mutated. `changed` is true iff at least one new agent, category, or skill assignment
 * was appended.
 */
function additiveMergeStack(
  existing: Partial<Record<AgentName, StackAgentConfig>> | undefined,
  incoming: Partial<Record<AgentName, StackAgentConfig>> | undefined,
): { stack: Partial<Record<AgentName, StackAgentConfig>>; changed: boolean } {
  const merged: Partial<Record<AgentName, StackAgentConfig>> = existing
    ? structuredClone(existing)
    : {};
  if (!incoming) return { stack: merged, changed: false };

  let changed = false;
  for (const [agentName, incomingAgentStack] of typedEntries<AgentName, StackAgentConfig>(
    incoming,
  )) {
    if (!incomingAgentStack) continue;

    const existingAgentStack = merged[agentName];
    if (!existingAgentStack) {
      merged[agentName] = structuredClone(incomingAgentStack);
      changed = true;
      continue;
    }

    if (mergeAgentCategories(existingAgentStack, incomingAgentStack)) {
      changed = true;
    }
  }

  return { stack: merged, changed };
}

/**
 * Mutates `existingAgentStack` in place by appending any category or skill assignment
 * from `incomingAgentStack` that is not already present. Returns true if anything was
 * appended. Caller must pass a cloned `existingAgentStack` — this function is only
 * called on the merged copy, never on the original input.
 */
function mergeAgentCategories(
  existingAgentStack: StackAgentConfig,
  incomingAgentStack: StackAgentConfig,
): boolean {
  let changed = false;
  for (const [category, incomingAssignments] of typedEntries<Category, SkillAssignment[]>(
    incomingAgentStack,
  )) {
    if (!incomingAssignments) continue;

    const existingAssignments = existingAgentStack[category];
    if (!existingAssignments) {
      existingAgentStack[category] = incomingAssignments.map((a) => ({ ...a }));
      changed = true;
      continue;
    }

    const existingIds = new Set(existingAssignments.map((a) => a.id));
    for (const assignment of incomingAssignments) {
      if (!existingIds.has(assignment.id)) {
        existingAssignments.push({ ...assignment });
        existingIds.add(assignment.id);
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * Merges new global-scoped items into an existing global config.
 * Adds skills/agents that don't already exist. Never removes existing items.
 *
 * Exported for unit testing. See `mergeGlobalConfigs` describe block in
 * `local-installer.test.ts`.
 */
export function mergeGlobalConfigs(
  existing: ProjectConfig,
  incoming: ProjectConfig,
): { config: ProjectConfig; changed: boolean } {
  const existingSkillIds = new Set(existing.skills.map((s) => s.id));
  const existingAgentNames = new Set(existing.agents.map((a) => a.name));

  const incomingActiveSkills = incoming.skills.filter((s) => !s.excluded);
  const incomingActiveAgents = incoming.agents.filter((a) => !a.excluded);
  const newSkills = incomingActiveSkills.filter((s) => !existingSkillIds.has(s.id));
  const newAgents = incomingActiveAgents.filter((a) => !existingAgentNames.has(a.name));

  const mergedSkills = [...existing.skills, ...newSkills];
  const mergedAgents = [...existing.agents, ...newAgents];

  // Per-agent stack merge policy: deep-additive. Project-context edits must NEVER remove
  // or overwrite global state; individual projects express their local view via tombstones
  // in the PROJECT config, not by rewriting the GLOBAL config (see commit 403df46:
  // "never modify global config from project-level operations").
  //
  // Merge rule per triple (agent, category, skill):
  //   - agent absent in existing    -> add from incoming
  //   - category absent in existing -> add from incoming
  //   - skill id absent in existing -> append from incoming
  //   - everything already present  -> keep existing as-is (including its preloaded flag)
  // Anything present only in `existing` is left untouched.
  const { stack: mergedStack, changed: stackChanged } = additiveMergeStack(
    existing.stack,
    incoming.stack,
  );

  // Merge domains and selectedAgents (union, no duplicates)
  const mergedDomains = [...new Set([...(existing.domains ?? []), ...(incoming.domains ?? [])])];
  const mergedSelectedAgents = [
    ...new Set([...(existing.selectedAgents ?? []), ...(incoming.selectedAgents ?? [])]),
  ];

  // Source identity (`marketplace`, `source`) travels on the global partition of
  // `splitConfigByScope` but was previously lost here, leaving the global config with no
  // record of where its plugins came from. `uninstall` reads `config.marketplace` to build
  // the `<id>@<marketplace>` registry key (getCliInstalledPluginKeys) — without it a global
  // uninstall silently owns nothing and leaves registered plugins behind.
  //
  // Precedence is FILL-ONLY: existing wins, incoming is used solely when the global config
  // has no value yet. Both fields are scalar but the merged config is multi-marketplace by
  // construction — this merge never removes skills, so after a second project init from a
  // different marketplace the skills array holds plugins from BOTH, and whichever label is
  // recorded orphans the other's registry key. Repointing is therefore never a strict
  // improvement, and doing it from a project context would silently rewrite global state on
  // behalf of every other registered project (commit 403df46). This also matches
  // `mergeConfigs`, which preserves `existingConfig.marketplace` on the home-root install
  // path. Changing global source identity stays an explicit global-scope operation
  // (`init` run from ~), which writes the global config directly and bypasses this merge.
  const mergedMarketplace = existing.marketplace ?? incoming.marketplace;
  const mergedSource = existing.source ?? incoming.source;

  // Newly-filled source identity must mark the merge dirty: `needsGlobalWrite` is gated on
  // this flag, so a run whose only delta is the now-known marketplace would otherwise skip
  // the global write entirely and drop the field again.
  const changed =
    newSkills.length > 0 ||
    newAgents.length > 0 ||
    stackChanged ||
    !isDeepEqual(existing.domains ?? [], mergedDomains) ||
    !isDeepEqual(existing.selectedAgents ?? [], mergedSelectedAgents) ||
    mergedMarketplace !== existing.marketplace ||
    mergedSource !== existing.source;

  return {
    config: {
      ...existing,
      skills: mergedSkills,
      agents: mergedAgents,
      stack: mergedStack,
      domains: mergedDomains,
      selectedAgents: mergedSelectedAgents,
      marketplace: mergedMarketplace,
      source: mergedSource,
    },
    changed,
  };
}

/**
 * The single normalization for every value compared against the global config's
 * `projects` array — the one written by {@link registerProjectPath}, the one
 * filtered by {@link deregisterProjectPath}, and the current-project skip in
 * {@link propagateGlobalChangesToProjects}. Symlinks are resolved, so an entry
 * stored under one of them matches byte-for-byte under the others. The two ends
 * normalizing differently is what left symlinked layouts (macOS `/tmp`, a
 * `~/dev/repo` pointing at `/data/repo`) registered forever after an uninstall.
 *
 * Throws when the directory does not exist. That is deliberate: a path that
 * cannot be resolved is an error, not a cue to fall back to a weaker
 * normalization — a second tier would reintroduce exactly the asymmetry this
 * helper exists to remove. The one caller that must survive it (`uninstall`'s
 * deregistration) already wraps the call in a warn-and-continue guard.
 */
function normalizeProjectPath(projectDir: string): string {
  return fs.realpathSync(projectDir);
}

/**
 * Registers a project directory in the global config's `projects` array.
 * Paths are normalized via {@link normalizeProjectPath} to resolve symlinks.
 * Filters stale entries (where .claude-src/config.ts no longer exists).
 */
async function registerProjectPath(
  globalConfig: ProjectConfig,
  projectDir: string,
): Promise<{ config: ProjectConfig; changed: boolean }> {
  const normalizedPath = normalizeProjectPath(projectDir);
  const existing = globalConfig.projects ?? [];

  // Filter stale entries
  const staleChecks = await Promise.all(
    existing.map(async (p) => ({
      path: p,
      hasConfig: await fileExists(getProjectConfigPath(p)),
    })),
  );
  const valid = staleChecks.filter((c) => c.hasConfig).map((c) => c.path);

  if (valid.includes(normalizedPath)) {
    const changed = valid.length !== existing.length;
    return { config: changed ? { ...globalConfig, projects: valid } : globalConfig, changed };
  }

  return { config: { ...globalConfig, projects: [...valid, normalizedPath] }, changed: true };
}

/**
 * Removes a project directory from the global config's `projects` array.
 * Loads global config, removes the path, and writes back if changed.
 * Paths are normalized via {@link normalizeProjectPath} — the same rule
 * {@link registerProjectPath} stored them under, so the filter matches.
 */
export async function deregisterProjectPath(projectDir: string): Promise<void> {
  const homeDir = os.homedir();
  const existingGlobal = await loadProjectConfigFromDir(homeDir);
  if (!existingGlobal?.config?.projects?.length) return;

  const normalizedPath = normalizeProjectPath(projectDir);
  const filtered = existingGlobal.config.projects.filter((p) => p !== normalizedPath);

  if (filtered.length === existingGlobal.config.projects.length) return;

  const updatedConfig = { ...existingGlobal.config, projects: filtered };
  const globalConfigPath = getProjectConfigPath(homeDir);
  await writeConfigFile(updatedConfig, globalConfigPath);
  verbose(`Deregistered project ${normalizedPath} from global config`);
}

function isProjectScopedEntry(entry: ScopedEntry): boolean {
  return entry.scope === "project";
}

/** True when the global config still has an active (non-excluded) skill for this id. */
function globalHasActiveSkill(globalConfig: ProjectConfig, id: SkillId): boolean {
  return globalConfig.skills.some((s) => s.id === id && isActiveAt(s, "global"));
}

/** True when the global config still has an active (non-excluded) agent for this name. */
function globalHasActiveAgent(globalConfig: ProjectConfig, name: AgentName): boolean {
  return globalConfig.agents.some((a) => a.name === name && isActiveAt(a, "global"));
}

/**
 * Keeps a project's own skill entries when re-inlining fresh global data, dropping
 * tombstones that no longer correspond to a real global install.
 *
 * A tombstone (`scope === "global" && excluded`) only has meaning while the global entry
 * it masks still exists. Once the skill has been removed from the global config, the
 * tombstone is stale — carrying it forward would leave the project showing a masked
 * global item that no longer exists. Project-scoped entries are always retained.
 */
function retainProjectOwnedSkills(
  skills: SkillConfig[],
  globalConfig: ProjectConfig,
): SkillConfig[] {
  return skills.filter(
    (entry) =>
      isProjectScopedEntry(entry) ||
      (isGlobalTombstone(entry) && globalHasActiveSkill(globalConfig, entry.id)),
  );
}

/** Agent mirror of {@link retainProjectOwnedSkills}. */
function retainProjectOwnedAgents(
  agents: AgentScopeConfig[],
  globalConfig: ProjectConfig,
): AgentScopeConfig[] {
  return agents.filter(
    (entry) =>
      isProjectScopedEntry(entry) ||
      (isGlobalTombstone(entry) && globalHasActiveAgent(globalConfig, entry.name)),
  );
}

/**
 * Category a skill belongs to according to the MERGED matrix. `undefined` when the
 * matrix has no entry for the id (a user-authored local skill carries no matrix
 * record) or when the entry sits in the `local` pseudo-category — neither
 * participates in category rules, and neither may throw.
 */
function categoryOfSkill(id: SkillId, matrix: MergedSkillsMatrix): Category | undefined {
  const category = matrix.skills[id]?.category;
  if (category === undefined || category === LOCAL_PSEUDO_CATEGORY) return undefined;
  return category;
}

/**
 * True when the merged matrix DECLARES this category as holding at most one skill.
 * Read from the matrix passed in rather than `defaultCategories` so a source repo's
 * category overrides are honoured.
 *
 * A category the matrix does not declare is deliberately NOT treated as exclusive.
 * The wizard's renderer defaults an undeclared category to exclusive
 * (`build-step-logic.ts` uses `cat.exclusive ?? true`), but a rule that MASKS
 * persisted entries must only fire on a flag the data actually carries.
 */
function isExclusiveCategory(category: Category, matrix: MergedSkillsMatrix): boolean {
  return matrix.categories[category]?.exclusive === true;
}

/** Categories occupied by an active project-scoped skill, per the merged matrix. */
function activeProjectCategories(
  projectOwnedSkills: SkillConfig[],
  matrix: MergedSkillsMatrix,
): Set<Category> {
  return new Set(
    projectOwnedSkills
      .filter((s) => isActiveAt(s, "project"))
      .map((s) => categoryOfSkill(s.id, matrix))
      .filter((category): category is Category => category !== undefined),
  );
}

/**
 * The collision that justifies masking a live global skill. Two kinds, both read from the
 * project's OWN entries: IDENTITY — the project owns the same id at project scope; CATEGORY —
 * the project owns a different active skill in the same category and the matrix declares that
 * category exclusive.
 *
 * Shared by the mask producer ({@link maskCollidingGlobalSkills}) and the self-heal that
 * removes a mask once its collision clears ({@link dropOrphanedDerivedMasks}), so the two can
 * never disagree about what a mask means.
 */
function buildProjectCollisionTest(
  projectOwnedSkills: SkillConfig[],
  matrix: MergedSkillsMatrix,
): (id: SkillId) => boolean {
  const ownedIds = new Set(
    projectOwnedSkills.filter((s) => isActiveAt(s, "project")).map((s) => s.id),
  );
  const occupiedExclusiveCategories = new Set(
    [...activeProjectCategories(projectOwnedSkills, matrix)].filter((category) =>
      isExclusiveCategory(category, matrix),
    ),
  );

  return (id) => {
    if (ownedIds.has(id)) return true;
    const category = categoryOfSkill(id, matrix);
    return category !== undefined && occupiedExclusiveCategories.has(category);
  };
}

/**
 * Drops a derived mask that no longer masks anything, so the global install becomes
 * visible again once the collision that produced it is gone.
 *
 * A derived mask and a user-authored tombstone are BYTE-IDENTICAL in config.ts — both are
 * `{ id, scope: "global", excluded: true }` — but since D-277 the wizard can no longer mint
 * the second kind on its own: a project-scope deselect of a globally-installed skill is
 * refused, and a domain deselect only drops what the project owns. The one user route to a
 * global tombstone is the `s` scope toggle (G→P), which always pairs the tombstone with an
 * active project entry for the same id — an IDENTITY collision. So every bare mask is
 * machine-derived, and a single retention test suffices: keep it iff the collision that
 * would re-derive it is still there, in `required` and optional categories alike.
 */
function dropOrphanedDerivedMasks(
  projectOwnedSkills: SkillConfig[],
  matrix: MergedSkillsMatrix,
): SkillConfig[] {
  const collidesWithProjectOwnership = buildProjectCollisionTest(projectOwnedSkills, matrix);
  return projectOwnedSkills.filter(
    (entry) => !isGlobalTombstone(entry) || collidesWithProjectOwnership(entry.id),
  );
}

/**
 * Agent mirror of {@link dropOrphanedDerivedMasks}, identity collisions only (D-277): agents
 * have no categories, so the project-scoped sibling with the same name is the only thing a
 * mask can be justified by.
 */
function dropOrphanedDerivedAgentMasks(projectOwnedAgents: AgentScopeConfig[]): AgentScopeConfig[] {
  const ownedNames = new Set(activeProjectAgentNames(projectOwnedAgents));
  return projectOwnedAgents.filter(
    (entry) => !isGlobalTombstone(entry) || ownedNames.has(entry.name),
  );
}

/**
 * Builds the tombstones that mask live global skills this project cannot show
 * alongside what it already owns at project scope. Two collision kinds, both keyed
 * against the SAME live global config:
 *
 * 1. IDENTITY — the project owns the same id at project scope (D-268). Without the
 *    mask, `partitionInlinedConfigEntries` re-inlines the global copy as a SECOND
 *    active entry, leaving one id active at BOTH scopes instead of rendering the
 *    dual-scope `[P][G]` pair.
 * 2. CATEGORY — the project owns a DIFFERENT active skill in the same category and
 *    the matrix declares that category exclusive. Reconciliation keyed on identity
 *    alone cannot see this, so a project owning Vue plus a global install of React
 *    ends up with two active skills in a category that permits one.
 *
 * The project-owned skill wins locally. This is DELIBERATELY ASYMMETRIC with D-260,
 * where a user-initiated radio swap in `toggleTechnology` refuses to displace a
 * globally-locked skill: there the user is actively trying to drop a shared install,
 * whereas here the collision is PUSHED IN by a global install landing on pre-existing
 * project state. Letting global win would silently uninstall the user's own skill.
 *
 * Tombstones are spread from the global entry so they carry the global install's
 * `source`. A skill the project merely inherits (no active project-scope entry, no
 * exclusive-category collision) is skipped — it stays a single active global entry.
 * A skill the project already tombstones is skipped so re-running is idempotent.
 */
function maskCollidingGlobalSkills(
  projectOwnedSkills: SkillConfig[],
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): SkillConfig[] {
  const collidesWithProjectOwnership = buildProjectCollisionTest(projectOwnedSkills, matrix);
  const alreadyTombstoned = new Set(projectOwnedSkills.filter(isGlobalTombstone).map((s) => s.id));

  return globalConfig.skills
    .filter(
      (globalEntry) =>
        isActiveAt(globalEntry, "global") &&
        collidesWithProjectOwnership(globalEntry.id) &&
        !alreadyTombstoned.has(globalEntry.id),
    )
    .map((globalEntry) => ({ ...globalEntry, excluded: true }));
}

/**
 * Agent mirror of {@link maskCollidingGlobalSkills}, identity collisions only (D-259).
 * Agents have no categories, so there is no grouping dimension to reconcile.
 */
function maskCollidingGlobalAgents(
  projectOwnedAgents: AgentScopeConfig[],
  globalConfig: ProjectConfig,
): AgentScopeConfig[] {
  const ownedNames = new Set(activeProjectAgentNames(projectOwnedAgents));
  const alreadyTombstoned = new Set(
    projectOwnedAgents.filter(isGlobalTombstone).map((a) => a.name),
  );

  return globalConfig.agents
    .filter(
      (globalEntry) =>
        isActiveAt(globalEntry, "global") &&
        ownedNames.has(globalEntry.name) &&
        !alreadyTombstoned.has(globalEntry.name),
    )
    .map((globalEntry) => ({ ...globalEntry, excluded: true }));
}

/**
 * Reconciles a project's OWN entries against the live global config, immediately
 * before the inlining writer merges the two.
 *
 * Applied at BOTH sites that write a project `config.ts` with `globalConfig` inlined:
 * `propagateGlobalChangesToProjects` (a global change fanning out to registered
 * projects) and the project-scope save branch of `writeScopedConfigs` (an ordinary
 * project `init`/`edit` performed while the colliding skill is already active
 * globally). Either site alone can produce the malformed shape, so both must run it.
 *
 * Self-heal runs BEFORE masking on BOTH axes so a mask whose collision has cleared is
 * removed rather than immediately re-derived, and so masking's `alreadyTombstoned` guard
 * only sees tombstones that are still warranted.
 *
 * Masking is PROJECT-LOCAL: it is applied to the project split only. The global
 * config passed in is read, never rewritten — tombstones never belong in
 * `~/.claude-src/config.ts`.
 */
function reconcileProjectSplitAgainstGlobal(
  projectSplit: ProjectConfig,
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): ProjectConfig {
  const healedSkills = dropOrphanedDerivedMasks(projectSplit.skills, matrix);
  const healedAgents = dropOrphanedDerivedAgentMasks(projectSplit.agents);
  return {
    ...projectSplit,
    skills: [...healedSkills, ...maskCollidingGlobalSkills(healedSkills, globalConfig, matrix)],
    agents: [...healedAgents, ...maskCollidingGlobalAgents(healedAgents, globalConfig)],
  };
}

/**
 * Prunes a project's inlined `selectedAgents[]` symmetrically with `retainProjectOwnedAgents`.
 *
 * A registered project's stored `selectedAgents` is a flat name union that legitimately
 * contains global agent names — the inlined writer emits `union(global, project)`. Carried
 * forward verbatim, a global agent removed at global scope survives the writer's next union
 * and lingers in `selectedAgents[]` while being absent from `agents[]` — an internal drift
 * that never self-heals across propagation cycles. A name is retained only when it is backed
 * by a real active agent: either a project-scoped agent the project owns, or an agent still
 * active in the current global config. Project ownership is read from the already-reconciled
 * `agents[]` (project-scoped entries are always retained), so a name the project owns at
 * project scope survives even when a same-named global agent is removed.
 */
function retainReconciledSelectedAgents(
  selectedAgents: AgentName[] | undefined,
  reconciledAgents: AgentScopeConfig[],
  globalConfig: ProjectConfig,
): AgentName[] | undefined {
  if (!selectedAgents) return selectedAgents;
  const projectOwnedNames = new Set(
    reconciledAgents.filter((a) => isActiveAt(a, "project")).map((a) => a.name),
  );
  return selectedAgents.filter(
    (name) => projectOwnedNames.has(name) || globalHasActiveAgent(globalConfig, name),
  );
}

/**
 * Computes the skill ids that this project inherited from global scope but that are
 * no longer active at global scope after the change being propagated — and that the
 * project does not own at project scope. These are the only ids that should be pruned
 * from the project's stack: a project-scoped agent may legitimately reference a
 * globally-installed skill, and once that skill is removed at global scope the
 * reference becomes dangling.
 *
 * `priorProjectSkills` is the project's pre-reconciliation (on-disk, inlined) skills.
 * A global skill that was just removed still appears here as a `scope: "global"`,
 * non-excluded entry, which is the signal we key on. Project-scoped skills and
 * user-authored local skills (which carry no SkillConfig entry at all) are never in
 * this set, so they are always preserved.
 */
function computeRemovedGlobalSkillIds(
  priorProjectSkills: SkillConfig[],
  globalConfig: ProjectConfig,
): Set<SkillId> {
  const activeGlobalIds = new Set(
    globalConfig.skills.filter((s) => isActiveAt(s, "global")).map((s) => s.id),
  );
  const projectOwnedIds = new Set(
    priorProjectSkills.filter((s) => isActiveAt(s, "project")).map((s) => s.id),
  );
  return new Set(
    priorProjectSkills
      .filter(
        (s) =>
          s.scope === "global" &&
          !s.excluded &&
          !activeGlobalIds.has(s.id) &&
          !projectOwnedIds.has(s.id),
      )
      .map((s) => s.id),
  );
}

/**
 * Prunes stack references to global skills that were just removed at global scope,
 * so a project-scoped agent stops referencing a skill that no longer exists anywhere.
 * Only ids in `removedGlobalSkillIds` are dropped — every other assignment is kept
 * verbatim, in order, with its `preloaded` flag untouched. Categories and agents left
 * empty by the pruning are removed. When nothing was removed, the stack is returned
 * unchanged so unaffected projects produce byte-identical config output.
 */
function retainReconciledStack(
  stack: Record<string, StackAgentConfig> | undefined,
  removedGlobalSkillIds: Set<SkillId>,
): Record<string, StackAgentConfig> | undefined {
  if (!stack || removedGlobalSkillIds.size === 0) return stack;

  const reconciled: Record<string, StackAgentConfig> = {};
  for (const [agent, agentStack] of Object.entries(stack)) {
    const reconciledAgentStack: StackAgentConfig = {};
    for (const [category, assignments] of typedEntries<Category, SkillAssignment[]>(agentStack)) {
      if (!assignments) continue;
      const kept = assignments.filter((assignment) => !removedGlobalSkillIds.has(assignment.id));
      if (kept.length > 0) reconciledAgentStack[category] = kept;
    }
    if (typedKeys<Category>(reconciledAgentStack).length > 0) {
      reconciled[agent] = reconciledAgentStack;
    }
  }
  return reconciled;
}

/**
 * Propagates global config changes to all registered project configs.
 * Updates each project's config-types.ts (type unions) and config.ts (inlined global data).
 * Skips stale project paths and the current project being installed.
 */
export async function propagateGlobalChangesToProjects(
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
  currentProjectDir?: string,
): Promise<{ updated: string[]; skipped: string[] }> {
  const projects = globalConfig.projects ?? [];
  if (projects.length === 0) return { updated: [], skipped: [] };

  const currentNormalized = currentProjectDir ? normalizeProjectPath(currentProjectDir) : null;
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const projectPath of projects) {
    // Skip the project currently being installed (it's already being written)
    if (currentNormalized && projectPath === currentNormalized) continue;

    const projectConfigPath = getProjectConfigPath(projectPath);
    if (!(await fileExists(projectConfigPath))) {
      skipped.push(projectPath);
      verbose(`Skipped propagation to ${projectPath} (config not found)`);
      continue;
    }

    try {
      const existingProject = await loadProjectConfigFromDir(projectPath);
      if (!existingProject?.config) {
        skipped.push(projectPath);
        continue;
      }

      const projectConfig = existingProject.config;

      // Derive project split: project-scoped entries plus tombstones that still
      // correspond to a live global install. Tombstones whose global entry has been
      // removed are dropped here so the project stops referencing a global item that
      // no longer exists (D-233 Scenario C). The stack is reconciled against the same
      // now-current global data so a project-scoped agent stops referencing a global
      // skill that was just removed at global scope. `projectConfig.skills` (pre-
      // reconciliation) is used to detect removed globals because the removed entry
      // is still present here as a `scope: "global"` reference.
      const removedGlobalSkillIds = computeRemovedGlobalSkillIds(
        projectConfig.skills,
        globalConfig,
      );
      const retainedAgents = retainProjectOwnedAgents(projectConfig.agents, globalConfig);
      const projectSplit = reconcileProjectSplitAgainstGlobal(
        {
          ...projectConfig,
          skills: retainProjectOwnedSkills(projectConfig.skills, globalConfig),
          agents: retainedAgents,
          stack: retainReconciledStack(projectConfig.stack, removedGlobalSkillIds),
          selectedAgents: retainReconciledSelectedAgents(
            projectConfig.selectedAgents,
            retainedAgents,
            globalConfig,
          ),
        },
        globalConfig,
        matrix,
      );

      // Update config.ts with re-inlined global data
      await writeConfigFile(projectSplit, projectConfigPath, {
        isProjectConfig: true,
        globalConfig,
      });

      // Update config-types.ts using the same global-aware path writeScopedConfigs
      // uses for project types — emits `import type { SkillId as GlobalSkillId, ... }`
      // and extends with any project-scoped items the project owns. Without this,
      // a global-scope install would overwrite the project's import-form types with
      // the standalone/inlined form (D-216 Regression #1 / D-228).
      await regenerateConfigTypes(
        projectPath,
        Promise.resolve(buildConfigTypesBackgroundData(matrix, agents)),
        buildProjectTypesExtras(projectSplit, matrix),
      );

      updated.push(projectPath);
      verbose(`Propagated global changes to ${projectPath}`);
    } catch (error) {
      skipped.push(projectPath);
      verbose(`Failed to propagate to ${projectPath}: ${getErrorMessage(error)}`);
    }
  }

  return { updated, skipped };
}

/**
 * Prunes CLI-inlined global-scoped entries from every registered project after a
 * GLOBAL uninstall. Reuses {@link propagateGlobalChangesToProjects} with an
 * emptied global config so every global skill/agent reads as removed: project-
 * scoped entries are retained verbatim, inlined global rows and tombstones are
 * dropped, `selectedAgents` and per-agent stack refs lose their global-only
 * names/ids, and each project's config-types.ts is regenerated. `selectedAgents`
 * is emptied alongside `skills`/`agents` because the project config writer
 * re-unions the global `selectedAgents` into the project's — carrying it forward
 * would resurrect the names the reconciliation just pruned.
 *
 * Call AFTER the global .claude-src manifest has been removed so the regenerated
 * project types fall back to the standalone form instead of importing from the
 * now-deleted global config-types.ts. Unreachable project dirs are reported in
 * `skipped`, never thrown.
 */
export async function pruneGlobalEntriesFromRegisteredProjects(
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
): Promise<{ updated: string[]; skipped: string[] }> {
  const emptiedGlobal: ProjectConfig = {
    ...globalConfig,
    skills: [],
    agents: [],
    selectedAgents: [],
  };
  return propagateGlobalChangesToProjects(emptiedGlobal, matrix, agents);
}

async function writeStandaloneConfigTypes(
  configPath: string,
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
  finalConfig?: ProjectConfig,
): Promise<void> {
  const typesPath = path.join(path.dirname(configPath), STANDARD_FILES.CONFIG_TYPES_TS);
  const customAgentNames = typedKeys(agents).filter((name) => agents[name]?.custom === true);
  const source = generateConfigTypesSource(
    matrix,
    typedKeys(agents),
    customAgentNames,
    undefined,
    finalConfig,
  );
  await writeFile(typesPath, source);
}

/**
 * Writes config.ts and config-types.ts split by scope.
 * When installing into a project directory:
 * - Global config/types go to ~/.claude-src/
 * - Project config/types go to {projectDir}/.claude-src/ (with import from global)
 * When installing from home directory, writes a single standalone config.
 */
/**
 * Resolves the global config a project install should write: merges new
 * global-scoped items into the existing global config (existing items are
 * never removed during project init) and registers this project's path.
 * `globalDataChanged` gates propagation; `changed` gates the write itself.
 */
async function resolveEffectiveGlobalConfig(
  globalSplit: ProjectConfig,
  existingGlobalConfig: ProjectConfig | undefined,
  projectDir: string,
): Promise<{ config: ProjectConfig; globalDataChanged: boolean; changed: boolean }> {
  const hasGlobalItems = globalSplit.skills.length > 0 || globalSplit.agents.length > 0;

  const merged = !hasGlobalItems
    ? {
        config: existingGlobalConfig ?? { name: GLOBAL_CONFIG_NAME, skills: [], agents: [] },
        changed: false,
      }
    : existingGlobalConfig
      ? mergeGlobalConfigs(existingGlobalConfig, globalSplit)
      : { config: globalSplit, changed: true };

  const registration = await registerProjectPath(merged.config, projectDir);
  return {
    config: registration.config,
    globalDataChanged: merged.changed,
    changed: merged.changed || registration.changed,
  };
}

export type ScopedConfigWriteResult = {
  /**
   * Registered project directories whose `config.ts` / `config-types.ts` this
   * write rewrote via propagation. Their compiled agents still reflect the
   * pre-change global data, so the caller owns recompiling them.
   */
  propagatedProjects: string[];
};

export async function writeScopedConfigs(
  finalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
  projectDir: string,
  projectConfigPath: string,
  projectInstallationExists: boolean,
): Promise<ScopedConfigWriteResult> {
  // Use os.homedir() at runtime (not GLOBAL_INSTALL_ROOT constant) so the path
  // agrees with getGlobalConfigImportPath() which also calls os.homedir() at runtime
  const homeDir = os.homedir();
  const isProjectContext = !isHomeDirectory(projectDir);
  if (!isProjectContext) {
    // Installing from ~/ — write directly to global config (no import preamble)
    await writeConfigFile(finalConfig, projectConfigPath);
    await writeStandaloneConfigTypes(projectConfigPath, matrix, agents, finalConfig);
    // Propagate to all registered projects
    if (!finalConfig.projects?.length) return { propagatedProjects: [] };

    const result = await propagateGlobalChangesToProjects(finalConfig, matrix, agents);
    if (result.updated.length > 0) {
      verbose(`Propagated global changes to ${result.updated.length} project(s)`);
    }
    return { propagatedProjects: result.updated };
  }

  // Installing from project — split by scope for project config generation.
  const { global: globalConfig, project: projectSplitConfig } = splitConfigByScope(finalConfig);
  const globalConfigPath = getProjectConfigPath(homeDir);

  // Merge new global-scoped items into the existing global config.
  // - Existing items are preserved (never removed from global during project init)
  // - New global items are added
  // - If no existing global config, write the full global split
  const existingGlobal = await loadProjectConfigFromDir(homeDir);
  const effective = await resolveEffectiveGlobalConfig(
    globalConfig,
    existingGlobal?.config,
    projectDir,
  );
  const effectiveGlobalConfig = effective.config;
  const globalDataChanged = effective.globalDataChanged;
  const needsGlobalWrite = effective.changed;

  if (needsGlobalWrite) {
    await ensureDir(path.dirname(globalConfigPath));
    await writeConfigFile(effectiveGlobalConfig, globalConfigPath);
    verbose(`Updated global config at ${globalConfigPath}`);
    await writeStandaloneConfigTypes(globalConfigPath, matrix, agents, effectiveGlobalConfig);
    verbose("Updated global config-types.ts");
  } else {
    verbose("Global config unchanged, skipping write");
  }

  // Propagate to other registered projects when global data (skills/agents/stack/domains) changed
  let propagatedProjects: string[] = [];
  if (globalDataChanged && effectiveGlobalConfig.projects?.length) {
    const propagation = await propagateGlobalChangesToProjects(
      effectiveGlobalConfig,
      matrix,
      agents,
      projectDir,
    );
    propagatedProjects = propagation.updated;
    if (propagation.updated.length > 0) {
      verbose(`Propagated global changes to ${propagation.updated.length} project(s)`);
    }
  }

  // Reconcile the project's own entries against the global config this write inlines.
  // Without it this branch hands the raw split straight to the inlining writer, so a
  // skill/agent the project owns at project scope AND a colliding live global install
  // both land as active entries in the same project config.
  const reconciledProjectConfig = reconcileProjectSplitAgainstGlobal(
    projectSplitConfig,
    effectiveGlobalConfig,
    matrix,
  );

  // Write project config if the project installation already exists OR if there are project-scoped items.
  // Skip only when no existing project installation AND no project-scoped items — creating an empty
  // project config with just `import globalConfig` and `{ ...globalConfig }` is pointless.
  const hasProjectItems =
    reconciledProjectConfig.skills.length > 0 || reconciledProjectConfig.agents.length > 0;

  if (projectInstallationExists || hasProjectItems) {
    // Write project config with import from global
    await ensureDir(path.dirname(projectConfigPath));
    await writeConfigFile(reconciledProjectConfig, projectConfigPath, {
      isProjectConfig: true,
      globalConfig: effectiveGlobalConfig,
    });
    verbose(`Updated project config at ${projectConfigPath}`);

    // Write project config-types.ts via regenerateConfigTypes so the global-aware
    // branch kicks in: when ~/.claude-src/config-types.ts exists, emit a project
    // types file that imports GlobalSkillId/GlobalAgentName/etc. and extends them
    // with project-only additions. Falls back to standalone when no global install
    // is present (e.g., first-ever project-only install).
    await regenerateConfigTypes(
      projectDir,
      Promise.resolve(buildConfigTypesBackgroundData(matrix, agents)),
      buildProjectTypesExtras(finalConfig, matrix),
    );
  } else {
    verbose(
      "Skipped project config — no existing project installation and no project-scoped items",
    );
  }

  return { propagatedProjects };
}

function buildConfigTypesBackgroundData(
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
): ConfigTypesBackgroundData {
  const agentNames = typedKeys(agents);
  const customAgentNames = agentNames.filter((name) => agents[name]?.custom === true);
  return { matrix, agentNames, customAgentNames };
}

/**
 * Derives project-only extras for regenerateConfigTypes so project config-types.ts
 * extends the global unions with items that exist only in the project scope.
 *
 * - extraSkillIds / extraAgentNames: active (non-excluded) project-scoped entries
 * - extraCategories / extraDomains: derived from project-scoped skills via matrix
 *   lookup so any category/domain introduced by a project skill is included even
 *   when the global scope doesn't reference it
 */
function buildProjectTypesExtras(
  finalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): Required<ConfigTypesExtras> {
  const projectSkills = finalConfig.skills.filter((s) => isActiveAt(s, "project"));
  const projectAgents = finalConfig.agents.filter((a) => isActiveAt(a, "project"));

  const extraSkillIds = unique(projectSkills.map((s) => s.id));
  const extraAgentNames = unique(projectAgents.map((a) => a.name));

  const projectCategories = deriveCategories(
    projectSkills.map((s) => s.id),
    matrix,
  );
  const projectDomains = deriveDomains(projectCategories, matrix);

  return {
    extraSkillIds,
    extraAgentNames,
    extraDomains: projectDomains,
    extraCategories: projectCategories,
  };
}

/**
 * Regenerates a single scope's config-types.ts from its persisted config,
 * matching the wizard write path exactly (D-228 writer selection):
 * - global scope (home dir): standalone unions narrowed to the config's entries
 *   via writeStandaloneConfigTypes
 * - project scope: import-and-extend form via regenerateConfigTypes (falls back
 *   to standalone when no global config-types.ts exists)
 *
 * Used by `compile` so a documented hand-edit of config.ts followed by compile
 * refreshes the type unions instead of leaving them stale.
 */
export async function regenerateScopeConfigTypes(
  projectDir: string,
  config: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
): Promise<void> {
  if (isHomeDirectory(projectDir)) {
    await writeStandaloneConfigTypes(getProjectConfigPath(projectDir), matrix, agents, config);
    return;
  }
  await regenerateConfigTypes(
    projectDir,
    Promise.resolve(buildConfigTypesBackgroundData(matrix, agents)),
    buildProjectTypesExtras(config, matrix),
  );
}

/**
 * Shared install tail: writes scoped configs, then compiles and writes agents.
 * Both install modes call this after building their merged config — only the
 * skills used for compilation and the plugin description differ.
 */
async function writeConfigAndCompileAgents(params: {
  finalConfig: ProjectConfig;
  agents: Record<AgentName, AgentDefinition>;
  localSkills: Partial<Record<SkillId, LocalResolvedSkill>>;
  sourceResult: SourceLoadResult;
  projectDir: string;
  paths: InstallPaths;
  isProjectInstall: boolean;
  description: string;
}): Promise<AgentName[]> {
  const { finalConfig, agents, localSkills, sourceResult, projectDir, paths } = params;

  await writeScopedConfigs(
    finalConfig,
    sourceResult.matrix,
    agents,
    projectDir,
    paths.configPath,
    // During init, the project installation is being created — it exists if we're in a project context
    params.isProjectInstall,
  );

  const compileConfig: CompileConfig = {
    name: DEFAULT_PLUGIN_NAME,
    description: params.description,
    agents: buildCompileAgents(finalConfig, agents),
  };
  return compileAndWriteAgents(
    compileConfig,
    agents,
    localSkills,
    sourceResult,
    projectDir,
    paths.agentsDir,
    buildAgentScopeMap(finalConfig),
  );
}

async function compileAndWriteAgents(
  compileConfig: CompileConfig,
  agents: Record<AgentName, AgentDefinition>,
  localSkills: Partial<Record<SkillId, LocalResolvedSkill>>,
  sourceResult: SourceLoadResult,
  projectDir: string,
  agentsDir: string,
  agentScopeMap?: Map<AgentName, SkillScope>,
): Promise<AgentName[]> {
  const engine = await createLiquidEngine(projectDir);
  const resolvedAgents = await resolveAgents(
    agents,
    localSkills,
    compileConfig,
    sourceResult.sourcePath,
  );

  const outcomes = await writeCompiledAgentsByScope({
    resolvedAgents,
    sourcePath: sourceResult.sourcePath,
    engine,
    projectAgentsDir: agentsDir,
    agentScopeMap,
  });

  // Install treats any compile failure as fatal — surface the first one.
  const failure = outcomes.find((outcome) => !outcome.ok);
  if (failure && !failure.ok) throw failure.error;

  return outcomes.map((outcome) => outcome.name);
}

/** Result of plugin-mode config installation — same as EjectInstallResult without copied skills or skillsDir */
export type PluginConfigResult = Omit<EjectInstallResult, "copiedSkills" | "skillsDir">;

/**
 * Generates config and compiles agents for plugin mode (without copying skills).
 *
 * Used when skills are installed as native plugins and should NOT be copied
 * to `.claude/skills/`. This function performs only:
 * 1. Creates `.claude/agents/` and `.claude-src/` directories
 * 2. Loads agent definitions from both the CLI and source repository
 * 3. Generates project config.ts from the wizard selections, merging with any
 *    existing config
 * 4. Writes config.ts
 * 5. Compiles agent markdown files using Liquid templates and writes them to
 *    `.claude/agents/`
 *
 * @param options - Installation options containing wizard result, source data,
 *                  project directory, and optional source flag override
 * @returns Result containing config and agent artifacts (no skills)
 * @throws {Error} If the selected stack ID is not found in config/stacks.ts
 */
export async function installPluginConfig(
  options: EjectInstallOptions,
): Promise<PluginConfigResult> {
  const { wizardResult, sourceResult, projectDir, sourceFlag } = options;

  const projectPaths = resolveInstallPaths(projectDir, "project");

  // Create directories based on installation context, not data content.
  // ensureDir is idempotent (mkdir -p), so calling it when dirs already exist is safe.
  const isProjectInstall = !isHomeDirectory(projectDir);
  if (isProjectInstall) {
    await ensureDir(projectPaths.agentsDir);
  }
  await ensureDir(path.dirname(projectPaths.configPath));

  const agents = await loadMergedAgents(sourceResult.sourcePath);
  const mergeResult = await buildAndMergeConfig(wizardResult, sourceResult, projectDir, sourceFlag);
  const finalConfig = mergeResult.config;

  // Load skill metadata from source for compilation
  // (actual skill content will be loaded from plugins at runtime)
  const stackSkillIds = finalConfig.stack ? getStackSkillIds(finalConfig.stack) : [];
  // Boundary cast: loadSkillsByIds returns SkillDefinitionMap, LocalResolvedSkill extends SkillDefinition
  const skillsForCompilation = (await loadSkillsByIds(
    stackSkillIds.map((id) => ({ id })),
    sourceResult.sourcePath,
  )) as Partial<Record<SkillId, LocalResolvedSkill>>;

  const compiledAgentNames = await writeConfigAndCompileAgents({
    finalConfig,
    agents,
    localSkills: skillsForCompilation,
    sourceResult,
    projectDir,
    paths: projectPaths,
    isProjectInstall,
    description:
      finalConfig.description || `Plugin setup with ${wizardResult.skills.length} skills`,
  });

  return {
    config: finalConfig,
    configPath: projectPaths.configPath,
    compiledAgents: compiledAgentNames,
    wasMerged: mergeResult.merged,
    mergedConfigPath: mergeResult.existingConfigPath,
    agentsDir: projectPaths.agentsDir,
  };
}

/**
 * Executes the full eject skill installation pipeline.
 *
 * This is the main entry point for the "eject" install mode (as opposed to plugin mode).
 * It performs the following steps in order:
 * 1. Creates `.claude/skills/` and `.claude/agents/` directories
 * 2. Deletes local skills switching to alternate sources, then copies selected
 *    skills from the source repository into `.claude/skills/` (flattened layout)
 * 3. Loads agent definitions from both the CLI and source repository
 * 4. Generates project config.ts from the wizard selections, merging with any
 *    existing config
 * 5. Writes config.ts
 * 6. Compiles agent markdown files using Liquid templates and writes them to
 *    `.claude/agents/`
 *
 * @param options - Installation options containing wizard result, source data,
 *                  project directory, and optional source flag override
 * @returns Result containing all written artifacts (skills, config, agents) and
 *          metadata about the installation (merge status, paths)
 * @throws {Error} If the selected stack ID is not found in config/stacks.ts
 *
 * @remarks
 * **Side effects:** Creates directories and writes files under `{projectDir}/.claude/`.
 */
export async function installEject(options: EjectInstallOptions): Promise<EjectInstallResult> {
  const { wizardResult, sourceResult, projectDir, sourceFlag } = options;

  const projectPaths = resolveInstallPaths(projectDir, "project");
  const globalPaths = resolveInstallPaths(projectDir, "global");

  // Create directories based on installation context, not data content.
  // ensureDir is idempotent (mkdir -p), so calling it when dirs already exist is safe.
  const isProjectInstall = !isHomeDirectory(projectDir);
  if (isProjectInstall) {
    await prepareDirectories(projectPaths);
  } else {
    // Always ensure .claude-src/ exists for config (even when installing from ~/)
    await ensureDir(path.dirname(projectPaths.configPath));
  }
  // Always ensure global skills directory exists when there is a global installation context
  await ensureDir(globalPaths.skillsDir);

  // Copy skills to their scope-appropriate directories, replacing any stale
  // ejected copies of skills now sourced from a marketplace. Imported lazily:
  // copyLocalSkills lives in the operations layer (which imports back into
  // installation), so a static import here would form a load-time cycle.
  const { copyLocalSkills } = await import("../operations/skills/copy-local-skills");
  const { projectCopied, globalCopied } = await copyLocalSkills(
    wizardResult.skills,
    projectDir,
    sourceResult,
    { deleteAlternateSourceSkills: true },
  );
  const copiedSkills = [...projectCopied, ...globalCopied];

  const ejectSkillsForResolution = buildEjectSkillsMap(copiedSkills);

  const agents = await loadMergedAgents(sourceResult.sourcePath);
  const mergeResult = await buildAndMergeConfig(wizardResult, sourceResult, projectDir, sourceFlag);
  const finalConfig = mergeResult.config;

  const compiledAgentNames = await writeConfigAndCompileAgents({
    finalConfig,
    agents,
    localSkills: ejectSkillsForResolution,
    sourceResult,
    projectDir,
    paths: projectPaths,
    isProjectInstall,
    description: finalConfig.description || `Eject setup with ${wizardResult.skills.length} skills`,
  });

  return {
    copiedSkills,
    config: finalConfig,
    configPath: projectPaths.configPath,
    compiledAgents: compiledAgentNames,
    wasMerged: mergeResult.merged,
    mergedConfigPath: mergeResult.existingConfigPath,
    skillsDir: projectPaths.skillsDir,
    agentsDir: projectPaths.agentsDir,
  };
}
