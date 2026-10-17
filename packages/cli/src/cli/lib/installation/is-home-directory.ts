import fs from "fs";
import os from "os";

/** Compares real paths so a symlinked $HOME matches; plain compare when either cannot resolve. */
export function isHomeDirectory(dir: string): boolean {
  try {
    return fs.realpathSync(dir) === fs.realpathSync(os.homedir());
  } catch {
    return dir === os.homedir();
  }
}
