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
 * Locale-free string ordering for anything emitted into a file somebody commits. `localeCompare`
 * with no locale argument reads the process's default collation, which Node takes from LC_ALL /
 * LANG — so it is a colleague's desktop language, not a future ICU build, that reorders a
 * regenerated catalogue. Lithuanian and Latvian both place `y` immediately after `i`, which is
 * enough to swap the shipped `mobile-storage` and `mobile-styling`. `<` compares code units and
 * cannot.
 */
export function bytewise(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
