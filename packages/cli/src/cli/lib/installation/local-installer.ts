import os from "os";
import path from "path";
import { unique } from "remeda";
import type {
  AgentDefinition,
  AgentName,
  CompileAgentConfig,
  ProjectConfig,
  SkillId,
  SkillReference,
  Stack,
  StackAgentConfig,
} from "../../types";
import { isHomeDirectory } from "./is-home-directory";
import type { AgentScopeConfig, SkillConfig, SkillScope } from "../../types/config";
import type { WizardResultV2 } from "../../components/wizard/wizard";
import {
  type MergeResult,
  type AuthoritativeScope,
  mergeWithExistingConfig,
  loadProjectConfig,
  loadInstalledConfig,
} from "../configuration";
import { type SourceLoadResult } from "../loading";
import { loadStackById, stackNotOfferedMessage } from "../stacks";
import { buildSkillRefsFromConfig } from "../resolver";
import { generateProjectConfigFromSkills, buildStackProperty } from "../configuration";
import { scopeEligibilityKey, isScopePairCompatible } from "../configuration/config-generator";
import {
  isActiveAt,
  activeSkillScopeMap,
  activeAgentScopeMap,
  effectivelyExcludedSkillIds,
} from "../configuration/scope-predicates";
import { verbose } from "../../utils/logger";
import { typedFromEntries } from "../../utils/typed-object";
import { DEFAULT_PLUGIN_NAME } from "../../consts";

/**
 * Excluded entries do not count, so un-excluding a skill makes it new. With no prior config
 * (first init) every current skill is new, which the generator's seeding branch handles.
 */
function computeNewlyAddedSkillIds(
  currentSkills: readonly SkillConfig[],
  priorSkills: readonly SkillConfig[] | undefined,
): readonly SkillId[] {
  const priorActiveIds = new Set((priorSkills ?? []).filter((s) => !s.excluded).map((s) => s.id));
  const currentActiveIds = currentSkills.filter((s) => !s.excluded).map((s) => s.id);
  return unique(currentActiveIds.filter((id) => !priorActiveIds.has(id)));
}

/** Admits scope flips `computeNewlyAddedSkillIds` cannot see; keys from `scopeEligibilityKey`. */
function computeScopeEligibilityGained(
  currentSkills: readonly SkillConfig[],
  currentAgents: readonly AgentScopeConfig[],
  priorSkills: readonly SkillConfig[] | undefined,
  priorAgents: readonly AgentScopeConfig[] | undefined,
): ReadonlySet<string> {
  const priorSkillScope = activeSkillScopeMap(priorSkills);
  const priorAgentScope = activeAgentScopeMap(priorAgents);
  const gainedCompatibility = (skill: SkillConfig, agent: AgentScopeConfig): boolean =>
    isScopePairCompatible(skill.scope, agent.scope) &&
    !wereScopeCompatible(priorSkillScope.get(skill.id), priorAgentScope.get(agent.name));

  const activeCurrentSkills = currentSkills.filter((s) => !s.excluded);
  const activeCurrentAgents = currentAgents.filter((a) => !a.excluded);

  const gainedKeys = activeCurrentAgents.flatMap((agent) =>
    activeCurrentSkills
      .filter((skill) => gainedCompatibility(skill, agent))
      .map((skill) => scopeEligibilityKey(agent.name, skill.id)),
  );
  return new Set(gainedKeys);
}

function wereScopeCompatible(
  priorSkillScope: SkillScope | undefined,
  priorAgentScope: SkillScope | undefined,
): boolean {
  return (
    priorSkillScope !== undefined &&
    priorAgentScope !== undefined &&
    isScopePairCompatible(priorSkillScope, priorAgentScope)
  );
}

/**
 * Per-`(skill, agent)` assignments REPLACE the ownership-derived stack: ownership rules would hand
 * every compatible skill to every agent and inherit `preloaded` from elsewhere, undoing the
 * sharer's curation. A payload's stack id is not expanded either, for the same reason. With no
 * agents selected the key is absent, so the merger keeps the stack on disk.
 */
function resolveStackProperty(
  generated: ProjectConfig["stack"],
  assigned: WizardResultV2["assignedStack"],
): ProjectConfig["stack"] {
  return generated && assigned ? assigned : generated;
}

/**
 * A loaded stack (wizard path) wins over a carried description (`init --from`, `stackId: null`).
 */
function resolveDescription(
  loadedStack: Stack | null,
  shared: WizardResultV2["description"],
): string | undefined {
  return loadedStack === null ? shared : loadedStack.description;
}

/**
 * A project config is named for its directory. At `$HOME` the basename is the OS account name, so
 * the global config takes the product constant. An existing config keeps its name (`mergeConfigs`).
 */
