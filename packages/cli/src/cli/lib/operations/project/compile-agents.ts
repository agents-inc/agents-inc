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
  /** When set, loads config and filters agents to only those matching this scope. */
  scopeFilter?: SkillScope;
  outputDir?: string;
};

export type CompilationResult = {
  compiled: AgentName[];
  /**
   * The subset of `compiled` whose file this pass actually wrote. A pass whose
   * `rewritten` is empty changed nothing on disk, which is exactly what the
   * recompile summary reports and what the count it replaced could not say.
   */
  rewritten: AgentName[];
  failed: AgentName[];
  warnings: string[];
};

/**
 * Compiles agent markdown files from templates + skill content.
 *
 * Thin wrapper around recompileAgents() that standardizes options.
 * The caller invokes this once (edit, update) or twice with scopeFilter (compile).
 */
export async function compileAgents(options: CompileAgentsOptions): Promise<CompilationResult> {
  const { agents: resolvedAgents, agentScopeMap: resolvedAgentScopeMap } = options.scopeFilter
    ? await rosterForScope(options, options.scopeFilter)
    : { agents: options.agents, agentScopeMap: options.agentScopeMap };

  const recompileResult = await recompileAgents({
    pluginDir: options.pluginDir ?? options.projectDir,
    sourcePath: options.sourcePath,
    ...(resolvedAgents !== undefined && { agents: resolvedAgents }),
    ...(options.skills !== undefined && { skills: options.skills }),
    projectDir: options.projectDir,
    ...(options.outputDir !== undefined && { outputDir: options.outputDir }),
    ...(resolvedAgentScopeMap !== undefined && { agentScopeMap: resolvedAgentScopeMap }),
  });

  await pruneStaleAgentsForPass(options, recompileResult);

  return {
    compiled: recompileResult.compiled,
    rewritten: recompileResult.rewritten,
    failed: recompileResult.failed,
    warnings: recompileResult.warnings,
  };
}

/**
 * What a scope-filtered pass compiles, read off the installed config: the requested agents
 * narrowed to those active at `scope` (all of those when none were requested), and the caller's
 * scope routing — auto-built from the config when the caller passed none. With no installed
 * config, both are the caller's as passed.
 */
async function rosterForScope(
  options: CompileAgentsOptions,
  scope: SkillScope,
): Promise<{
  agents: AgentName[] | undefined;
  agentScopeMap: Map<AgentName, SkillScope> | undefined;
}> {
  const config = (await loadInstalledConfig(options.projectDir))?.config;
  const activeAtScope = config?.agents
    .filter((agent) => !agent.excluded && agent.scope === scope)
    .map((agent) => agent.name);

  return {
    agents: requestedAgentsAmong(options.agents, activeAtScope),
    agentScopeMap: options.agentScopeMap ?? (config ? buildAgentScopeMap(config) : undefined),
  };
}

/** The requested agents that appear in `activeAtScope`; either list alone when the other is absent. */
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
 * Compiled-agent writes are additive, so a deselected or stale agent's `.md`
 * lingers after recompile. An authoritative, scope-UNfiltered pass owns its
 * entire `outputDir` (its resolved roster is the full set for that directory),
 * so it prunes built-in agents no longer compiled there. A scope-FILTERED pass
 * (the hasBoth two-pass compile, or the registered-project recompile)
 * sees only one scope's agents and must never delete another scope's files, so
 * it skips pruning. Removing the stale files and tidying the directory they
 * emptied is one operation's job, not this pass's.
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
    // The host this installation compiles for — a Codex role is a `.toml`, and a prune that only
    // knew `.md` left a deselected role in place for Codex to keep offering (CLI-896's sibling).
    codec: agentCodec(providerInUse(options.projectDir)),
  });
}
