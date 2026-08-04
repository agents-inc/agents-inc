/**
 * Normalize a serialized `config.ts` for order-insensitive equality comparison.
 *
 * Strips the machine-specific projects-tracking line and sorts the remaining
 * lines so re-serialization ordering differences do not mask a genuine entry
 * addition or removal. Used by dual-scope lifecycle tests that assert a
 * project-scope edit leaves the global config untouched.
 */
export function normalizeGlobalConfig(content: string): string {
  return content
    .split("\n")
    .filter((line) => !line.includes('"projects"'))
    .sort()
    .join("\n");
}
