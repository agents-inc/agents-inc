/** Undoes oclif's wrapping and ` › ` markers so a whole sentence can be asserted. */
export function flattenCliOutput(output: string): string {
  return output.replace(/›/g, " ").replace(/\s+/g, " ").trim();
}

/** For text holding a path, which oclif breaks mid-word; pass the expected text through it too. */
export function compactCliOutput(output: string): string {
  return output.replace(/›/g, "").replace(/\s+/g, "");
}
