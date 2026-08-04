import { directoryExists } from "../utils/fs.js";

export type DirOverwritable = { ok: true } | { ok: false; exists: true };

/**
 * Checks whether `dir` can be written fresh. `{ok: false, exists: true}` when a
 * directory already occupies the path — callers own the error wording and the
 * force/overwrite policy.
 */
export async function assertDirOverwritable(dir: string): Promise<DirOverwritable> {
  return (await directoryExists(dir)) ? { ok: false, exists: true } : { ok: true };
}
