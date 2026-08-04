import { recompileAgents } from "../../agents/index.js";
import { pruneStaleCompiledAgents } from "../../agents/list-compiled-agents.js";
import { loadProjectConfigFromDir } from "../../configuration/index.js";
import { buildAgentScopeMap } from "../../installation/index.js";
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
  let resolvedAgents = options.agents;
  let resolvedAgentScopeMap = options.agentScopeMap;

  if (options.scopeFilter) {
    const loadedConfig = await loadProjectConfigFromDir(options.projectDir);

    // Auto-build agentScopeMap from config if not provided
    if (!resolvedAgentScopeMap && loadedConfig?.config) {
      resolvedAgentScopeMap = buildAgentScopeMap(loadedConfig.config);
    }

    const filteredAgents = loadedConfig?.config?.agents
      ?.filter((a) => !a.excluded && a.scope === options.scopeFilter)
      .map((a) => a.name);

    if (resolvedAgents && filteredAgents) {
      const filterSet = new Set(filteredAgents);
      resolvedAgents = resolvedAgents.filter((a) => filterSet.has(a));
    } else if (filteredAgents) {
      resolvedAgents = filteredAgents;
    }
  }

  const recompileResult = await recompileAgents({
    pluginDir: options.pluginDir ?? options.projectDir,
    sourcePath: options.sourcePath,
    agents: resolvedAgents,
    skills: options.skills,
    projectDir: options.projectDir,
    outputDir: options.outputDir,
    agentScopeMap: resolvedAgentScopeMap,
  });

  await pruneStaleAgentsForPass(options, recompileResult);

  return {
    compiled: recompileResult.compiled,
    failed: recompileResult.failed,
    warnings: recompileResult.warnings,
  };
}

/**
 * Compiled-agent writes are additive, so a deselected or stale agent's `.md`
 * lingers after recompile. An authoritative, scope-UNfiltered pass owns its
 * entire `outputDir` (its resolved roster is the full set for that directory),
 * so it prunes built-in agents no longer compiled there. A scope-FILTERED pass
 * (the hasBoth two-pass compile, or the D-240 registered-project recompile)
 * sees only one scope's agents and must never delete another scope's files, so
 * it skips pruning. Hand-authored agents are preserved by the prune predicate.
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
  await pruneStaleCompiledAgents(options.outputDir, compiledForDir);
}
