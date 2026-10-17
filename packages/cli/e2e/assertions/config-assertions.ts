import { expect } from "vitest";

// For a composite invariant, map rows to a joined key first; `context` adds a second failure line.
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
