/** Bare ids do not match registry entries. */
export function buildMarketplacePluginRef(id: string, marketplace: string): string {
  return `${id}@${marketplace}`;
}

export function parseMarketplacePluginRef(ref: string): string {
  const separator = ref.indexOf("@");
  return separator === -1 ? ref : ref.slice(0, separator);
}
