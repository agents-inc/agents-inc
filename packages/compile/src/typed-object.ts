// The built-ins widen keys to `string`; each cast restores `K`.
export function typedEntries<K extends string, V>(
  obj: Partial<Record<K, V>>
): [K, V][] {
  return Object.entries(obj) as [K, V][]
}

export function typedKeys<K extends string>(
  obj: Partial<Record<K, unknown>>
): K[] {
  return Object.keys(obj) as K[]
}

export function typedFromEntries<K extends string, V>(
  entries: Iterable<readonly [K, V]>
): Partial<Record<K, V>> {
  return Object.fromEntries(entries) as Partial<Record<K, V>>
}
