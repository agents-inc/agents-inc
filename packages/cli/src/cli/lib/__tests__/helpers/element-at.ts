/**
 * Asserting indexed reads for test assertions.
 *
 * Under `noUncheckedIndexedAccess` every `items[0]` is `T | undefined`. The types bible
 * bans `!`, and `packages/cli/CLAUDE.md` bans `?? fallback` and `?.` on data that must
 * exist — which leaves a throwing lookup as the only honest way to narrow one. These are
 * the array equivalent of `getSkillById`: they state the expectation and fail loudly with
 * the index and the collection's real length, instead of "cannot read property of
 * undefined" from somewhere further down the assertion.
 *
 * Use them ONLY in tests. Production code should be arranged so the element's presence is
 * provable — iterate, destructure with a guard, or look up through an asserting accessor.
 */

/** The element at `index`, or a failure naming the index and the collection's length. */
export function elementAt<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(
      `Expected an element at index ${index}, but the collection holds ${items.length}.`,
    );
  }
  return item;
}

/** The first element, or a failure saying the collection was empty. */
export function firstElement<T>(items: readonly T[]): T {
  return elementAt(items, 0);
}

/**
 * The value at `key`, or a failure naming the key and the record's own keys.
 *
 * The record equivalent of {@link elementAt}: `record[key] ?? {}` reads as an absence guard
 * but is satisfied just as well by a key that quietly stopped being populated, so a spec
 * asserting the ABSENCE of fields on that value passes whether the key is present-and-empty
 * or missing entirely — the two cases an absence spec exists to tell apart.
 */
export function entryAt<T>(record: Readonly<Record<string, T | undefined>>, key: string): T {
  const value = record[key];
  if (value === undefined) {
    throw new Error(
      `Expected an entry for "${key}", but the record holds: ${Object.keys(record).join(", ")}.`,
    );
  }
  return value;
}
