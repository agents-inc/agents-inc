// One normaliser sorts and one does not; swapping them under an assertion weakens it.

/** Order-insensitive: compares line membership only. */
export function normalizeGlobalConfig(content: string): string {
  return content.split("\n").sort().join("\n");
}

/** Order-sensitive identity, so reordering still fails the comparison. Do not add sorting. */
export function normalizeConfigPreservingOrder(content: string): string {
  return content;
}
