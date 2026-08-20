import { expect } from "vitest";

/**
 * Asserts that an array has no duplicate entries.
 *
 * Callers needing a composite invariant (e.g. "no duplicate (name, scope)
 * pair") map their rows to a joined key first; the key string is what the
 * failure message reports. `context` appends caller-supplied detail (such as a
 * full JSON dump of the offending rows) on a second line.
 */
export function expectNoDuplicates(arr: string[], label: string, context?: string): void {
  const duplicates = arr.filter((item, idx) => arr.indexOf(item) !== idx);
  const totalsPerDuplicate = [...new Set(duplicates)].map(
    (item) => `${item} × ${arr.filter((other) => other === item).length}`,
  );
  const contextLine = context ? `\n${context}` : "";

  expect(
    duplicates,
    `Duplicate ${label} found: ${totalsPerDuplicate.join(", ")}${contextLine}`,
  ).toStrictEqual([]);
}
