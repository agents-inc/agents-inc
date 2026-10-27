import { partition } from "remeda";
import { writeCompiledAgentsByScope, type AgentWriteOutcome } from "./write-compiled-agents";
import { listCompiledAgentNames } from "./list-compiled-agents";
import path from "path";

import { getErrorMessage } from "../../utils/errors";
import type {
  AgentDefinition,
  AgentName,
  CompileAgentConfig,
  CompileConfig,
  ProjectConfig,
  SkillDefinitionMap,
  SkillId,
  SkillScope,
} from "../../types";

import { buildCompileAgents } from "../installation/local-installer";
import { ensureDir } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedEntries, typedFromEntries, typedKeys } from "../../utils/typed-object";
import { createLiquidEngine } from "../compiler";
import { loadProjectConfig, effectivelyExcludedSkillIds } from "../configuration";
import { loadAllAgents, loadProjectAgents } from "../loading";
import { getPluginAgentsDir } from "../plugins";
import { discoverAllPluginSkills } from "../plugins/plugin-discovery";
import { resolveAgents } from "../resolver";
import { providerInUse } from "../installation/install-layout";
import type { Provider } from "../../consts";

export type RecompileAgentsOptions = {
  pluginDir: string;
  sourcePath: string;
  agents?: AgentName[];
  skills?: SkillDefinitionMap;
  projectDir?: string;
  /** The installation recompiled, where its directory holds two; the default is the one in use. */
  provider?: Provider;
  outputDir?: string;
  /**
   * When provided, routes agents by scope: global ones to the agents folder of the global
   * installation inherited, project ones to `outputDir`.
   */
  agentScopeMap?: Map<AgentName, SkillScope>;
};

export type RecompileAgentsResult = {
  compiled: AgentName[];
  /** The subset of `compiled` whose file content moved; the rest count as unchanged. */
  rewritten: AgentName[];
  failed: AgentName[];
  warnings: string[];
};

async function getExistingAgentNames(pluginDir: string): Promise<AgentName[]> {
  return listCompiledAgentNames(getPluginAgentsDir(pluginDir));
}

type ResolveAgentNamesParams = {
  specifiedAgents?: AgentName[];
  projectConfig: ProjectConfig | null;
  allAgents: Partial<Record<AgentName, AgentDefinition>>;
  outputDir?: string;
  pluginDir: string;
};

async function resolveAgentNames(params: ResolveAgentNamesParams): Promise<AgentName[]> {
  const { specifiedAgents, projectConfig, allAgents, outputDir, pluginDir } = params;

  if (specifiedAgents) {
    return specifiedAgents;
  }

  // A present config is authoritative even when its roster is empty.
  if (projectConfig) {
    const agentNames = projectConfig.agents.map((a) => a.name);
    verbose(`Using agents from config: ${agentNames.join(", ")}`);
    return agentNames;
  }

  if (outputDir) {
    const names = typedKeys<AgentName>(allAgents);
    verbose(`Using all available agents from source: ${names.join(", ")}`);
    return names;
  }

  return getExistingAgentNames(pluginDir);
}

function buildRecompileResult(
  outcomes: AgentWriteOutcome[],
  priorWarnings: string[],
): RecompileAgentsResult {
  const [succeeded, failedOutcomes] = partition(
    outcomes,
    (outcome): outcome is Extract<AgentWriteOutcome, { ok: true }> => outcome.ok,
  );
  succeeded.forEach((outcome) =>
    verbose(
      `  ${outcome.rewritten ? "Rewrote" : "Unchanged"}: ${outcome.name} (${outcome.scope} -> ${outcome.targetDir})`,
    ),
  );
  return {
    compiled: succeeded.map((outcome) => outcome.name),
    rewritten: succeeded.filter((outcome) => outcome.rewritten).map((outcome) => outcome.name),
    failed: failedOutcomes.map((outcome) => outcome.name),
    warnings: [
      ...priorWarnings,
      ...failedOutcomes.map(
        (outcome) => `Failed to compile ${outcome.name}: ${getErrorMessage(outcome.error)}`,
      ),
    ],
  };
}

export function filterExcludedEntries(config: ProjectConfig): ProjectConfig {
  const excludedIds = effectivelyExcludedSkillIds(config.skills);
  const activeSkills = config.skills.filter((s) => !s.excluded);
  const activeAgents = config.agents.filter((a) => !a.excluded);

  // No stack stays absent rather than an explicit `undefined`.
  const filteredStack =
    config.stack === undefined
      ? {}
      : { stack: withoutExcludedAssignments(config.stack, excludedIds) };

  return { ...config, skills: activeSkills, agents: activeAgents, ...filteredStack };
}

