import { compileAgents, type CompilationResult } from "./compile-agents.js";
import { loadAgentDefs } from "./load-agent-defs.js";
import { discoverInstalledSkills } from "../skills/index.js";
import { resolveInstallPaths } from "../../installation/index.js";
import { getErrorMessage } from "../../../utils/errors.js";

/**
 * Recompiles the PROJECT-scoped agents of a registered project after a global
 * config change was propagated into that project's `config.ts`.
 *
 * Propagation (`propagateGlobalChangesToProjects`) rewrites a registered
 * project's `config.ts` / `config-types.ts` but never touches its compiled
 * `.claude/agents/*.md`, so the compiled agents keep emitting whatever skill
 * reference form the OLD global data dictated. Run this per propagated project,
 * after propagation, to bring the compiled artifacts back in step.
 *
 * Scope: project only. The global agents were already recompiled by the
 * triggering operation's own pass; repeating a global pass per project would
 * rewrite `~/.claude/agents` once per registered project for no gain.
 *
 * `skills` is passed explicitly: without it `recompileAgents` falls back to
 * `discoverAllPluginSkills`, which sees plugin skills only and would silently
 * strip every global-local and project-local skill from the compiled agents.
 *
 * Agent partials always come from the CLI itself (`getLocalAgentDefinitions`
 * returns `sourcePath: PROJECT_ROOT`), so no per-project marketplace source
 * resolution is needed.
 */
export async function recompileRegisteredProjectAgents(
  projectDir: string,
): Promise<CompilationResult> {
  const { allSkills } = await discoverInstalledSkills(projectDir);
  const { sourcePath } = await loadAgentDefs();

  return compileAgents({
    projectDir,
    sourcePath,
    skills: allSkills,
    scopeFilter: "project",
    outputDir: resolveInstallPaths(projectDir, "project").agentsDir,
  });
}

export type PropagatedRecompileSummary = {
  /** Projects where at least one compiled agent's content actually moved. */
  rewrittenCount: number;
  /**
   * Projects the fan-out reached whose agents all came back byte-identical. They
   * were visited and left alone, which is a different fact from being recompiled
   * and the one the old single count could not tell apart.
   */
  unchangedCount: number;
  failedCount: number;
  /** Per-project warnings in processing order — the caller surfaces them via warn(). */
  warnings: string[];
};

/**
 * Runs {@link recompileRegisteredProjectAgents} over every propagated project,
 * isolating per-project failures: one project's unreadable config or broken
 * template must not abort the loop or leave the remaining projects stale.
 * Projects are processed sequentially so the collected warnings keep a
 * deterministic per-project order.
 */
export async function recompilePropagatedProjectAgents(
  projectDirs: string[],
): Promise<PropagatedRecompileSummary> {
  let rewrittenCount = 0;
  let unchangedCount = 0;
  let failedCount = 0;
  const warnings: string[] = [];

  for (const dir of projectDirs) {
    try {
      const result = await recompileRegisteredProjectAgents(dir);
      if (result.failed.length > 0) {
        failedCount++;
        warnings.push(...result.warnings);
        continue;
      }
      if (result.rewritten.length > 0) rewrittenCount++;
      else unchangedCount++;
    } catch (error) {
      failedCount++;
      warnings.push(`Could not recompile agents in ${dir}: ${getErrorMessage(error)}`);
    }
  }

  return { rewrittenCount, unchangedCount, failedCount, warnings };
}
