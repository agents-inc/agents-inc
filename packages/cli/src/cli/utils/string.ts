export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "\u2026";
}

/** Converts a kebab-case string to a space-separated Title Case string. */
export function toTitleCase(kebabCase: string): string {
  return kebabCase
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Locale-free string ordering for anything emitted into a file somebody commits.
 *
 * Declared in `@workspace/compile` because the emitters moved there — `generateStackAgentConfig`
 * orders a config-types.ts property list with it — and re-exported here so no CLI call site
 * moved. The reason it is not `localeCompare` lives with the declaration.
 */
export { bytewise } from "@workspace/compile";