/** Each agent and category keeps its key, even when left with no assignments. */
export function withoutExcludedAssignments(
  stack: NonNullable<ProjectConfig["stack"]>,
  excludedIds: ReadonlySet<SkillId>,
): NonNullable<ProjectConfig["stack"]> {
  return Object.fromEntries(
    typedEntries(stack).map(([agentName, agentStack]) => [
      agentName,
      Object.fromEntries(
        typedEntries(agentStack).map(([category, assignments]) => [
          category,
          assignments.filter((assignment) => !excludedIds.has(assignment.id)),
        ]),
      ),
    ]),
  );
}

export async function recompileAgents(
  options: RecompileAgentsOptions,
): Promise<RecompileAgentsResult> {
  const { pluginDir, sourcePath, skills: providedSkills, projectDir, outputDir } = options;

  const configDir = projectDir ?? pluginDir;
  const provider = options.provider ?? providerInUse(configDir);
  const filteredConfig = await loadConfigWithoutExclusions(configDir, provider);
  const allAgents = await loadAgentDefinitions(sourcePath, projectDir, provider);

  const agentNames = await resolveAgentNames({
    ...(options.agents !== undefined && { specifiedAgents: options.agents }),
    projectConfig: filteredConfig,
    allAgents,
    ...(outputDir !== undefined && { outputDir }),
    pluginDir,
  });

  // An empty pass is not a warning: callers report it off `compiled`.
  if (agentNames.length === 0) {
    return { compiled: [], rewritten: [], failed: [], warnings: [] };
  }

  verbose(`Recompiling ${agentNames.length} agents in ${outputDir ?? pluginDir}`);

  const pluginSkills: SkillDefinitionMap =
    providedSkills ?? (await discoverAllPluginSkills(configDir, provider));

  const { configAgents, missingWarnings } = compileEntriesFor(
    agentNames,
    filteredConfig,
    allAgents,
  );
  const compileConfig = compileConfigFor(filteredConfig, configAgents, pluginDir);

  const engine = await createLiquidEngine(projectDir, provider);
  const resolvedAgents = await resolveAgents(allAgents, pluginSkills, compileConfig);

  const agentsDir = outputDir ?? getPluginAgentsDir(pluginDir);
  await ensureDir(agentsDir);

  const outcomes = await writeCompiledAgentsByScope({
    resolvedAgents,
    sourcePath,
    engine,
    projectAgentsDir: agentsDir,
    // The config's own installation, so format and configuration agree.
    projectDir: configDir,
    provider,
    ...(options.agentScopeMap !== undefined && { agentScopeMap: options.agentScopeMap }),
  });
  return buildRecompileResult(outcomes, missingWarnings);
}

async function loadConfigWithoutExclusions(
  configDir: string,
  provider: Provider,
): Promise<ProjectConfig | null> {
  const loaded = await loadProjectConfig(configDir, provider);
  return loaded ? filterExcludedEntries(loaded.config) : null;
}

/** A project agent wins over a built-in one of the same name. */
async function loadAgentDefinitions(
  sourcePath: string,
  projectDir: string | undefined,
  provider: Provider,
): Promise<Partial<Record<AgentName, AgentDefinition>>> {
  const builtinAgents = await loadAllAgents(sourcePath);
  const projectAgents = projectDir ? await loadProjectAgents(projectDir, provider) : {};

  return { ...builtinAgents, ...projectAgents };
}

function compileConfigFor(
  config: ProjectConfig | null,
  agents: Partial<Record<AgentName, CompileAgentConfig>>,
  pluginDir: string,
): CompileConfig {
  return {
    name: config?.name || path.basename(pluginDir),
    description: config?.description || "Recompiled plugin",
    agents,
  };
}

/** Only agents the scope filter matches: a project pass must not overwrite stackless globals. */
function compileEntriesFor(
  agentNames: AgentName[],
  config: ProjectConfig | null,
  allAgents: Partial<Record<AgentName, AgentDefinition>>,
): { configAgents: Partial<Record<AgentName, CompileAgentConfig>>; missingWarnings: string[] } {
  const allConfigAgents = config ? buildCompileAgents(config, allAgents) : {};

  const [knownAgents, missingAgents] = partition(agentNames, (name) =>
    Boolean(allConfigAgents[name] || allAgents[name]),
  );

  return {
    configAgents: typedFromEntries<AgentName, CompileAgentConfig>(
      knownAgents.map((name) => [name, allConfigAgents[name] ?? {}]),
    ),
    missingWarnings: missingAgents.map((name) => `Agent "${name}" not found in source definitions`),
  };
}
