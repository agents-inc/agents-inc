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
import type { InstallSelection } from "@workspace/compile/seed-to-config";
import {
  type MergeResult,
  type AuthoritativeScope,
  mergeWithExistingConfig,
  loadProjectConfig,
} from "../configuration";
import { loadProjectConfigFromDir } from "../configuration/project-config";
import { inheritedGlobalProvider } from "./install-layout";
import { type SourceLoadResult } from "../loading";
import { loadStackById, stackNotOfferedMessage } from "../stacks";
import { buildSkillRefsFromConfig } from "../resolver";
import { generateProjectConfigFromSkills, buildStackProperty } from "../configuration";
import {
  isActiveAt,
  activeAgentScopeMap,
  effectivelyExcludedSkillIds,
} from "../configuration/scope-predicates";
import { verbose } from "../../utils/logger";
import { typedFromEntries } from "../../utils/typed-object";
import { DEFAULT_PLUGIN_NAME } from "../../consts";

/**
 * Assigned `(skill, agent)` pairs replace the ownership-derived stack so the sharer's curation
 * survives. With no agents selected the key is absent and the merger keeps the stack on disk.
 */
function resolveStackProperty(
  generated: ProjectConfig["stack"],
  assigned: InstallSelection["assignedStack"],
): ProjectConfig["stack"] {
  return generated === undefined ? undefined : assigned;
}

/** The link's own description wins over the stack it applies, whose words are the fallback. */
function resolveDescription(
  loadedStack: Stack | null,
  shared: InstallSelection["description"],
): string | undefined {
  return shared ?? loadedStack?.description;
}

/** At `$HOME` the basename is the account name, so the global config takes the product name. */
function configNameFor(projectDir: string): string {
  return isHomeDirectory(projectDir) ? DEFAULT_PLUGIN_NAME : path.basename(projectDir);
}

/**
 * A global sub-agent's curation lives only in the global config, so both are read; the project's
 * row wins per agent.
 */
async function loadCuratedStack(
  projectDir: string,
  projectStack: ProjectConfig["stack"],
): Promise<Partial<Record<AgentName, StackAgentConfig>>> {
  // At `$HOME` the loaded config IS the global one.
  const globalStack = isHomeDirectory(projectDir) ? undefined : await loadGlobalStack(projectDir);

  return { ...globalStack, ...projectStack };
}

/** The stack of the global installation the project inherits. */
async function loadGlobalStack(projectDir: string): Promise<ProjectConfig["stack"]> {
  const inherited = await loadProjectConfigFromDir(
    os.homedir(),
    inheritedGlobalProvider(projectDir),
  );
  return inherited?.config.stack;
}

async function buildInstallConfig(
  selection: InstallSelection,
  sourceResult: SourceLoadResult,
  projectDir: string,
): Promise<{ config: ProjectConfig; loadedStack: Stack | null }> {
  const skillIds = unique(selection.skills.map((s) => s.id));
  verbose(selectionForLog(selection, skillIds));

  const loadedStack = await loadSelectedStack(selection.selectedStackId, sourceResult);
  const existing = await loadProjectConfig(projectDir);
  const existingStack = await loadCuratedStack(projectDir, existing?.config.stack);

  const options = generatorOptionsFor(selection, stackToPreserve(loadedStack, existingStack));
  const generated = generateProjectConfigFromSkills(configNameFor(projectDir), skillIds, options);
  const localConfig = withSelectionCuration(generated, selection, loadedStack);

  verbose(installConfigForLog(localConfig));

  return { config: localConfig, loadedStack };
}

function withSelectionCuration(
  generated: ProjectConfig,
  selection: InstallSelection,
  loadedStack: Stack | null,
): ProjectConfig {
  const stack = resolveStackProperty(generated.stack, selection.assignedStack);
  const description = resolveDescription(loadedStack, selection.description);

  return {
    ...generated,
    ...(stack && { stack }),
    ...(description !== undefined && { description }),
  };
}

