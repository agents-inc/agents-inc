import { expect } from "vitest";

/** Asserts that an array has no duplicate entries. */
export function expectNoDuplicates(arr: string[], label: string): void {
  const duplicates = arr.filter((item, idx) => arr.indexOf(item) !== idx);
  expect(duplicates, `Duplicate ${label} found: ${duplicates.join(", ")}`).toStrictEqual([]);
}
