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
