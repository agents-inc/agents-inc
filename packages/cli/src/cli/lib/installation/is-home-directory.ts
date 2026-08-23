import fs from "fs";
import os from "os";

/**
 * True when `dir` is the user's home directory — the global installation root.
 *
 * Symlink-safe: compares via `fs.realpathSync` so a symlinked $HOME (common on
 * macOS) still matches. Falls back to a plain string compare when either path
 * cannot be resolved (e.g. does not exist yet). Calls `os.homedir()` at runtime,
 * as every home-dir reader in the codebase now does, so it agrees with test
 * home-dir mocks.
 */
export function isHomeDirectory(dir: string): boolean {
  try {
    return fs.realpathSync(dir) === fs.realpathSync(os.homedir());
  } catch {
    return dir === os.homedir();
  }
}
