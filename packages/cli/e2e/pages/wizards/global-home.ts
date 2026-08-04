import { createTempDir } from "../../helpers/test-utils.js";

export type AllocatedGlobalHome = {
  dir: string;
  /**
   * Dirs the wizard must remove in destroy(): holds `dir` when freshly
   * allocated; empty when the caller supplied (and keeps ownership of) it.
   */
  cleanupDirs: string[];
};

/**
 * Global HOME for a launchInProject(): REUSES the caller-supplied dir
 * (multi-phase flows where a later wizard must see an earlier phase's
 * global-scoped content — the allocator keeps cleanup ownership), or
 * allocates a fresh dir the wizard owns and removes on destroy().
 */
export async function allocateProjectGlobalHome(
  reused: string | undefined,
): Promise<AllocatedGlobalHome> {
  if (reused !== undefined) return { dir: reused, cleanupDirs: [] };
  const dir = await createTempDir();
  return { dir, cleanupDirs: [dir] };
}
