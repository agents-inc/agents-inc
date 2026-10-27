import fs from "fs";
import { isDeepEqual, unique } from "remeda";
import type {
  AgentDefinition,
  AgentName,
  Category,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillAssignment,
  SkillId,
  StackAgentConfig,
} from "../../types";
import type { AgentScopeConfig, SkillConfig } from "../../types/config";
import type { Provider } from "../../consts";
import { getInstalledConfigPath, getProjectConfigPath } from "../installation/install-base-dir";
import { detectInstallations } from "../installation/detect-installations";
import { providerInUse, sourceFolderInUse } from "../installation/install-layout";
import {
  ConfigLoadError,
  declaresNoContent,
  loadInstalledConfig,
  type LoadedProjectConfig,
} from "../configuration/project-config";
import { mergeConfigs, type AuthoritativeScope } from "../configuration/config-merger";
import {
  activeProjectAgentNames,
  isActiveAt,
  isGlobalTombstone,
} from "../configuration/scope-predicates";
import { generateConfigSource, type ConfigSourceOptions } from "../configuration/config-writer";
import {
  buildConfigTypesBackgroundData,
  type ConfigTypesExtras,
  deriveCategories,
  deriveDomains,
  regenerateConfigTypes,
} from "../configuration/config-types-writer";
// Inside the fan-out this is the seat `withCatalogueSeatedFor` gave the current project.
import { matrix as activeMatrix } from "../matrix/matrix-provider";
import { withCatalogueSeatedFor } from "../loading/catalogue-seat.js";
import { fileExists, writeFile } from "../../utils/fs";
import { getErrorMessage } from "../../utils/errors";
import { verbose } from "../../utils/logger";
import { typedEntries, typedKeys } from "../../utils/typed-object";
import { LOCAL_PSEUDO_CATEGORY } from "../../consts";
import { addSessionToGlobal, type ResolvedGlobalConfig } from "@workspace/compile/global-config";

export { mergeGlobalConfigs } from "@workspace/compile/global-config";

export async function writeConfigFile(
  config: ProjectConfig,
  configPath: string,
  options?: ConfigSourceOptions,
): Promise<void> {
  const source = generateConfigSource(config, activeMatrix, options);
  await writeFile(configPath, source);
}

/** The one normalization for `projects` comparisons; resolves symlinks, throws if missing. */
export function normalizeProjectPath(projectDir: string): string {
  return fs.realpathSync(projectDir);
}

/** Filters stale entries whose config.ts no longer exists. */
async function registerProjectPath(
  globalConfig: ProjectConfig,
  projectDir: string,
): Promise<{ config: ProjectConfig; changed: boolean }> {
  const normalizedPath = normalizeProjectPath(projectDir);
  const existing = globalConfig.projects ?? [];
  const valid = await projectsStillInstalled(existing);

  if (valid.includes(normalizedPath)) {
    const changed = valid.length !== existing.length;
    return { config: changed ? { ...globalConfig, projects: valid } : globalConfig, changed };
  }

  return { config: { ...globalConfig, projects: [...valid, normalizedPath] }, changed: true };
}

async function projectsStillInstalled(projects: string[]): Promise<string[]> {
  const installed = await Promise.all(
    projects.map((project) => fileExists(getInstalledConfigPath(project))),
  );
  return projects.filter((_, index) => installed[index] === true);
}

function globalHasActiveSkill(globalConfig: ProjectConfig, id: SkillId): boolean {
  return globalConfig.skills.some((s) => s.id === id && isActiveAt(s, "global"));
}

function globalHasActiveAgent(globalConfig: ProjectConfig, name: AgentName): boolean {
  return globalConfig.agents.some((a) => a.name === name && isActiveAt(a, "global"));
}

/** Keeps project-scoped entries and drops tombstones whose global entry is gone. */
function retainProjectOwnedSkills(
  skills: SkillConfig[],
  globalConfig: ProjectConfig,
): SkillConfig[] {
  return skills.filter(
    (entry) =>
      entry.scope === "project" ||
      (isGlobalTombstone(entry) && globalHasActiveSkill(globalConfig, entry.id)),
  );
}

