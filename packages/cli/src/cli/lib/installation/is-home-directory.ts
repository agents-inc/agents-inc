import fs from "fs";
import os from "os";

import type { SkillScope } from "../../types/config";

/** Compares real paths so a symlinked $HOME matches; plain compare when either cannot resolve. */
export function isHomeDirectory(dir: string): boolean {
  try {
    return fs.realpathSync(dir) === fs.realpathSync(os.homedir());
  } catch {
    return dir === os.homedir();
  }
}

/** Home roots the global installation; any other folder a project's. */
export function scopeAt(dir: string): SkillScope {
  return isHomeDirectory(dir) ? "global" : "project";
}
