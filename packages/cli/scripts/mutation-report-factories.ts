/** Stryker `mutation.json` shapes for the specs of the mutation-testing scripts. */
import type {
  Mutant,
  MutantLocation,
  MutationReport,
  ReportedFile,
  ReportedTestFiles,
} from "./mutation-report.js";

/** stryker.cli-commands.config.mjs's set, as a first pass over every mutant in it records it. */
const FIRST_PASS_MUTATE = [
  "packages/cli/src/cli/{commands,hooks}/**/*.{ts,tsx}",
  "packages/cli/src/cli/*.{ts,tsx}",
  "!packages/cli/src/**/*.test.{ts,tsx}",
];

export function buildLocation(
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
): MutantLocation {
  return {
    start: { line: startLine, column: startColumn },
    end: { line: endLine, column: endColumn },
  };
}

export function buildMutant(overrides: Partial<Mutant> = {}): Mutant {
  return {
    mutatorName: "StringLiteral",
    replacement: '""',
    status: "Survived",
    static: false,
    location: buildLocation(1, 1, 1, 2),
    ...overrides,
  };
}

export function buildReportedFile(source: string, mutants: Mutant[]): ReportedFile {
  return { source, mutants };
}

/** Each test is named after its id, which is all a report's `coveredBy` refers to. */
export function buildTestFiles(testIdsByFile: Record<string, string[]>): ReportedTestFiles {
  return Object.fromEntries(
    Object.entries(testIdsByFile).map(([file, ids]) => [
      file,
      { tests: ids.map((id) => ({ id, name: `test ${id}` })) },
    ]),
  );
}

export function buildMutationReport(overrides: Partial<MutationReport> = {}): MutationReport {
  return {
    files: {},
    testFiles: {},
    config: { mutate: FIRST_PASS_MUTATE },
    ...overrides,
  };
}