function retainProjectOwnedAgents(
  agents: AgentScopeConfig[],
  globalConfig: ProjectConfig,
): AgentScopeConfig[] {
  return agents.filter(
    (entry) =>
      entry.scope === "project" ||
      (isGlobalTombstone(entry) && globalHasActiveAgent(globalConfig, entry.name)),
  );
}

/**
 * Undefined for an id the matrix lacks or a `local` skill; neither participates in category rules.
 */
function categoryOfSkill(id: SkillId, matrix: MergedSkillsMatrix): Category | undefined {
  const category = matrix.skills[id]?.category;
  if (category === undefined || category === LOCAL_PSEUDO_CATEGORY) return undefined;
  return category;
}

/** From the merged matrix, so source overrides count; an undeclared category is not exclusive. */
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

/** IDENTITY (same id at project scope) or CATEGORY (exclusive category); shared with self-heal. */
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

/** A derived mask is byte-identical to a user tombstone, so it stays while its collision does. */
function dropOrphanedDerivedMasks(
  projectOwnedSkills: SkillConfig[],
  matrix: MergedSkillsMatrix,
): SkillConfig[] {
  const collidesWithProjectOwnership = buildProjectCollisionTest(projectOwnedSkills, matrix);
  return projectOwnedSkills.filter(
    (entry) => !isGlobalTombstone(entry) || collidesWithProjectOwnership(entry.id),
  );
}

/** Agents have no categories, so only an identity collision justifies a mask. */
function dropOrphanedDerivedAgentMasks(projectOwnedAgents: AgentScopeConfig[]): AgentScopeConfig[] {
  const ownedNames = new Set(activeProjectAgentNames(projectOwnedAgents));
  return projectOwnedAgents.filter(
    (entry) => !isGlobalTombstone(entry) || ownedNames.has(entry.name),
  );
}

/**
 * Tombstones masking live global skills that collide with what the project owns; the project's own
 * skill wins. Spread from the global entry so they carry its `origin`. Idempotent.
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

/** Identity collisions only: agents have no categories. */
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
 * Run at both sites that inline `globalConfig` into a project config. Self-heal precedes masking,
 * and masking is project-local: the global config is never rewritten.
 */
export function reconcileProjectSplitAgainstGlobal(
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
 * Global skills the project inherited that are no longer active globally and that it does not own.
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
        (s) => isActiveAt(s, "global") && !activeGlobalIds.has(s.id) && !projectOwnedIds.has(s.id),
      )
      .map((s) => s.id),
  );
}

/** Drops only the removed ids and any category or agent left empty; unchanged when none were. */
function retainReconciledStack(
  stack: Record<string, StackAgentConfig> | undefined,
  removedGlobalSkillIds: Set<SkillId>,
): Record<string, StackAgentConfig> | undefined {
  if (!stack || removedGlobalSkillIds.size === 0) return stack;

  const reconciled: Record<string, StackAgentConfig> = {};
  for (const [agent, agentStack] of Object.entries(stack)) {
    const reconciledAgentStack = withoutRemovedAssignments(agentStack, removedGlobalSkillIds);
    if (typedKeys<Category>(reconciledAgentStack).length > 0) {
      reconciled[agent] = reconciledAgentStack;
    }
  }
  return reconciled;
}

/** A category the pruning empties is left out. */
function withoutRemovedAssignments(
  agentStack: StackAgentConfig,
  removedGlobalSkillIds: Set<SkillId>,
): StackAgentConfig {
  const reconciledAgentStack: StackAgentConfig = {};
  for (const [category, assignments] of typedEntries<Category, SkillAssignment[]>(agentStack)) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
    if (!assignments) continue;
    const kept = assignments.filter((assignment) => !removedGlobalSkillIds.has(assignment.id));
    if (kept.length > 0) reconciledAgentStack[category] = kept;
  }
  return reconciledAgentStack;
}

