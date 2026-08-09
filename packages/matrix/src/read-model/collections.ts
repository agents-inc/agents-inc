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

// Keyed by whatever the items call themselves, and partial because that is what
// an index built from a list is: it holds the ids it was given and nothing else,
// so a lookup answers `undefined` rather than pretending the union is total.
export const indexById = <T extends { id: string }>(
  items: T[]
): Partial<Record<T["id"], T>> =>
  // Boundary cast: `Object.fromEntries` types every key as `string`; each of
  // these is the item's own id, which is the key type being claimed.
  Object.fromEntries(items.map((item) => [item.id, item])) as Partial<
    Record<T["id"], T>
  >

// `Object.entries` widens every key to `string`, which is what forces a cast
// back to the union at each call site. One cast here, in the one place that
// knows the keys came from a record typed by that union.
export const typedEntries = <K extends string, V>(
  record: Partial<Record<K, V>>
): [K, V][] => Object.entries(record) as [K, V][]
