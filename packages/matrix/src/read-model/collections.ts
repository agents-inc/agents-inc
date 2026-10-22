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
): Partial<Record<T["id"], T>> =>
  // Cast: `Object.fromEntries` widens keys to `string`; each is the item's own id.
  Object.fromEntries(items.map((item) => [item.id, item])) as Partial<
    Record<T["id"], T>
  >