/** Each registered project lands in exactly one list. */
export type PropagationResult = {
  updated: string[];
  /** Its `config.ts` is there and cannot be loaded. */
  unreadable: string[];
  /** Nothing is installed at the registered path any more. */
  gone: string[];
  /** It holds another provider's installation, not this one's. */
  notOurs: string[];
  /** Its rewrite threw: its catalogue would not load, or its pair could not be written. */
  failed: string[];
};

export type PropagationOptions = {
  /** False for a change that moves no type union. */
  regenerateTypes?: boolean;
};

/** The one project pair writer; extras come from the effective config so the pair agrees. */
export async function writeProjectConfigPair(
  projectDir: string,
  provider: Provider,
  reconciledSplit: ProjectConfig,
  effectiveGlobal: ProjectConfig,
  matrix: MergedSkillsMatrix,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  options: PropagationOptions = {},
): Promise<void> {
  const configPath = refuseAWriteOutsideTheInstallation(projectDir, provider);

  // Both halves from the same reconciled data, so neither describes a config the other does not.
  await writeConfigFile(reconciledSplit, configPath, {
    isProjectConfig: true,
    globalConfig: effectiveGlobal,
  });

  if (options.regenerateTypes === false) return;

  // The global-aware path, so a global-scope install keeps the project's import-form types.
  await regenerateConfigTypes(
    projectDir,
    Promise.resolve(buildConfigTypesBackgroundData(matrix, agents)),
    buildProjectTypesExtras(inlinedProjectView(reconciledSplit, effectiveGlobal), matrix),
  );
}

/** The project's own reconciled entries plus everything the global config contributes. */
function inlinedProjectView(
  reconciledSplit: ProjectConfig,
  effectiveGlobal: ProjectConfig,
): ProjectConfig {
  return {
    ...reconciledSplit,
    skills: [...effectiveGlobal.skills, ...reconciledSplit.skills],
    agents: [...effectiveGlobal.agents, ...reconciledSplit.agents],
    selectedDomains: unique([
      ...(effectiveGlobal.selectedDomains ?? []),
      ...(reconciledSplit.selectedDomains ?? []),
    ]),
    stack: { ...(effectiveGlobal.stack ?? {}), ...(reconciledSplit.stack ?? {}) },
  };
}

/** Project-scoped entries and live tombstones; `onDisk.skills` reveals just-removed globals. */
function reconcileAgainstGlobal(
  onDisk: ProjectConfig,
  globalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): ProjectConfig {
  const removedGlobalSkillIds = computeRemovedGlobalSkillIds(onDisk.skills, globalConfig);
  const reconciledStack = retainReconciledStack(onDisk.stack, removedGlobalSkillIds);

  return reconcileProjectSplitAgainstGlobal(
    {
      ...onDisk,
      skills: retainProjectOwnedSkills(onDisk.skills, globalConfig),
      agents: retainProjectOwnedAgents(onDisk.agents, globalConfig),
      ...(reconciledStack !== undefined && { stack: reconciledStack }),
    },
    globalConfig,
    matrix,
  );
}

/**
 * The caller's believed provider checked against the installation on disk: two independent reads.
 */
function refuseAWriteOutsideTheInstallation(projectDir: string, provider: Provider): string {
  const installed = providerInUse(projectDir);
  const configPath = getProjectConfigPath(projectDir, provider);

  if (installed !== provider) {
    throw new Error(
      `Refusing to write ${configPath}: ${projectDir} holds the ${installed} installation at ` +
        `${sourceFolderInUse(projectDir, installed).dir}, not a ${provider} one.`,
    );
  }
  return configPath;
}

/**
 * The installation a fan-out rewrites. A config declaring nothing is none: it is the user's file
 * (owner, 2026-10-24), so it is passed over as a project holding nothing is.
 */
