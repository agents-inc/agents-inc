import { realpathSync } from "fs";
import os from "os";

/** Undoes oclif's wrapping and ` › ` markers so a whole sentence can be asserted. */
export function flattenCliOutput(output: string): string {
  return output.replace(/›/g, " ").replace(/\s+/g, " ").trim();
}

/** For text holding a path, which oclif breaks mid-word; pass the expected text through it too. */
export function compactCliOutput(output: string): string {
  return output.replace(/›/g, "").replace(/\s+/g, "");
}

/**
 * Leaves out the temp folder, so a negative about a folder name reads only what the CLI named. Both
 * spellings, since not every fixture resolves a temp folder that is a link.
 */
export function compactedWithoutTempFolder(output: string): string {
  return compactCliOutput(output)
    .replaceAll(compactCliOutput(realpathSync(os.tmpdir())), "<tmp>")
    .replaceAll(compactCliOutput(os.tmpdir()), "<tmp>");
}
