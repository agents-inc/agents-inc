import os from "os";
import { compileAgents, type CompilationResult } from "./compile-agents.js";
import { isHomeDirectory, resolveInstallPaths } from "../../installation/index.js";
import type { AgentName, SkillDefinitionMap, SkillScope } from "../../../types/index.js";

export type CompileAllScopesOptions = {
  /** Working directory of the command — a project root, or home for global context. */
  projectDir: string;
  sourcePath: string;
  skills: SkillDefinitionMap;
  agentScopeMap: Map<AgentName, SkillScope>;
};

/**
 * Compiles agents for every scope the current context owns.
 *
 * Home context: a single pass writing to the home agents directory.
 * Project context: a global pass (from home) then a project pass, each
 * filtered to its own scope so the project pass cannot overwrite global
 * agents with zero-skill versions. Results merge in pass order.
 */
export async function compileAgentsAllScopes(
  options: CompileAllScopesOptions,
): Promise<CompilationResult> {
  const { projectDir, sourcePath, skills, agentScopeMap } = options;
  const base = { sourcePath, skills, agentScopeMap };

  if (isHomeDirectory(projectDir)) {
    return compileAgents({
      ...base,
      projectDir,
      outputDir: resolveInstallPaths(projectDir, "project").agentsDir,
    });
  }

  const globalResult = await compileAgents({
    ...base,
    projectDir: os.homedir(),
    outputDir: resolveInstallPaths(os.homedir(), "global").agentsDir,
    scopeFilter: "global",
  });
  const projectResult = await compileAgents({
    ...base,
    projectDir,
    outputDir: resolveInstallPaths(projectDir, "project").agentsDir,
    scopeFilter: "project",
  });
  return mergeCompilationResults(globalResult, projectResult);
}

function mergeCompilationResults(...results: CompilationResult[]): CompilationResult {
  return {
    compiled: results.flatMap((r) => r.compiled),
    rewritten: results.flatMap((r) => r.rewritten),
    failed: results.flatMap((r) => r.failed),
    warnings: results.flatMap((r) => r.warnings),
  };
}
