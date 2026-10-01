/**
 * Marketplace-qualified plugin reference (`{id}@{marketplace}`) — the form the
 * Claude CLI plugin registry expects. Bare ids do not match registry entries.
 */
export function buildMarketplacePluginRef(id: string, marketplace: string): string {
  return `${id}@${marketplace}`;
}

/**
 * Inverse of buildMarketplacePluginRef: extracts the skill id from a
 * `{id}@{marketplace}` reference. Returns the whole string when no `@` is present.
 */
export function parseMarketplacePluginRef(ref: string): string {
  const separator = ref.indexOf("@");
  return separator === -1 ? ref : ref.slice(0, separator);
}
