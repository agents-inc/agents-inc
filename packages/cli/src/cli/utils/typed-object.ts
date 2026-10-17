// Cast: Object.entries widens keys to string.
export function typedEntries<K extends string, V>(obj: Partial<Record<K, V>>): [K, V][] {
  return Object.entries(obj) as [K, V][];
}

// Cast: Object.keys widens keys to string.
export function typedKeys<K extends string>(obj: Partial<Record<K, unknown>>): K[] {
  return Object.keys(obj) as K[];
}

// Cast: Object.fromEntries widens keys to string.
export function typedFromEntries<K extends string, V>(
  entries: Iterable<readonly [K, V]>,
): Partial<Record<K, V>> {
  return Object.fromEntries(entries) as Partial<Record<K, V>>;
}

// Filters the undefined slots a Partial admits.
export function typedValues<K extends string, V>(obj: Partial<Record<K, V>>): V[] {
  return Object.values(obj).filter((value): value is V => value !== undefined);
}
