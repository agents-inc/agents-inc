/**
 * Locale-free ordering for anything emitted into a committed file. `localeCompare` follows the
 * process locale (LC_ALL / LANG), so a colleague's desktop language can reorder output; `<`
 * compares code units and cannot.
 */
export function bytewise(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export function inAnEnglishList(items: readonly string[]): string {
  const last = items.at(-1)
  if (last === undefined) return ""
  if (items.length === 1) return last

  return `${items.slice(0, -1).join(", ")} and ${last}`
}