function configNameFor(projectDir: string): string {
  return isHomeDirectory(projectDir) ? DEFAULT_PLUGIN_NAME : path.basename(projectDir);
}

/**
 * A global sub-agent's curation lives only in the global config: the project's stack holds
 * project-scoped agents alone, so reading it by itself would reseed an agent `s` just moved into
 * the project. The project's row wins per agent. The global config is read, never written.
 */
async function loadCuratedStack(
  projectDir: string,
  projectStack: ProjectConfig["stack"],
): Promise<Partial<Record<AgentName, StackAgentConfig>>> {
  // At `$HOME` the loaded config IS the global one.
  const globalStack = isHomeDirectory(projectDir) ? undefined : await loadGlobalStack();

  // The declared return type narrows the keys to AgentName, so no cast is needed.
  return { ...globalStack, ...projectStack };
}

async function loadGlobalStack(): Promise<ProjectConfig["stack"]> {
  return (await loadInstalledConfig(os.homedir()))?.config.stack;
}

async function buildInstallConfig(
  wizardResult: WizardResultV2,
  sourceResult: SourceLoadResult,
  projectDir: string,
): Promise<{ config: ProjectConfig; loadedStack: Stack | null }> {
  const skillIds = unique(wizardResult.skills.map((s) => s.id));
  verbose(
    `buildInstallConfig: selectedStackId='${wizardResult.selectedStackId}', ` +
      `skills=[${skillIds.join(", ")}], ` +
      `selectedAgents=[${wizardResult.selectedAgents.join(", ")}]`,
  );

  const loadedStack = await loadSelectedStack(wizardResult.selectedStackId, sourceResult);
  const existing = await loadProjectConfig(projectDir);
  const existingStack = await loadCuratedStack(projectDir, existing?.config.stack);

  const options = generatorOptionsFor(
    wizardResult,
    existing?.config,
    stackToPreserve(loadedStack, existingStack),
  );
  const generated = generateProjectConfigFromSkills(configNameFor(projectDir), skillIds, options);
  const stack = resolveStackProperty(generated.stack, wizardResult.assignedStack);
  const description = resolveDescription(loadedStack, wizardResult.description);
  const localConfig: ProjectConfig = {
    ...generated,
    ...(stack && { stack }),
    ...(description !== undefined && { description }),
  };

  verbose(
    `buildInstallConfig result: stack=${stackSizeForLog(localConfig.stack)}, ` +
      `agents=[${localConfig.agents.map((a) => a.name).join(", ")}], skills=${localConfig.skills.length}`,
  );

  return { config: localConfig, loadedStack };
}

/**
 * Lets a caller refuse before writing anything (the `--from` producers do); the install's own
 * lookup is only the backstop, landing after plugins are installed.
 */
export async function refuseUnofferedStack(
  stackId: WizardResultV2["selectedStackId"],
  sourceResult: SourceLoadResult,
): Promise<void> {
  await loadSelectedStack(stackId, sourceResult);
}

async function loadSelectedStack(
  stackId: WizardResultV2["selectedStackId"],
  sourceResult: SourceLoadResult,
): Promise<Stack | null> {
  if (!stackId) return null;

  const { source } = sourceResult.sourceConfig;
  const loadedStack = await loadStackById(stackId, sourceResult.sourcePath, source);
  verbose(
    `buildInstallConfig: loadedStack=${loadedStack ? `found (id='${loadedStack.id}')` : "NOT FOUND"}`,
  );
  if (!loadedStack) throw new Error(stackNotOfferedMessage(stackId, source));

  return loadedStack;
}

/**
 * The curated stack on disk, over any stack this install applies. An applied stack's entries reach
 * the builder with a load already decided by `buildStackProperty`, so it is a new selection, never
 * a curated lazy. The on-disk stack spreads last and wins per agent.
 */
function stackToPreserve(
  loadedStack: Stack | null,
  curatedStack: Partial<Record<AgentName, StackAgentConfig>>,
): Partial<Record<AgentName, StackAgentConfig>> {
  if (loadedStack === null) return curatedStack;
  return { ...buildStackProperty(loadedStack), ...curatedStack };
}

/**
 * `skillConfigs` and `agentConfigs` always accompany `selectedAgents`, so no scope lookup defaults
 * silently. The two deltas drive per-agent curation; with no persisted config both mean
 * "everything is new".
 */
