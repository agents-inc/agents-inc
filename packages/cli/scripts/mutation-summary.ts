/**
 * A report's mutants counted by status, per file and in total, then `Survived after 0 tests`, which
 * must be 0: such a mutant was judged by no test, so it is no result. With `list`, each mutant still
 * open. Run via `bun scripts/run-mutation-summary.ts`.
 */
import {
  MUTANT_STATUSES,
  mutantsOf,
  type Mutant,
  type MutantStatus,
  type MutationReport,
} from "./mutation-report.js";

const OPEN_STATUSES: readonly MutantStatus[] = ["Survived", "NoCoverage", "Timeout"];

const COLUMN_SEPARATOR = "\t";

/** How much of a mutant's code and its replacement a listed line shows. */
const SHOWN_CHARACTERS = 70;

/** Shown in place of a test count for a mutant no test run reached. */
const NO_TEST_COUNT = "-";

/** Ends the code of a mutant spanning lines, of which a listed line shows the first. */
const CONTINUES = "…";

export function summaryOf(report: MutationReport, { list }: { list: boolean }): string[] {
  return [
    ["file", ...MUTANT_STATUSES].join(COLUMN_SEPARATOR),
    ...Object.entries(report.files).map(([file, { mutants }]) => countsRow(file, mutants)),
    countsRow("TOTAL", everyMutantOf(report)),
    `Survived after 0 tests: ${survivorsNoTestRan(report).length}`,
    ...(list ? openMutantLines(report) : []),
  ];
}

function countsRow(label: string, mutants: Mutant[]): string {
  return [
    label,
    ...MUTANT_STATUSES.map((status) => mutants.filter((mutant) => mutant.status === status).length),
  ].join(COLUMN_SEPARATOR);
}

function everyMutantOf(report: MutationReport): Mutant[] {
  return mutantsOf(report).map(({ mutant }) => mutant);
}

function survivorsNoTestRan(report: MutationReport): Mutant[] {
  return everyMutantOf(report).filter(
    (mutant) => mutant.status === "Survived" && mutant.testsCompleted === 0,
  );
}

function openMutantLines(report: MutationReport): string[] {
  return Object.entries(report.files).flatMap(([file, { source, mutants }]) => {
    const lines = source.split("\n");
    return mutants
      .filter((mutant) => OPEN_STATUSES.includes(mutant.status))
      .map((mutant) => openMutantLine(file, lines, mutant));
  });
}

function openMutantLine(file: string, lines: string[], mutant: Mutant): string {
  const { start } = mutant.location;
  const code = replacedCode(file, lines, mutant).trim().slice(0, SHOWN_CHARACTERS);
  const replacement = mutant.replacement.replace(/\s+/g, " ").slice(0, SHOWN_CHARACTERS);

  return `${mutant.status} ${file}:${start.line}:${start.column} ${mutant.mutatorName} tests=${testCountOf(mutant)} static=${mutant.static === true} | ${code} -> ${replacement}`;
}

function replacedCode(file: string, lines: string[], mutant: Mutant): string {
  const { start, end } = mutant.location;
  const firstLine = lines[start.line - 1];
  if (firstLine === undefined) {
    throw new Error(
      `${file} has no line ${start.line}, where a ${mutant.status} ${mutant.mutatorName} mutant starts`,
    );
  }

  return start.line === end.line
    ? firstLine.slice(start.column - 1, end.column - 1)
    : `${firstLine.slice(start.column - 1)}${CONTINUES}`;
}

function testCountOf(mutant: Mutant): string {
  return mutant.testsCompleted === undefined ? NO_TEST_COUNT : String(mutant.testsCompleted);
}
