/** Locale-free ordering for committed output: `localeCompare` follows the process locale. */
export function bytewise(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function inAnEnglishList(items: readonly string[]): string {
  const last = items.at(-1)
  if (last === undefined) return ""
  if (items.length === 1) return last

  return `${items.slice(0, -1).join(", ")} and ${last}`
}
