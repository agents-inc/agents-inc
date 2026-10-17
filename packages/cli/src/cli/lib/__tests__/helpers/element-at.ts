// Throwing indexed reads for tests, in place of `!` or `?.` under `noUncheckedIndexedAccess`.

export function elementAt<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(
      `Expected an element at index ${index}, but the collection holds ${items.length}.`,
    );
  }
  return item;
}

export function firstElement<T>(items: readonly T[]): T {
  return elementAt(items, 0);
}

export function entryAt<T>(record: Readonly<Record<string, T | undefined>>, key: string): T {
  const value = record[key];
  if (value === undefined) {
    throw new Error(
      `Expected an entry for "${key}", but the record holds: ${Object.keys(record).join(", ")}.`,
    );
  }
  return value;
}
