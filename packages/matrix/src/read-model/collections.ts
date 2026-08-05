// The two collection shapes every read model builds: ordered groups and a
// by-id lookup. Local to read-model/ on purpose — nothing outside it groups
// or indexes anything.

export const groupBy = <T, K>(
  items: T[],
  keyOf: (item: T) => K
): Map<K, T[]> => {
  const groups = new Map<K, T[]>()
  for (const item of items) {
    const key = keyOf(item)
    const bucket = groups.get(key)
    if (bucket) bucket.push(item)
    else groups.set(key, [item])
  }
  return groups
}

export const indexById = <T extends { id: string }>(
  items: T[]
): Record<string, T> => Object.fromEntries(items.map((item) => [item.id, item]))
