import { compileAgents, type CompilationResult } from "./compile-agents.js";
import { loadAgentDefs } from "./load-agent-defs.js";
import { discoverInstalledSkills } from "../skills/index.js";
import { resolveInstallPaths } from "../../installation/index.js";
import { withCatalogueSeatedFor } from "../../loading/catalogue-seat.js";
import { getErrorMessage } from "../../../utils/errors.js";

/**
 * Project scope only: the triggering command already recompiled the global agents. Skills and
 * catalogue are resolved from this project; without explicit `skills`, `recompileAgents` would
 * see plugin skills only.
 */
export async function recompileRegisteredProjectAgents(
  projectDir: string,
): Promise<CompilationResult> {
  return withCatalogueSeatedFor(projectDir, async () => {
    const { allSkills } = await discoverInstalledSkills(projectDir);
    const { sourcePath } = await loadAgentDefs();

    return compileAgents({
      projectDir,
      sourcePath,
      skills: allSkills,
      scopeFilter: "project",
      outputDir: resolveInstallPaths(projectDir, "project").agentsDir,
    });
  });
}

export type PropagatedRecompileSummary = {
  rewrittenCount: number;
  /** Projects visited whose agents all came back byte-identical. */
  unchangedCount: number;
  failedCount: number;
  warnings: string[];
};

/** One project's failure must not stop the rest; sequential so warnings keep a stable order. */
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
