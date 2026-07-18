import fs from "fs";
import os from "os";
import path from "path";
import { isDeepEqual, unique } from "remeda";
import type {
  AgentConfig,
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
import type { InstallMode } from "./installation";
import { deriveInstallMode } from "./installation";
import { matrix } from "../matrix/matrix-provider";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";
import type { WizardResultV2 } from "../../components/wizard/wizard";
import { type CopiedSkill, copySkillsToLocalFlattened, deleteLocalSkill } from "../skills";
import {
  type MergeResult,
  type AuthoritativeScope,
  mergeWithExistingConfig,
  loadProjectConfig,
  loadProjectConfigFromDir,
} from "../configuration";
import { loadAllAgents, loadSkillsByIds, type SourceLoadResult } from "../loading";
import { loadStackById, compileAgentForPlugin, getStackSkillIds } from "../stacks";
import { resolveAgents, buildSkillRefsFromConfig } from "../resolver";
import { createLiquidEngine } from "../compiler";
import { generateProjectConfigFromSkills, buildStackProperty } from "../configuration";
import { scopeEligibilityKey, splitConfigByScope } from "../configuration/config-generator";
import { generateConfigSource, type ConfigSourceOptions } from "../configuration/config-writer";
import {
  type ConfigTypesBackgroundData,
  generateConfigTypesSource,
  regenerateConfigTypes,
} from "../configuration/config-types-writer";
import { ensureDir, fileExists, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedEntries, typedKeys } from "../../utils/typed-object";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DEFAULT_PLUGIN_NAME,
  LOCAL_SKILLS_PATH,
  PROJECT_ROOT,
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

type InstallPaths = {
  skillsDir: string;
  agentsDir: string;
  configPath: string;
};

export function resolveInstallPaths(
  projectDir: string,
  scope: "project" | "global" = "project",
): InstallPaths {
  // Use os.homedir() at runtime for global scope so the path agrees with mocked
  // home directories in tests (GLOBAL_INSTALL_ROOT is evaluated at import time)
  const baseDir = scope === "global" ? os.homedir() : projectDir;
  return {
    skillsDir: path.join(baseDir, LOCAL_SKILLS_PATH),
    agentsDir: path.join(baseDir, CLAUDE_DIR, "agents"),
    configPath: path.join(baseDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
  };
}

async function prepareDirectories(paths: InstallPaths): Promise<void> {
  await ensureDir(paths.skillsDir);
  await ensureDir(paths.agentsDir);
  await ensureDir(path.dirname(paths.configPath));
}

async function deleteAndCopySkills(
  skills: SkillConfig[],
  sourceResult: SourceLoadResult,
  baseDir: string,
  skillsDir: string,
): Promise<CopiedSkill[]> {
  for (const skill of skills) {
    if (skill.source && skill.source !== "eject") {
      verbose(`Using alternate source '${skill.source}' for ${skill.id}`);
      await deleteLocalSkill(baseDir, skill.id);
    }
  }

  const skillIds = skills.map((s) => s.id);
  return copySkillsToLocalFlattened(skillIds, skillsDir, sourceResult.matrix, sourceResult);
}

export function buildEjectSkillsMap(
  copiedSkills: CopiedSkill[],
): Partial<Record<SkillId, LocalResolvedSkill>> {
  // Boundary cast: Object.fromEntries returns { [k: string]: V }
  return Object.fromEntries(
    copiedSkills
      .filter((cs) => matrix.skills[cs.skillId])
      .map((cs) => [
        cs.skillId,
        {
          id: cs.skillId,
          description: matrix.skills[cs.skillId]!.description,
          path: cs.destPath,
          content: "", // Content not needed for skill references
        },
      ]),
  );
}

async function loadMergedAgents(sourcePath: string): Promise<Record<AgentName, AgentDefinition>> {
  const cliAgents = await loadAllAgents(PROJECT_ROOT);
  const sourceAgents = await loadAllAgents(sourcePath);
  return { ...cliAgents, ...sourceAgents };
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
 * Scope rule (mirrors `isScopeCompatible`): a project-scoped skill is never
 * compatible with a global-scoped agent; every other combination is compatible.
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
  const priorSkillScope = buildScopeLookup(priorSkills);
  const priorAgentScope = buildAgentScopeLookup(priorAgents);

  const gained = new Set<string>();
  const activeCurrentSkills = currentSkills.filter((s) => !s.excluded);
  const activeCurrentAgents = currentAgents.filter((a) => !a.excluded);

  for (const agent of activeCurrentAgents) {
    for (const skill of activeCurrentSkills) {
      const nowCompatible = !(skill.scope === "project" && agent.scope === "global");
      if (!nowCompatible) continue;

      const priorSkillScopeValue = priorSkillScope.get(skill.id);
      const priorAgentScopeValue = priorAgentScope.get(agent.name);
      const wasCompatiblePreviously =
        priorSkillScopeValue !== undefined &&
        priorAgentScopeValue !== undefined &&
        !(priorSkillScopeValue === "project" && priorAgentScopeValue === "global");

      if (!wasCompatiblePreviously) {
        gained.add(scopeEligibilityKey(agent.name, skill.id));
      }
    }
  }
  return gained;
}

function buildScopeLookup(
  entries: readonly SkillConfig[] | undefined,
): Map<SkillId, "project" | "global"> {
  const map = new Map<SkillId, "project" | "global">();
  for (const s of entries ?? []) {
    if (!s.excluded) map.set(s.id, s.scope);
  }
  return map;
}

function buildAgentScopeLookup(
  entries: readonly AgentScopeConfig[] | undefined,
): Map<AgentName, "project" | "global"> {
  const map = new Map<AgentName, "project" | "global">();
  for (const a of entries ?? []) {
    if (!a.excluded) map.set(a.name, a.scope);
  }
  return map;
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

  let loadedStack: Stack | null = null;
  if (wizardResult.selectedStackId) {
    loadedStack = await loadStackById(wizardResult.selectedStackId, sourceResult.sourcePath);
    verbose(
      `buildEjectConfig: loadedStack=${loadedStack ? `found (id='${loadedStack.id}')` : "NOT FOUND"}`,
    );
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

  let localConfig: ProjectConfig;

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

  if (wizardResult.selectedStackId) {
    if (loadedStack) {
      // Overlay the YAML stack as `existingStack` so the ownership-based builder
      // inherits preloaded flags for (agent, category, skill) triples the stack
      // author marked. Ownership rules still govern which agents and categories
      // land in the final stack, so Phase A (init) and Phase B (edit) produce
      // equivalent stacks for the same selection.
      const yamlStack = buildStackProperty(loadedStack);
      const mergedExistingStack: Partial<Record<AgentName, StackAgentConfig>> = {
        ...yamlStack,
        ...existingStack,
      };
      localConfig = generateProjectConfigFromSkills(DEFAULT_PLUGIN_NAME, skillIds, {
        ...agentOptions,
        existingStack: mergedExistingStack,
      });

      localConfig.description = loadedStack.description;
    } else {
      throw new Error(
        `Stack '${wizardResult.selectedStackId}' not found in config/stacks.ts. ` +
          `Available stacks are defined in the CLI's config/stacks.ts file.`,
      );
    }
  } else {
    localConfig = generateProjectConfigFromSkills(DEFAULT_PLUGIN_NAME, skillIds, agentOptions);
  }

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
  const activeSkillIds = new Set(config.skills.filter((s) => !s.excluded).map((s) => s.id));
  const excludedSkillIds = new Set(
    config.skills.filter((s) => s.excluded && !activeSkillIds.has(s.id)).map((s) => s.id),
  );

  // D7 cross-scope safety net: build set of global skill IDs so global agents only see global skills
  const globalSkillIds = new Set(
    config.skills.filter((s) => s.scope === "global" && !s.excluded).map((s) => s.id),
  );

  // D-217: attach per-skill `source` to each SkillReference so the compiler can
  // decide between `${id}:${id}` (plugin) and bare id (eject) on a per-skill
  // basis. Missing entries are intentional — user-authored local skills have no
  // SkillConfig and legitimately carry no source.
  const sourceById = new Map<SkillId, string>(config.skills.map((s) => [s.id, s.source]));

  const compileAgents: Record<string, CompileAgentConfig> = {};
  for (const agentConfig of activeAgents) {
    if (agents[agentConfig.name]) {
      const agentStack = config.stack?.[agentConfig.name];
      if (agentStack) {
        const refs = buildSkillRefsFromConfig(agentStack);
        // Filter out excluded skills; global agents only see global skills (cross-scope safety net)
        const filteredRefs = refs
          .filter(
            (ref) =>
              !excludedSkillIds.has(ref.id) &&
              (agentConfig.scope !== "global" || globalSkillIds.has(ref.id)),
          )
          .map((ref) => ({ ...ref, source: sourceById.get(ref.id) }));
        compileAgents[agentConfig.name] = { skills: filteredRefs };
      } else {
        compileAgents[agentConfig.name] = {};
      }
    }
  }
  return compileAgents;
}

export function buildAgentScopeMap(config: ProjectConfig): Map<AgentName, "project" | "global"> {
  const map = new Map<AgentName, "project" | "global">();
  for (const agent of config.agents.filter((a) => !a.excluded)) {
    map.set(agent.name, agent.scope);
  }
  return map;
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

  const changed =
    newSkills.length > 0 ||
    newAgents.length > 0 ||
    stackChanged ||
    !isDeepEqual(existing.domains ?? [], mergedDomains) ||
    !isDeepEqual(existing.selectedAgents ?? [], mergedSelectedAgents);

  return {
    config: {
      ...existing,
      skills: mergedSkills,
      agents: mergedAgents,
      stack: mergedStack,
      domains: mergedDomains,
      selectedAgents: mergedSelectedAgents,
    },
    changed,
  };
}

/**
 * Registers a project directory in the global config's `projects` array.
 * Paths are normalized via `fs.realpathSync` to resolve symlinks.
 * Filters stale entries (where .claude-src/config.ts no longer exists).
 */
async function registerProjectPath(
  globalConfig: ProjectConfig,
  projectDir: string,
): Promise<{ config: ProjectConfig; changed: boolean }> {
  const normalizedPath = fs.realpathSync(projectDir);
  const existing = globalConfig.projects ?? [];

  // Filter stale entries
  const valid: string[] = [];
  for (const p of existing) {
    const configPath = path.join(p, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
    if (await fileExists(configPath)) {
      valid.push(p);
    }
  }

  if (valid.includes(normalizedPath)) {
    const changed = valid.length !== existing.length;
    return { config: changed ? { ...globalConfig, projects: valid } : globalConfig, changed };
  }

  return { config: { ...globalConfig, projects: [...valid, normalizedPath] }, changed: true };
}

/**
 * Removes a project directory from the global config's `projects` array.
 * Loads global config, removes the path, and writes back if changed.
 */
export async function deregisterProjectPath(projectDir: string): Promise<void> {
  const homeDir = os.homedir();
  const existingGlobal = await loadProjectConfigFromDir(homeDir);
  if (!existingGlobal?.config?.projects?.length) return;

  const normalizedPath = path.resolve(projectDir);
  const filtered = existingGlobal.config.projects.filter((p) => p !== normalizedPath);

  if (filtered.length === existingGlobal.config.projects.length) return;

  const updatedConfig = { ...existingGlobal.config, projects: filtered };
  const globalConfigPath = path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
  await writeConfigFile(updatedConfig, globalConfigPath);
  verbose(`Deregistered project ${normalizedPath} from global config`);
}

function isProjectScopedEntry(entry: { scope?: string; excluded?: boolean }): boolean {
  return entry.scope === "project";
}

function isGlobalTombstone(entry: { scope?: string; excluded?: boolean }): boolean {
  return entry.scope === "global" && !!entry.excluded;
}

/** True when the global config still has an active (non-excluded) skill for this id. */
function globalHasActiveSkill(globalConfig: ProjectConfig, id: SkillId): boolean {
  return globalConfig.skills.some((s) => s.id === id && s.scope === "global" && !s.excluded);
}

/** True when the global config still has an active (non-excluded) agent for this name. */
function globalHasActiveAgent(globalConfig: ProjectConfig, name: AgentName): boolean {
  return globalConfig.agents.some((a) => a.name === name && a.scope === "global" && !a.excluded);
}

/**
 * Keeps a project's own entries when re-inlining fresh global data, dropping tombstones
 * that no longer correspond to a real global install.
 *
 * A tombstone (`scope === "global" && excluded`) only has meaning while the global entry
 * it masks still exists. Once the skill/agent has been removed from the global config,
 * the tombstone is stale — carrying it forward would leave the project showing a masked
 * global item that no longer exists. Project-scoped entries are always retained.
 */
function retainReconciledSkills(skills: SkillConfig[], globalConfig: ProjectConfig): SkillConfig[] {
  return skills.filter(
    (entry) =>
      isProjectScopedEntry(entry) ||
      (isGlobalTombstone(entry) && globalHasActiveSkill(globalConfig, entry.id)),
  );
}

function retainReconciledAgents(
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
 * Prunes a project's inlined `selectedAgents[]` symmetrically with `retainReconciledAgents`.
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
    reconciledAgents.filter((a) => a.scope === "project" && !a.excluded).map((a) => a.name),
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
    globalConfig.skills.filter((s) => s.scope === "global" && !s.excluded).map((s) => s.id),
  );
  const projectOwnedIds = new Set(
    priorProjectSkills.filter((s) => s.scope === "project" && !s.excluded).map((s) => s.id),
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

  const currentNormalized = currentProjectDir ? fs.realpathSync(currentProjectDir) : null;
  const updated: string[] = [];
  const skipped: string[] = [];

  for (const projectPath of projects) {
    // Skip the project currently being installed (it's already being written)
    if (currentNormalized && projectPath === currentNormalized) continue;

    const projectConfigPath = path.join(projectPath, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);
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
      const reconciledAgents = retainReconciledAgents(projectConfig.agents, globalConfig);
      const projectSplit: ProjectConfig = {
        ...projectConfig,
        skills: retainReconciledSkills(projectConfig.skills, globalConfig),
        agents: reconciledAgents,
        stack: retainReconciledStack(projectConfig.stack, removedGlobalSkillIds),
        selectedAgents: retainReconciledSelectedAgents(
          projectConfig.selectedAgents,
          reconciledAgents,
          globalConfig,
        ),
      };

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
      verbose(
        `Failed to propagate to ${projectPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return { updated, skipped };
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
export async function writeScopedConfigs(
  finalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Record<AgentName, AgentDefinition>,
  projectDir: string,
  projectConfigPath: string,
  projectInstallationExists: boolean,
): Promise<void> {
  // Use os.homedir() at runtime (not GLOBAL_INSTALL_ROOT constant) so the path
  // agrees with getGlobalConfigImportPath() which also calls os.homedir() at runtime
  const homeDir = os.homedir();
  const isProjectContext = fs.realpathSync(projectDir) !== fs.realpathSync(homeDir);
  if (!isProjectContext) {
    // Installing from ~/ — write directly to global config (no import preamble)
    await writeConfigFile(finalConfig, projectConfigPath);
    await writeStandaloneConfigTypes(projectConfigPath, matrix, agents, finalConfig);
    // Propagate to all registered projects
    if (finalConfig.projects?.length) {
      const result = await propagateGlobalChangesToProjects(finalConfig, matrix, agents);
      if (result.updated.length > 0) {
        verbose(`Propagated global changes to ${result.updated.length} project(s)`);
      }
    }
    return;
  }

  // Installing from project — split by scope for project config generation.
  const { global: globalConfig, project: projectSplitConfig } = splitConfigByScope(finalConfig);
  const globalConfigPath = path.join(homeDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

  // Merge new global-scoped items into the existing global config.
  // - Existing items are preserved (never removed from global during project init)
  // - New global items are added
  // - If no existing global config, write the full global split
  const existingGlobal = await loadProjectConfigFromDir(homeDir);
  const existingGlobalConfig = existingGlobal?.config;
  const hasGlobalItems = globalConfig.skills.length > 0 || globalConfig.agents.length > 0;

  // Start with existing global config or the new global split
  let effectiveGlobalConfig: ProjectConfig;
  let globalDataChanged = false;

  if (hasGlobalItems) {
    if (existingGlobalConfig) {
      const mergeResult = mergeGlobalConfigs(existingGlobalConfig, globalConfig);
      effectiveGlobalConfig = mergeResult.config;
      globalDataChanged = mergeResult.changed;
    } else {
      effectiveGlobalConfig = globalConfig;
      globalDataChanged = true;
    }
  } else {
    effectiveGlobalConfig = existingGlobalConfig ?? { name: "global", skills: [], agents: [] };
  }

  // Register this project in global config's projects list
  const regResult = await registerProjectPath(effectiveGlobalConfig, projectDir);
  effectiveGlobalConfig = regResult.config;
  const needsGlobalWrite = globalDataChanged || regResult.changed;

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
  if (globalDataChanged && effectiveGlobalConfig.projects?.length) {
    const propagation = await propagateGlobalChangesToProjects(
      effectiveGlobalConfig,
      matrix,
      agents,
      projectDir,
    );
    if (propagation.updated.length > 0) {
      verbose(`Propagated global changes to ${propagation.updated.length} project(s)`);
    }
  }

  // Write project config if the project installation already exists OR if there are project-scoped items.
  // Skip only when no existing project installation AND no project-scoped items — creating an empty
  // project config with just `import globalConfig` and `{ ...globalConfig }` is pointless.
  const hasProjectItems =
    projectSplitConfig.skills.length > 0 || projectSplitConfig.agents.length > 0;

  if (projectInstallationExists || hasProjectItems) {
    // Write project config with import from global
    await ensureDir(path.dirname(projectConfigPath));
    await writeConfigFile(projectSplitConfig, projectConfigPath, {
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
): {
  extraSkillIds: string[];
  extraAgentNames: string[];
  extraDomains: string[];
  extraCategories: string[];
} {
  const projectSkills = finalConfig.skills.filter((s) => s.scope === "project" && !s.excluded);
  const projectAgents = finalConfig.agents.filter((a) => a.scope === "project" && !a.excluded);

  const extraSkillIds = unique(projectSkills.map((s) => s.id));
  const extraAgentNames = unique(projectAgents.map((a) => a.name));

  const projectCategories = unique(
    projectSkills
      .map((s) => matrix.skills[s.id]?.category)
      .filter((c): c is Category => c !== undefined && c !== "local"),
  );
  const projectDomains = unique(
    projectCategories
      .map((c) => matrix.categories[c]?.domain)
      .filter((d): d is NonNullable<typeof d> => d !== undefined),
  );

  return {
    extraSkillIds,
    extraAgentNames,
    extraDomains: projectDomains,
    extraCategories: projectCategories,
  };
}

async function compileAndWriteAgents(
  compileConfig: CompileConfig,
  agents: Record<AgentName, AgentDefinition>,
  localSkills: Partial<Record<SkillId, LocalResolvedSkill>>,
  sourceResult: SourceLoadResult,
  projectDir: string,
  agentsDir: string,
  installMode?: InstallMode,
  agentScopeMap?: Map<AgentName, "project" | "global">,
): Promise<AgentName[]> {
  const engine = await createLiquidEngine(projectDir);
  const resolvedAgents = await resolveAgents(
    agents,
    localSkills,
    compileConfig,
    sourceResult.sourcePath,
  );

  const globalAgentsDir = path.join(os.homedir(), CLAUDE_DIR, "agents");

  // Ensure both directories exist before writing agents.
  // ensureDir is idempotent (mkdir -p), so calling it when dirs already exist is safe.
  await ensureDir(globalAgentsDir);

  const compiledAgentNames: AgentName[] = [];
  for (const [name, agent] of typedEntries<AgentName, AgentConfig>(resolvedAgents)) {
    // D-217: `installMode` is no longer passed — per-skill `source` on each
    // SkillReference drives pluginRef attachment inside compileAgentForPlugin.
    // Parameter retained in this wrapper's signature to preserve caller contracts
    // (consolidation is a separate follow-up).
    const output = await compileAgentForPlugin(name, agent, sourceResult.sourcePath, engine);

    // Route agent output by scope: global agents go to ~/. project agents to projectDir
    const scope = agentScopeMap?.get(name) ?? "project";
    const targetDir = scope === "global" ? globalAgentsDir : agentsDir;
    await writeFile(path.join(targetDir, `${name}.md`), output);
    compiledAgentNames.push(name);
  }

  return compiledAgentNames;
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
  const isProjectInstall = fs.realpathSync(projectDir) !== fs.realpathSync(os.homedir());
  if (isProjectInstall) {
    await ensureDir(projectPaths.agentsDir);
  }
  await ensureDir(path.dirname(projectPaths.configPath));

  const agents = await loadMergedAgents(sourceResult.sourcePath);
  const mergeResult = await buildAndMergeConfig(wizardResult, sourceResult, projectDir, sourceFlag);
  const finalConfig = mergeResult.config;

  // During init, the project installation is being created — it exists if we're in a project context
  const projectInstallationExists = fs.realpathSync(projectDir) !== fs.realpathSync(os.homedir());

  await writeScopedConfigs(
    finalConfig,
    sourceResult.matrix,
    agents,
    projectDir,
    projectPaths.configPath,
    projectInstallationExists,
  );

  const compileAgentsConfig = buildCompileAgents(finalConfig, agents);
  const compileConfig: CompileConfig = {
    name: DEFAULT_PLUGIN_NAME,
    description:
      finalConfig.description || `Plugin setup with ${wizardResult.skills.length} skills`,
    agents: compileAgentsConfig,
  };
  // Load skill metadata from source for compilation
  // (actual skill content will be loaded from plugins at runtime)
  const stackSkillIds = finalConfig.stack ? getStackSkillIds(finalConfig.stack) : [];
  // Boundary cast: loadSkillsByIds returns SkillDefinitionMap, LocalResolvedSkill extends SkillDefinition
  const skillsForCompilation = (await loadSkillsByIds(
    stackSkillIds.map((id) => ({ id })),
    sourceResult.sourcePath,
  )) as Partial<Record<SkillId, LocalResolvedSkill>>;

  const compiledAgentNames = await compileAndWriteAgents(
    compileConfig,
    agents,
    skillsForCompilation,
    sourceResult,
    projectDir,
    projectPaths.agentsDir,
    deriveInstallMode(finalConfig.skills),
    buildAgentScopeMap(finalConfig),
  );

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

  // Split skills by scope for path routing
  const projectSkills = wizardResult.skills.filter((s) => s.scope !== "global");
  const globalSkills = wizardResult.skills.filter((s) => s.scope === "global");

  // Create directories based on installation context, not data content.
  // ensureDir is idempotent (mkdir -p), so calling it when dirs already exist is safe.
  const homeDir = os.homedir();
  const isProjectInstall = fs.realpathSync(projectDir) !== fs.realpathSync(homeDir);
  if (isProjectInstall) {
    await prepareDirectories(projectPaths);
  } else {
    // Always ensure .claude-src/ exists for config (even when installing from ~/)
    await ensureDir(path.dirname(projectPaths.configPath));
  }
  // Always ensure global skills directory exists when there is a global installation context
  await ensureDir(globalPaths.skillsDir);

  // Copy skills to their scope-appropriate directories
  const projectCopied =
    projectSkills.length > 0
      ? await deleteAndCopySkills(projectSkills, sourceResult, projectDir, projectPaths.skillsDir)
      : [];
  const globalCopied =
    globalSkills.length > 0
      ? await deleteAndCopySkills(globalSkills, sourceResult, os.homedir(), globalPaths.skillsDir)
      : [];
  const copiedSkills = [...projectCopied, ...globalCopied];

  const ejectSkillsForResolution = buildEjectSkillsMap(copiedSkills);

  const agents = await loadMergedAgents(sourceResult.sourcePath);
  const mergeResult = await buildAndMergeConfig(wizardResult, sourceResult, projectDir, sourceFlag);
  const finalConfig = mergeResult.config;

  // During init, the project installation is being created — it exists if we're in a project context
  const isProjectContext = fs.realpathSync(projectDir) !== fs.realpathSync(os.homedir());

  await writeScopedConfigs(
    finalConfig,
    sourceResult.matrix,
    agents,
    projectDir,
    projectPaths.configPath,
    isProjectContext,
  );

  const compileAgentsConfig = buildCompileAgents(finalConfig, agents);
  const compileConfig: CompileConfig = {
    name: DEFAULT_PLUGIN_NAME,
    description: finalConfig.description || `Eject setup with ${wizardResult.skills.length} skills`,
    agents: compileAgentsConfig,
  };
  const compiledAgentNames = await compileAndWriteAgents(
    compileConfig,
    agents,
    ejectSkillsForResolution,
    sourceResult,
    projectDir,
    projectPaths.agentsDir,
    deriveInstallMode(finalConfig.skills),
    buildAgentScopeMap(finalConfig),
  );

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
