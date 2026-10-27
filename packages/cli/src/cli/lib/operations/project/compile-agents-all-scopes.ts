import os from "os";
import { compileAgents, type CompilationResult } from "./compile-agents.js";
import { isHomeDirectory, resolveInstallPaths } from "../../installation/index.js";
import { agentsDir, inheritedGlobalProvider } from "../../installation/install-layout.js";
import type { AgentName, SkillDefinitionMap, SkillScope } from "../../../types/index.js";

export type CompileAllScopesOptions = {
  projectDir: string;
  sourcePath: string;
  skills: SkillDefinitionMap;
  agentScopeMap: Map<AgentName, SkillScope>;
};

/**
 * Each pass is filtered to its own scope so the project pass cannot overwrite global agents with
 * zero-skill versions.
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

  const globalResult = await compileGlobalScope(options);
  const projectResult = await compileProjectScope(options);
  return mergeCompilationResults(globalResult, projectResult);
}

/** The global installation the project inherits, compiled from and into that installation. */
async function compileGlobalScope(options: CompileAllScopesOptions): Promise<CompilationResult> {
  const { projectDir, sourcePath, skills, agentScopeMap } = options;
  const provider = inheritedGlobalProvider(projectDir);
  return compileAgents({
    sourcePath,
    skills,
    agentScopeMap,
    projectDir: os.homedir(),
    provider,
    outputDir: agentsDir(provider, "global", projectDir),
    scopeFilter: "global",
  });
}

export async function compileProjectScope(
  options: CompileAllScopesOptions,
): Promise<CompilationResult> {
  const { projectDir, sourcePath, skills, agentScopeMap } = options;
  return compileAgents({
    sourcePath,
    skills,
    agentScopeMap,
    projectDir,
    outputDir: resolveInstallPaths(projectDir, "project").agentsDir,
    scopeFilter: "project",
  });
}

function mergeCompilationResults(...results: CompilationResult[]): CompilationResult {
  return {
    compiled: results.flatMap((r) => r.compiled),
    rewritten: results.flatMap((r) => r.rewritten),
    failed: results.flatMap((r) => r.failed),
    warnings: results.flatMap((r) => r.warnings),
  };
}
