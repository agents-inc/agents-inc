// Type-safe Object.entries that preserves key types (avoids `as [K, V][]` casts)
export function typedEntries<K extends string, V>(obj: Partial<Record<K, V>>): [K, V][] {
  return Object.entries(obj) as [K, V][];
}

// Type-safe Object.keys that preserves key types (avoids `as K[]` casts)
export function typedKeys<K extends string>(obj: Partial<Record<K, unknown>>): K[] {
  return Object.keys(obj) as K[];
}

// Type-safe Object.fromEntries that preserves key types (avoids `as Partial<Record<K, V>>` casts)
export function typedFromEntries<K extends string, V>(
  entries: Iterable<readonly [K, V]>,
): Partial<Record<K, V>> {
  return Object.fromEntries(entries) as Partial<Record<K, V>>;
}

// Type-safe Object.values over a Partial record — yields only present values,
// filtering the undefined slots the Partial type admits (no assert-style cast)
export function typedValues<K extends string, V>(obj: Partial<Record<K, V>>): V[] {
  return Object.values(obj).filter((value): value is V => value !== undefined);
}
