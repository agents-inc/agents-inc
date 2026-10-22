/**
 * The `--mutate` argument holding one range per mutant of the given statuses. Run via
 * `bun scripts/run-mutation-ranges.ts`.
 */
import {
  mutantsOf,
  type MutantLocation,
  type MutantStatus,
  type MutationReport,
} from "./mutation-report.js";

export const DEFAULT_RANGE_STATUSES: readonly MutantStatus[] = ["Ignored"];

/**
 * In report order, one per mutant: two mutants at one place repeat its range, and a mutant nested
 * in another keeps its own. mutation.json counts columns from 1, `--mutate` from 0.
 */
export function mutateRangesOf(report: MutationReport, statuses: readonly MutantStatus[]): string {
  return mutantsOf(report)
    .filter(({ mutant }) => statuses.includes(mutant.status))
    .map(({ file, mutant }) => mutateRangeOf(file, mutant.location))
    .join(",");
}

function mutateRangeOf(file: string, { start, end }: MutantLocation): string {
  return `${file}:${start.line}:${start.column - 1}-${end.line}:${end.column - 1}`;
}
