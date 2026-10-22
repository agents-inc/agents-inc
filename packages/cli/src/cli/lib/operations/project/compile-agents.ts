import { pruneCompiledAgents } from "./remove-compiled-agents.js";
import { recompileAgents } from "../../agents/index.js";
import { loadInstalledConfig } from "../../configuration/index.js";
import { buildAgentScopeMap } from "../../installation/index.js";
import { agentCodec, providerInUse } from "../../installation/install-layout.js";
import type { AgentName, SkillDefinitionMap, SkillScope } from "../../../types/index.js";

export type CompileAgentsOptions = {
  projectDir: string;
  sourcePath: string;
  pluginDir?: string;
  skills?: SkillDefinitionMap;
  agentScopeMap?: Map<AgentName, SkillScope>;
  agents?: AgentName[];
  scopeFilter?: SkillScope;
  outputDir?: string;
};

export type CompilationResult = {
  compiled: AgentName[];
  /** The subset of `compiled` whose file this pass actually wrote. */
  rewritten: AgentName[];
  failed: AgentName[];
  warnings: string[];
};

export async function compileAgents(options: CompileAgentsOptions): Promise<CompilationResult> {
  const roster = await rosterForPass(options);

  const recompileResult = await recompileAgents({
    pluginDir: options.pluginDir ?? options.projectDir,
    sourcePath: options.sourcePath,
    ...(roster.agents !== undefined && { agents: roster.agents }),
    ...(options.skills !== undefined && { skills: options.skills }),
    projectDir: options.projectDir,
    ...(options.outputDir !== undefined && { outputDir: options.outputDir }),
    ...(roster.agentScopeMap !== undefined && { agentScopeMap: roster.agentScopeMap }),
  });

  await pruneStaleAgentsForPass(options, recompileResult);

  return {
    compiled: recompileResult.compiled,
    rewritten: recompileResult.rewritten,
    failed: recompileResult.failed,
    warnings: recompileResult.warnings,
  };
}

type PassRoster = {
  agents: AgentName[] | undefined;
  agentScopeMap: Map<AgentName, SkillScope> | undefined;
};

async function rosterForPass(options: CompileAgentsOptions): Promise<PassRoster> {
  if (!options.scopeFilter) return { agents: options.agents, agentScopeMap: options.agentScopeMap };
  return rosterForScope(options, options.scopeFilter);
}

async function rosterForScope(
  options: CompileAgentsOptions,
  scope: SkillScope,
): Promise<PassRoster> {
  const config = (await loadInstalledConfig(options.projectDir))?.config;
  const activeAtScope = config?.agents
    .filter((agent) => !agent.excluded && agent.scope === scope)
    .map((agent) => agent.name);

  return {
    agents: requestedAgentsAmong(options.agents, activeAtScope),
    agentScopeMap: options.agentScopeMap ?? (config ? buildAgentScopeMap(config) : undefined),
  };
}

function requestedAgentsAmong(
  requested: AgentName[] | undefined,
  activeAtScope: AgentName[] | undefined,
): AgentName[] | undefined {
  if (activeAtScope === undefined) return requested;
  if (requested === undefined) return activeAtScope;

  const atScope = new Set(activeAtScope);
  return requested.filter((name) => atScope.has(name));
}

/**
 * Only an unfiltered pass owns its whole `outputDir`, so only it prunes agents no longer compiled
 * there; a scope-filtered pass must never delete another scope's files.
 */
async function pruneStaleAgentsForPass(
  options: CompileAgentsOptions,
  recompileResult: CompilationResult,
): Promise<void> {
  if (options.scopeFilter || !options.outputDir) return;

  const compiledForDir = new Set<AgentName>([
    ...recompileResult.compiled,
    ...recompileResult.failed,
  ]);
  await pruneCompiledAgents({
    agentsDir: options.outputDir,
    keep: compiledForDir,
    // A Codex role is a `.toml`, so the prune must know the host's extension.
    codec: agentCodec(providerInUse(options.projectDir)),
  });
}
