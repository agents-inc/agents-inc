import type { PropagatedRecompileSummary } from "../operations/project/recompile-project-agents.js";

/** The summary of a fan-out that recompiled nothing, so callers render one shape. */
export const NOTHING_RECOMPILED: PropagatedRecompileSummary = {
  recompiledCount: 0,
  failedCount: 0,
  warnings: [],
};

/**
 * Recompiles the agents of every project a global write propagated into.
 *
 * Imported lazily: `recompile-project-agents` lives in the operations layer,
 * which imports back into `installation`, so a static import here would form a
 * load-time cycle (same rule as `installEject`'s `copyLocalSkills` import).
 * Per-project failure isolation lives in `recompilePropagatedProjectAgents` and
 * is unchanged by running it from inside the write.
 */
export async function recompilePropagated(
  projectDirs: string[],
): Promise<PropagatedRecompileSummary> {
  if (projectDirs.length === 0) return NOTHING_RECOMPILED;

  const { recompilePropagatedProjectAgents } =
    await import("../operations/project/recompile-project-agents.js");
  return recompilePropagatedProjectAgents(projectDirs);
}