function generatorOptionsFor(
  wizardResult: WizardResultV2,
  persisted: ProjectConfig | undefined,
  existingStack: Partial<Record<AgentName, StackAgentConfig>>,
): {
  selectedAgents?: AgentName[];
  skillConfigs: SkillConfig[];
  agentConfigs: AgentScopeConfig[];
  existingStack: Partial<Record<AgentName, StackAgentConfig>>;
  newlyAddedSkillIds: readonly SkillId[];
  scopeEligibilityGained: ReadonlySet<string>;
} {
  return {
    skillConfigs: wizardResult.skills,
    agentConfigs: wizardResult.agentConfigs,
    existingStack,
    newlyAddedSkillIds: computeNewlyAddedSkillIds(wizardResult.skills, persisted?.skills),
    scopeEligibilityGained: computeScopeEligibilityGained(
      wizardResult.skills,
      wizardResult.agentConfigs,
      persisted?.skills,
      persisted?.agents,
    ),
    ...(wizardResult.selectedAgents.length > 0 && {
      selectedAgents: wizardResult.selectedAgents,
    }),
  };
}

function stackSizeForLog(stack: ProjectConfig["stack"]): string {
  return stack ? `${Object.keys(stack).length} agents` : "UNDEFINED";
}

export function setConfigMetadata(
  config: ProjectConfig,
  wizardResult: WizardResultV2,
  sourceResult: SourceLoadResult,
  sourceFlag?: string,
): ProjectConfig {
  const result = { ...config };

  if (wizardResult.selectedDomains.length > 0) {
    result.selectedDomains = wizardResult.selectedDomains;
  }

  if (sourceFlag) {
    result.marketplace = sourceFlag;
  } else if (sourceResult.sourceConfig.source) {
    result.marketplace = sourceResult.sourceConfig.source;
  }

  if (sourceResult.marketplace) {
    result.marketplaceName = sourceResult.marketplace;
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
  const { config } = await buildInstallConfig(wizardResult, sourceResult, projectDir);
  verbose(`buildAndMergeConfig: before merge — stack=${stackSizeForLog(config.stack)}`);
  const configWithMetadata = setConfigMetadata(config, wizardResult, sourceResult, sourceFlag);
  const result = await mergeWithExistingConfig(configWithMetadata, {
    projectDir,
    ...(authoritativeScope !== undefined && { authoritativeScope }),
  });
  verbose(
    `buildAndMergeConfig: after merge — stack=${stackSizeForLog(result.config.stack)}, merged=${result.merged}`,
  );
  return result;
}

export function buildCompileAgents(
  config: ProjectConfig,
  agents: Partial<Record<AgentName, AgentDefinition>>,
): Partial<Record<AgentName, CompileAgentConfig>> {
  const activeAgents = config.agents.filter((a) => !a.excluded);
  const excludedSkillIds = effectivelyExcludedSkillIds(config.skills);
  const globalSkillIds = new Set(
    config.skills.filter((s) => isActiveAt(s, "global")).map((s) => s.id),
  );
  const sourceById = new Map<SkillId, string>(config.skills.map((s) => [s.id, s.origin]));

  // A global agent takes only the skills active at global scope.
  const compilesInto = (ref: SkillReference, agentConfig: AgentScopeConfig): boolean => {
    if (excludedSkillIds.has(ref.id)) return false;
    if (agentConfig.scope === "global") return globalSkillIds.has(ref.id);
    return true;
  };

  // `origin`, carried as `source`, picks plugin (`${id}:${id}`) or eject (bare id) per skill. A
  // user-authored local skill has no SkillConfig, so none.
  const withItsOrigin = (ref: SkillReference): SkillReference => {
    const source = sourceById.get(ref.id);
    return { ...ref, ...(source !== undefined && { source }) };
  };

  const buildAgentCompileEntry = (agentConfig: AgentScopeConfig): CompileAgentConfig => {
    // The agent's own tuning, so a bare agent with no stack entry still carries it.
    const tuning: CompileAgentConfig = {
      ...(agentConfig.model !== undefined && { model: agentConfig.model }),
      ...(agentConfig.codexModel !== undefined && { codexModel: agentConfig.codexModel }),
      ...(agentConfig.effort !== undefined && { effort: agentConfig.effort }),
    };

    const agentStack = config.stack?.[agentConfig.name];
    if (!agentStack) return tuning;

    const filteredRefs = buildSkillRefsFromConfig(agentStack)
      .filter((ref) => compilesInto(ref, agentConfig))
      .map(withItsOrigin);
    return { ...tuning, skills: filteredRefs };
  };

  return typedFromEntries<AgentName, CompileAgentConfig>(
    activeAgents
      .filter((agentConfig) => agents[agentConfig.name])
      .map((agentConfig) => [agentConfig.name, buildAgentCompileEntry(agentConfig)]),
  );
}

export function buildAgentScopeMap(config: ProjectConfig): Map<AgentName, SkillScope> {
  return activeAgentScopeMap(config.agents);
}
