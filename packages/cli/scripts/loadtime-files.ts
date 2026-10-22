/**
 * The test files the loaded-dist pass collects (`vitest.loadtime.files.json`, read by
 * `vitest.loadtime.config.ts`): those holding a test that covers a command module in a first pass
 * of `stryker.cli-commands.config.mjs`. oclif loads a command inside a test, so a file that loads
 * one, from dist or from source, covers its load-time code in one of its tests; no other file can
 * observe that code. Run via `bun scripts/run-rebuild-loadtime-files.ts`.
 */
import { writeFileSync } from "fs";
import path from "path";

import {
  mutantsOf,
  readMutationReport,
  type Mutant,
  type MutationReport,
} from "./mutation-report.js";

export const LOADTIME_FILES_LIST = path.resolve(
  import.meta.dirname,
  "../vitest.loadtime.files.json",
);

const CLI_PACKAGE = "packages/cli/";

const CLI_SOURCE = `${CLI_PACKAGE}src/cli/`;

/** The cli-commands pass's set: these directories, and the entry modules beside them. */
const COMMAND_DIRECTORIES = ["commands/", "hooks/"];

/** In that set, yet every module imports it, so a test covering it need not have loaded a command. */
const IMPORTED_BY_EVERY_MODULE = ["consts.ts"];

/** How Stryker writes a `--mutate` range: `file:line:column-line:column`. */
const MUTATE_RANGE = /:\d+(?::\d+)?-\d+(?::\d+)?$/;

const REBUILD_FROM_A_FIRST_PASS =
  "Rebuild it from the report of a first pass of stryker.cli-commands.config.mjs.";

const NARROWED_TO_RANGES = `The report is from a run narrowed to --mutate ranges: every mutant outside them was carried over from an earlier run, with test ids that do not match this report's. ${REBUILD_FROM_A_FIRST_PASS}`;

const NOTHING_COVERS_A_COMMAND = `No test in the report covers a command module, so the list would be empty and the loaded-dist pass would collect no tests. ${REBUILD_FROM_A_FIRST_PASS}`;

const JSON_INDENT = 2;

export function testFilesThatLoadCommands(report: MutationReport): string[] {
  if (isNarrowedToRanges(report)) throw new Error(NARROWED_TO_RANGES);

  const fileOfTest = testFileById(report);
  const coveringFiles = new Set(
    mutantsOf(report)
      .filter(({ file }) => isCommandModule(file))
      .flatMap(({ file, mutant }) => coveringTestFiles(file, mutant, fileOfTest)),
  );
  if (coveringFiles.size === 0) throw new Error(NOTHING_COVERS_A_COMMAND);

  return [...coveringFiles].map(fromThePackage).sort();
}

/** Refused before anything is written, so a refusal leaves the list as it was. */
export function writeLoadTimeFiles(report: MutationReport, listFile: string): string[] {
  const files = testFilesThatLoadCommands(report);
  writeFileSync(listFile, `${JSON.stringify(files, null, JSON_INDENT)}\n`);

  return files;
}

/** Rewrites the list from the report in `reportFile`, and answers the line saying what it wrote. */
export function rebuildLoadTimeFiles(reportFile: string, listFile: string): string {
  const files = writeLoadTimeFiles(readMutationReport(reportFile), listFile);

  return `  ✓ wrote ${files.length} test files to ${path.basename(listFile)}`;
}

function testFileById(report: MutationReport): Map<string, string> {
  return new Map(
    Object.entries(report.testFiles).flatMap(([file, { tests }]) =>
      tests.map((test) => [test.id, file] as const),
    ),
  );
}

function isNarrowedToRanges(report: MutationReport): boolean {
  return report.config.mutate.some((pattern) => MUTATE_RANGE.test(pattern));
}

/** Absent where the run measured no coverage, which leaves nothing to read. */
function coveringTestFiles(
  mutatedFile: string,
  mutant: Mutant,
  fileOfTest: Map<string, string>,
): string[] {
  if (mutant.coveredBy === undefined) {
    throw new Error(
      `A mutant in ${mutatedFile} records no coverage, so the report cannot say which tests reach it. ${REBUILD_FROM_A_FIRST_PASS}`,
    );
  }

  return mutant.coveredBy.map((testId) => testFileOf(fileOfTest, testId, mutatedFile));
}

function testFileOf(fileOfTest: Map<string, string>, testId: string, mutatedFile: string): string {
  const testFile = fileOfTest.get(testId);
  if (testFile === undefined) {
    throw new Error(
      `A mutant in ${mutatedFile} is covered by test ${testId}, which no test file in the report holds.`,
    );
  }

  return testFile;
}

function isCommandModule(file: string): boolean {
  if (!file.startsWith(CLI_SOURCE)) return false;

  const withinCli = file.slice(CLI_SOURCE.length);
  if (COMMAND_DIRECTORIES.some((directory) => withinCli.startsWith(directory))) return true;

  const isEntryModule = !withinCli.includes("/");
  return isEntryModule && !IMPORTED_BY_EVERY_MODULE.includes(withinCli);
}

/** The list is read from packages/cli; the report names files from the repository root. */
function fromThePackage(testFile: string): string {
  if (!testFile.startsWith(CLI_PACKAGE)) {
    throw new Error(
      `Test file ${testFile} is outside ${CLI_PACKAGE}, so vitest.loadtime.config.ts cannot collect it.`,
    );
  }

  return testFile.slice(CLI_PACKAGE.length);
}
