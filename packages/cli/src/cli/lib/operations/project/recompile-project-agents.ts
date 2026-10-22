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
async function recompileRegisteredProjectAgents(projectDir: string): Promise<CompilationResult> {
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
  /** Projects whose config pair or compiled sub-agents changed. */
  rewrittenCount: number;
  /** Projects visited where neither did. */
  unchangedCount: number;
  failedCount: number;
  warnings: string[];
};

/**
 * One project's failure must not stop the rest; sequential so warnings keep a stable order.
 * `pairsRewritten` names the projects whose config pair the fan-out changed.
 */
export async function recompilePropagatedProjectAgents(
  projectDirs: string[],
  pairsRewritten: ReadonlySet<string>,
): Promise<PropagatedRecompileSummary> {
  const outcomes: ProjectRecompileOutcome[] = [];
  for (const dir of projectDirs) {
    outcomes.push(await recompileOutcomeFor(dir, pairsRewritten));
  }
  return summarizeRecompiles(outcomes);
}

type ProjectRecompileOutcome =
  { kind: "rewritten" } | { kind: "unchanged" } | { kind: "failed"; warnings: string[] };

async function recompileOutcomeFor(
  dir: string,
  pairsRewritten: ReadonlySet<string>,
): Promise<ProjectRecompileOutcome> {
  try {
    const result = await recompileRegisteredProjectAgents(dir);
    if (result.failed.length > 0) return { kind: "failed", warnings: result.warnings };

    const changed = result.rewritten.length > 0 || pairsRewritten.has(dir);
    return { kind: changed ? "rewritten" : "unchanged" };
  } catch (error) {
    return {
      kind: "failed",
      warnings: [`Could not recompile agents in ${dir}: ${getErrorMessage(error)}`],
    };
  }
}

function summarizeRecompiles(outcomes: ProjectRecompileOutcome[]): PropagatedRecompileSummary {
  return {
    rewrittenCount: outcomes.filter((outcome) => outcome.kind === "rewritten").length,
    unchangedCount: outcomes.filter((outcome) => outcome.kind === "unchanged").length,
    failedCount: outcomes.filter((outcome) => outcome.kind === "failed").length,
    warnings: outcomes.flatMap((outcome) => (outcome.kind === "failed" ? outcome.warnings : [])),
  };
}
