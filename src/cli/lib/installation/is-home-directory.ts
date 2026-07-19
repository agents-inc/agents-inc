import fs from "fs";
import os from "os";

/**
 * True when `dir` is the user's home directory — the global installation root.
 *
 * Symlink-safe: compares via `fs.realpathSync` so a symlinked $HOME (common on
 * macOS) still matches. Falls back to a plain string compare when either path
 * cannot be resolved (e.g. does not exist yet). Calls `os.homedir()` at runtime
 * (not the module-load-time `GLOBAL_INSTALL_ROOT` constant) so it agrees with
 * other runtime `os.homedir()` callers and with test home-dir mocks.
 */
export function isHomeDirectory(dir: string): boolean {
  try {
    return fs.realpathSync(dir) === fs.realpathSync(os.homedir());
  } catch {
    return dir === os.homedir();
  }
}
