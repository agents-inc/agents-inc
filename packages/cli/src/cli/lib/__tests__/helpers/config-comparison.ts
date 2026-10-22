/** Order-insensitive: compares line membership only. */
export function normalizeGlobalConfig(content: string): string {
  return content.split("\n").sort().join("\n");
}