async function installationToRewrite(projectPath: string): Promise<LoadedProjectConfig | null> {
  const loaded = await loadInstalledConfig(projectPath);
  return loaded !== null && !declaresNoContent(loaded.config) ? loaded : null;
}

/** Looks everything up in this project's own seated catalogue. False where nothing is installed. */
async function propagateToProject(
  projectPath: string,
  provider: Provider,
  globalConfig: ProjectConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  options: PropagationOptions,
): Promise<boolean> {
  // Before the catalogue load, whose refusal of this config is indistinguishable from others.
  const existingProject = await installationToRewrite(projectPath);
  if (existingProject === null) return false;

  return withCatalogueSeatedFor(projectPath, async (catalogue) => {
    const projectSplit = reconcileAgainstGlobal(existingProject.config, globalConfig, catalogue);

    await writeProjectConfigPair(
      projectPath,
      provider,
      projectSplit,
      globalConfig,
      catalogue,
      agents,
      { regenerateTypes: options.regenerateTypes ?? true },
    );
    return true;
  });
}

/** No catalogue parameter: each project's own is loaded; a failed load lands in `failed`. */
export async function propagateGlobalChangesToProjects(
  globalConfig: ProjectConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  provider: Provider,
  currentProjectDir?: string,
  options: PropagationOptions = {},
): Promise<PropagationResult> {
  const projects = globalConfig.projects ?? [];
  const result: PropagationResult = {
    updated: [],
    unreadable: [],
    gone: [],
    notOurs: [],
    failed: [],
  };
  if (projects.length === 0) return result;

  const currentNormalized = currentProjectDir ? normalizeProjectPath(currentProjectDir) : null;

  // Sequential: each propagation seats its project's catalogue in the module-wide singleton.
  for (const projectPath of projects) {
    if (currentNormalized && projectPath === currentNormalized) continue;

    const outcome = await propagateToRegisteredProject(
      projectPath,
      provider,
      globalConfig,
      agents,
      options,
    );
    result[outcome].push(projectPath);
  }

  return result;
}

/** No skip reason stops the fan-out. Installation presence is asked first, of every provider. */
async function propagateToRegisteredProject(
  projectPath: string,
  provider: Provider,
  globalConfig: ProjectConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  options: PropagationOptions,
): Promise<keyof PropagationResult> {
  const installed = await providersInstalledAt(projectPath);
  if (installed.length === 0) {
    verbose(`Skipped propagation to ${projectPath} (nothing installed there)`);
    return "gone";
  }

  const notOurs = whyThisProjectIsNotOurs(projectPath, provider, installed);
  if (notOurs !== null) {
    verbose(`Skipped propagation to ${projectPath} (${notOurs})`);
    return "notOurs";
  }

  try {
    if (!(await propagateToProject(projectPath, provider, globalConfig, agents, options))) {
      return "gone";
    }
    verbose(`Propagated global changes to ${projectPath}`);
    return "updated";
  } catch (error) {
    verbose(`Failed to propagate to ${projectPath}: ${getErrorMessage(error)}`);
    return error instanceof ConfigLoadError ? "unreadable" : "failed";
  }
}

/**
 * The registered projects a fan-out would rewrite, asked before one runs: the same skips it makes,
 * so a project it would pass over is not promised a rewrite.
 */
export async function projectsAFanOutReaches(
  projects: readonly string[],
  provider: Provider,
): Promise<string[]> {
  const reached = await Promise.all(
    projects.map(async (projectPath) =>
      (await wouldBeRewritten(projectPath, provider)) ? [projectPath] : [],
    ),
  );
  return reached.flat();
}

async function wouldBeRewritten(projectPath: string, provider: Provider): Promise<boolean> {
  const installed = await providersInstalledAt(projectPath);
  if (whyThisProjectIsNotOurs(projectPath, provider, installed) !== null) return false;
  try {
    return (await installationToRewrite(projectPath)) !== null;
  } catch {
    // DEGRADE: the fan-out skips any project it cannot load, and says why once it has run.
    return false;
  }
}