function selectionForLog(selection: InstallSelection, skillIds: SkillId[]): string {
  return (
    `buildInstallConfig: selectedStackId='${selection.selectedStackId}', ` +
    `skills=[${skillIds.join(", ")}], ` +
    `selectedAgents=[${selection.selectedAgents.join(", ")}]`
  );
}

function installConfigForLog(config: ProjectConfig): string {
  return (
    `buildInstallConfig result: stack=${stackSizeForLog(config.stack)}, ` +
    `agents=[${config.agents.map((a) => a.name).join(", ")}], skills=${config.skills.length}`
  );
}

/**
 * Lets a caller refuse before writing anything (the `--from` producers do); the install's own
 * lookup is only the backstop, landing after plugins are installed.
 */
export async function refuseUnofferedStack(
  stackId: InstallSelection["selectedStackId"],
  sourceResult: SourceLoadResult,
): Promise<void> {
  await loadSelectedStack(stackId, sourceResult);
}

async function loadSelectedStack(
  stackId: InstallSelection["selectedStackId"],
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

/** The curated stack on disk wins per agent over any stack this install applies. */
function stackToPreserve(
  loadedStack: Stack | null,
  curatedStack: Partial<Record<AgentName, StackAgentConfig>>,
): Partial<Record<AgentName, StackAgentConfig>> {
  if (loadedStack === null) return curatedStack;
  return { ...buildStackProperty(loadedStack), ...curatedStack };
}

function generatorOptionsFor(
  selection: InstallSelection,
  existingStack: Partial<Record<AgentName, StackAgentConfig>>,
): {
  selectedAgents?: AgentName[];
  skillConfigs: SkillConfig[];
  agentConfigs: AgentScopeConfig[];
  existingStack: Partial<Record<AgentName, StackAgentConfig>>;
} {
  return {
    skillConfigs: selection.skills,
    agentConfigs: selection.agentConfigs,
    existingStack,
    ...(selection.selectedAgents.length > 0 && {
      selectedAgents: selection.selectedAgents,
    }),
  };
}

function stackSizeForLog(stack: ProjectConfig["stack"]): string {
  return stack ? `${Object.keys(stack).length} agents` : "UNDEFINED";
}

function setConfigMetadata(
  config: ProjectConfig,
  selection: InstallSelection,
  sourceResult: SourceLoadResult,
  sourceFlag?: string,
): ProjectConfig {
  const result = { ...config };

  if (selection.selectedDomains.length > 0) {
    result.selectedDomains = selection.selectedDomains;
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
  selection: InstallSelection,
  sourceResult: SourceLoadResult,
  projectDir: string,
  sourceFlag?: string,
  authoritativeScope?: AuthoritativeScope,
): Promise<MergeResult> {
  const { config } = await buildInstallConfig(selection, sourceResult, projectDir);
  verbose(`buildAndMergeConfig: before merge — stack=${stackSizeForLog(config.stack)}`);
  const configWithMetadata = setConfigMetadata(config, selection, sourceResult, sourceFlag);
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
  const sourceById = new Map<SkillId, string>(
    config.skills.filter((s) => !s.excluded).map((s) => [s.id, s.origin]),
  );

  // A global agent takes only the skills active at global scope.
  const compilesInto = (ref: SkillReference, agentConfig: AgentScopeConfig): boolean => {
    if (excludedSkillIds.has(ref.id)) return false;
    if (agentConfig.scope === "global") return globalSkillIds.has(ref.id);
    return true;
  };

  // `origin` picks plugin (`${id}:${id}`) or eject (bare id); a user-authored local skill has none.
  const withItsOrigin = (ref: SkillReference): SkillReference => {
    const source = sourceById.get(ref.id);
    return { ...ref, ...(source !== undefined && { source }) };
  };

  const buildAgentCompileEntry = (agentConfig: AgentScopeConfig): CompileAgentConfig => {
    // Kept even for an agent with no stack entry.
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
