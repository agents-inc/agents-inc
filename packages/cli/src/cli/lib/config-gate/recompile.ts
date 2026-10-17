import type { PropagatedRecompileSummary } from "../operations/project/recompile-project-agents.js";

export const NOTHING_RECOMPILED: PropagatedRecompileSummary = {
  rewrittenCount: 0,
  unchangedCount: 0,
  failedCount: 0,
  warnings: [],
};

/** Imported lazily: a static import of the operations layer would form a load-time cycle. */
export async function recompilePropagated(
  projectDirs: string[],
): Promise<PropagatedRecompileSummary> {
  if (projectDirs.length === 0) return NOTHING_RECOMPILED;

  const { recompilePropagatedProjectAgents } =
    await import("../operations/project/recompile-project-agents.js");
  return recompilePropagatedProjectAgents(projectDirs);
}