/**
 * Every provider whose installation is at `projectPath`, this fan-out's or another's, by the roster:
 * a config declaring nothing is none (owner, 2026-10-24). Asked before `providerInUse` reads the
 * project, since that read counts such a config until the roster has recorded it.
 */
async function providersInstalledAt(projectPath: string): Promise<Provider[]> {
  const found = await detectInstallations(projectPath);
  return found
    .filter((installation) => installation.scope === "project")
    .map((installation) => installation.provider);
}

/** `null` when ours to rewrite. A `providerInUse` refusal skips the project, never aborts. */
function whyThisProjectIsNotOurs(
  projectPath: string,
  provider: Provider,
  installed: readonly Provider[],
): string | null {
  const notOurs = `not a ${provider} installation`;
  try {
    if (providerInUse(projectPath) !== provider) return notOurs;
  } catch (error) {
    return getErrorMessage(error);
  }
  return installed.includes(provider) ? null : notOurs;
}

/**
 * Reuses the fan-out with an emptied global config. Call it after the global manifest is removed;
 * unreachable dirs are reported, never thrown.
 */
export async function pruneGlobalEntriesFromRegisteredProjects(
  globalConfig: ProjectConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
  provider: Provider,
): Promise<PropagationResult> {
  const emptiedGlobal: ProjectConfig = {
    ...globalConfig,
    skills: [],
    agents: [],
  };
  return propagateGlobalChangesToProjects(emptiedGlobal, agents, provider);
}

/** `globalDataChanged` gates propagation and `changed` the write; `"all"` matches the session. */
export async function resolveEffectiveGlobalConfig(
  globalSplit: ProjectConfig,
  existingGlobalConfig: ProjectConfig | undefined,
  projectDir: string,
  authority?: AuthoritativeScope,
): Promise<{ config: ProjectConfig; globalDataChanged: boolean; changed: boolean }> {
  const merged =
    authority === "all"
      ? matchGlobalToSession(globalSplit, existingGlobalConfig)
      : addSessionToGlobal(globalSplit, existingGlobalConfig, activeMatrix);

  const registration = await registerProjectPath(merged.config, projectDir);
  return {
    config: registration.config,
    globalDataChanged: merged.changed,
    changed: merged.changed || registration.changed,
  };
}

/** Makes the global config MATCH a confirmed `edit --from` session, even an empty one. */
function matchGlobalToSession(
  globalSplit: ProjectConfig,
  existingGlobalConfig: ProjectConfig | undefined,
): ResolvedGlobalConfig {
  if (!existingGlobalConfig) return { config: globalSplit, changed: true };

  const config = mergeConfigs(globalSplit, existingGlobalConfig, { authoritativeScope: "all" });
  return { config, changed: !isDeepEqual(config, existingGlobalConfig) };
}

/** Category keys the emitted stack holds, across every agent it configures. */
function stackCategories(stack: ProjectConfig["stack"]): Category[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
  return Object.values(stack ?? {}).flatMap((agentStack) => typedKeys<Category>(agentStack ?? {}));
}

/** Extras from ALL active entries: the project's config.ts inlines the active global rows. */
export function buildProjectTypesExtras(
  finalConfig: ProjectConfig,
  matrix: MergedSkillsMatrix,
): Required<ConfigTypesExtras> {
  const activeSkills = finalConfig.skills.filter((s) => !s.excluded);
  const activeAgents = finalConfig.agents.filter((a) => !a.excluded);

  const extraSkillIds = unique(activeSkills.map((s) => s.id));
  const extraAgentNames = unique(activeAgents.map((a) => a.name));

  const extraCategories = unique([
    ...deriveCategories(extraSkillIds, matrix),
    ...stackCategories(finalConfig.stack),
  ]);
  const extraDomains = unique([
    ...deriveDomains(extraCategories, matrix),
    ...(finalConfig.selectedDomains ?? []),
  ]);

  return { extraSkillIds, extraAgentNames, extraDomains, extraCategories };
}
