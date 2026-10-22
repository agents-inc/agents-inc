import { spawnSync } from "child_process";
import { writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  buildLocation,
  buildMutant,
  buildMutationReport,
  buildReportedFile,
} from "./mutation-report-factories.js";
import { summaryOf } from "./mutation-summary.js";
import type { MutationReport } from "./mutation-report.js";

const RUNNER = path.resolve(import.meta.dirname, "run-mutation-summary.ts");

const EDIT = "packages/cli/src/cli/commands/edit.tsx";
const INIT = "packages/cli/src/cli/commands/init.tsx";

const EDIT_SOURCE = [
  "export const LABEL = 'Switching';",
  "if (count > 0) {",
  "  log(line);",
  "}",
].join("\n");
const INIT_SOURCE = "export const DEFAULT_SCOPE = 'project';";
/** A call spanning lines, which Stryker prints its replacement of across lines too. */
const SPANNING_SOURCE = [
  "const anyAlone = entries.some(({",
  "  others",
  "}) => others.length === 1);",
].join("\n");

const HEADER = "file\tKilled\tSurvived\tNoCoverage\tTimeout\tIgnored\tCompileError\tRuntimeError";

/** Every status the summary lists, a killed one it does not, and a survivor no test ran. */
function reportOfTwoFiles(): MutationReport {
  return buildMutationReport({
    files: {
      [EDIT]: buildReportedFile(EDIT_SOURCE, [
        buildMutant({
          status: "Survived",
          mutatorName: "StringLiteral",
          replacement: '""',
          testsCompleted: 4,
          location: buildLocation(1, 22, 1, 33),
        }),
        buildMutant({
          status: "Killed",
          mutatorName: "ConditionalExpression",
          replacement: "true",
          testsCompleted: 2,
          location: buildLocation(2, 5, 2, 14),
        }),
        buildMutant({
          status: "NoCoverage",
          mutatorName: "BlockStatement",
          replacement: "{\n}",
          location: buildLocation(2, 16, 4, 2),
        }),
      ]),
      [INIT]: buildReportedFile(INIT_SOURCE, [
        buildMutant({
          status: "Survived",
          mutatorName: "StringLiteral",
          replacement: '""',
          testsCompleted: 0,
          static: true,
          location: buildLocation(1, 30, 1, 39),
        }),
        buildMutant({ status: "Ignored" }),
        buildMutant({ status: "Timeout", mutatorName: "EqualityOperator", replacement: "a" }),
      ]),
    },
  });
}

const LISTED = [
  `Survived ${EDIT}:1:22 StringLiteral tests=4 static=false | 'Switching' -> ""`,
  `NoCoverage ${EDIT}:2:16 BlockStatement tests=- static=false | {… -> { }`,
  `Survived ${INIT}:1:30 StringLiteral tests=0 static=true | 'project' -> ""`,
  `Timeout ${INIT}:1:1 EqualityOperator tests=- static=false | e -> a`,
];

const COUNTS = [
  HEADER,
  `${EDIT}\t1\t1\t1\t0\t0\t0\t0`,
  `${INIT}\t0\t1\t0\t1\t1\t0\t0`,
  "TOTAL\t1\t2\t1\t1\t1\t0\t0",
  "Survived after 0 tests: 1",
];

describe("the summary of a report", () => {
  it("counts each file's mutants by status, then the totals and the survivors no test ran", () => {
    expect(summaryOf(reportOfTwoFiles(), { list: false })).toStrictEqual(COUNTS);
  });

  it("lists each survived, uncovered and timed-out mutant after the counts, and no killed one", () => {
    expect(summaryOf(reportOfTwoFiles(), { list: true })).toStrictEqual([...COUNTS, ...LISTED]);
  });

  it("cuts the code a mutant replaces and its replacement to 70 characters", () => {
    const long = "x".repeat(80);
    const report = buildMutationReport({
      files: {
        [EDIT]: buildReportedFile(`const value = "${long}";`, [
          buildMutant({ replacement: `"${long}"`, location: buildLocation(1, 15, 1, 97) }),
        ]),
      },
    });

    expect(summaryOf(report, { list: true }).at(-1)).toBe(
      `Survived ${EDIT}:1:15 StringLiteral tests=- static=false | "${"x".repeat(69)} -> "${"x".repeat(69)}`,
    );
  });

  it("lists a replacement spanning lines on one line, each run of whitespace one space", () => {
    const report = buildMutationReport({
      files: {
        [EDIT]: buildReportedFile(SPANNING_SOURCE, [
          buildMutant({
            mutatorName: "MethodExpression",
            replacement: "entries.every(({\n  others\n}) => others.length === 1)",
            testsCompleted: 2,
            location: buildLocation(1, 18, 3, 27),
          }),
        ]),
      },
    });

    expect(summaryOf(report, { list: true }).at(-1)).toBe(
      `Survived ${EDIT}:1:18 MethodExpression tests=2 static=false | entries.some(({… -> entries.every(({ others }) => others.length === 1)`,
    );
  });

  it("counts no survivor no test ran when every survivor ran one", () => {
    const report = buildMutationReport({
      files: { [EDIT]: buildReportedFile(EDIT_SOURCE, [buildMutant({ testsCompleted: 3 })]) },
    });

    expect(summaryOf(report, { list: false }).at(-1)).toBe("Survived after 0 tests: 0");
  });

  it("refuses a mutant placed on a line its file does not have", () => {
    const report = buildMutationReport({
      files: {
        [INIT]: buildReportedFile(INIT_SOURCE, [
          buildMutant({ location: buildLocation(5, 1, 5, 4) }),
        ]),
      },
    });

    expect(() => summaryOf(report, { list: true })).toThrow(
      `${INIT} has no line 5, where a Survived StringLiteral mutant starts`,
    );
  });
});

describe("bun scripts/run-mutation-summary.ts", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(cleanupTempDir));
  });

  async function writtenReport(): Promise<string> {
    const dir = await createTempDir("mutation-summary-");
    dirs.push(dir);
    const reportFile = path.join(dir, "mutation.json");
    writeFileSync(reportFile, JSON.stringify(reportOfTwoFiles()));
    return reportFile;
  }

  it("prints the counts, one line each", async () => {
    const result = spawnSync("bun", [RUNNER, await writtenReport()], { encoding: "utf-8" });

    expect([result.status, result.stdout]).toStrictEqual([
      EXIT_CODES.SUCCESS,
      `${COUNTS.join("\n")}\n`,
    ]);
  });

  it("prints the open mutants after the counts with --list", async () => {
    const result = spawnSync("bun", [RUNNER, await writtenReport(), "--list"], {
      encoding: "utf-8",
    });

    expect([result.status, result.stdout]).toStrictEqual([
      EXIT_CODES.SUCCESS,
      `${[...COUNTS, ...LISTED].join("\n")}\n`,
    ]);
  });

  it("refuses a run that names no report, saying how to name one", () => {
    const result = spawnSync("bun", [RUNNER], { encoding: "utf-8" });

    expect([result.status, result.stdout, result.stderr]).toStrictEqual([
      EXIT_CODES.INVALID_ARGS,
      "",
      "Usage: bun scripts/run-mutation-summary.ts <mutation.json> [--list]\n",
    ]);
  });
});
