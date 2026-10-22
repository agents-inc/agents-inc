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
import { mutateRangesOf } from "./mutation-ranges.js";
import type { MutationReport } from "./mutation-report.js";

const RUNNER = path.resolve(import.meta.dirname, "run-mutation-ranges.ts");

const EDIT = "packages/cli/src/cli/commands/edit.tsx";
const INIT = "packages/cli/src/cli/commands/init.tsx";
const SOURCE = "unread by the ranges";

/** One mutant of each status the passes feed on, and one they never do, across two files. */
function reportOfEveryStatus(): MutationReport {
  return buildMutationReport({
    files: {
      [EDIT]: buildReportedFile(SOURCE, [
        buildMutant({ status: "Ignored", location: buildLocation(3, 5, 3, 9) }),
        buildMutant({ status: "Survived", location: buildLocation(7, 1, 8, 3) }),
        buildMutant({ status: "Killed", location: buildLocation(9, 2, 9, 6) }),
      ]),
      [INIT]: buildReportedFile(SOURCE, [
        buildMutant({ status: "NoCoverage", location: buildLocation(12, 10, 12, 20) }),
        buildMutant({ status: "Ignored", location: buildLocation(40, 1, 41, 1) }),
      ]),
    },
  });
}

/** A first pass whose mutants are all open or judged: nothing for its static pass. */
function reportWithoutIgnoredMutants(): MutationReport {
  return buildMutationReport({
    files: {
      [EDIT]: buildReportedFile(SOURCE, [
        buildMutant({ status: "Survived", location: buildLocation(7, 1, 8, 3) }),
        buildMutant({ status: "Killed", location: buildLocation(9, 2, 9, 6) }),
      ]),
    },
  });
}

describe("the --mutate ranges of a report's mutants", () => {
  it("counts a range's columns from 0, where the report counts them from 1", () => {
    const report = buildMutationReport({
      files: {
        [EDIT]: buildReportedFile(SOURCE, [
          buildMutant({ status: "Ignored", location: buildLocation(3, 5, 3, 9) }),
        ]),
      },
    });

    expect(mutateRangesOf(report, ["Ignored"])).toBe(`${EDIT}:3:4-3:8`);
  });

  it("gives the Ignored mutants of every file one range each, and no other mutant", () => {
    expect(mutateRangesOf(reportOfEveryStatus(), ["Ignored"])).toBe(
      `${EDIT}:3:4-3:8,${INIT}:40:0-41:0`,
    );
  });

  it("gives the mutants of each status it is asked for, and none of the rest", () => {
    expect(mutateRangesOf(reportOfEveryStatus(), ["Survived", "NoCoverage"])).toBe(
      `${EDIT}:7:0-8:2,${INIT}:12:9-12:19`,
    );
  });

  it("gives a mutant nested inside another its own range beside the outer one", () => {
    const report = buildMutationReport({
      files: {
        [EDIT]: buildReportedFile(SOURCE, [
          buildMutant({ status: "Ignored", location: buildLocation(2, 1, 6, 2) }),
          buildMutant({ status: "Ignored", location: buildLocation(3, 5, 3, 9) }),
        ]),
      },
    });

    expect(mutateRangesOf(report, ["Ignored"])).toBe(`${EDIT}:2:0-6:1,${EDIT}:3:4-3:8`);
  });

  it("repeats a range two mutants at the same place share", () => {
    const report = buildMutationReport({
      files: {
        [EDIT]: buildReportedFile(SOURCE, [
          buildMutant({ status: "Ignored", mutatorName: "StringLiteral" }),
          buildMutant({ status: "Ignored", mutatorName: "ConditionalExpression" }),
        ]),
      },
    });

    expect(mutateRangesOf(report, ["Ignored"])).toBe(`${EDIT}:1:0-1:1,${EDIT}:1:0-1:1`);
  });

  it("gives nothing when no mutant has a status it is asked for", () => {
    expect(mutateRangesOf(reportOfEveryStatus(), ["Timeout"])).toBe("");
  });
});

describe("bun scripts/run-mutation-ranges.ts", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map(cleanupTempDir));
  });

  async function writtenReport(report = reportOfEveryStatus()): Promise<string> {
    const dir = await createTempDir("mutation-ranges-");
    dirs.push(dir);
    const reportFile = path.join(dir, "mutation.json");
    writeFileSync(reportFile, JSON.stringify(report));
    return reportFile;
  }

  it("prints the Ignored mutants' ranges when given no statuses, with nothing after them", async () => {
    const result = spawnSync("bun", [RUNNER, await writtenReport()], { encoding: "utf-8" });

    expect([result.status, result.stdout]).toStrictEqual([
      EXIT_CODES.SUCCESS,
      `${EDIT}:3:4-3:8,${INIT}:40:0-41:0`,
    ]);
  });

  it("prints the ranges of the comma-separated statuses it is given", async () => {
    const result = spawnSync("bun", [RUNNER, await writtenReport(), "Survived,NoCoverage"], {
      encoding: "utf-8",
    });

    expect([result.status, result.stdout]).toStrictEqual([
      EXIT_CODES.SUCCESS,
      `${EDIT}:7:0-8:2,${INIT}:12:9-12:19`,
    ]);
  });

  it("refuses a report with no Ignored mutant when given no statuses, rather than print nothing", async () => {
    const reportFile = await writtenReport(reportWithoutIgnoredMutants());

    const result = spawnSync("bun", [RUNNER, reportFile], { encoding: "utf-8" });

    expect([result.status, result.stdout, result.stderr]).toStrictEqual([
      EXIT_CODES.ERROR,
      "",
      `No mutant in ${reportFile} has the status Ignored, so there is nothing to mutate. Printing no ranges would turn the Stryker run into a dry run that exits 0.\n`,
    ]);
  });

  it("refuses a report in which no mutant has any of the statuses it is given, naming each", async () => {
    const reportFile = await writtenReport();

    const result = spawnSync("bun", [RUNNER, reportFile, "Timeout,CompileError"], {
      encoding: "utf-8",
    });

    expect([result.status, result.stdout, result.stderr]).toStrictEqual([
      EXIT_CODES.ERROR,
      "",
      `No mutant in ${reportFile} has the status Timeout or CompileError, so there is nothing to mutate. Printing no ranges would turn the Stryker run into a dry run that exits 0.\n`,
    ]);
  });

  it("refuses a status no mutant can have, naming it and the ones that exist", async () => {
    const result = spawnSync("bun", [RUNNER, await writtenReport(), "Survived,Survivd"], {
      encoding: "utf-8",
    });

    expect([result.status, result.stdout, result.stderr]).toStrictEqual([
      EXIT_CODES.INVALID_ARGS,
      "",
      "Unknown mutant status 'Survivd'. A status is one of: Killed, Survived, NoCoverage, Timeout, Ignored, CompileError, RuntimeError\n",
    ]);
  });

  it("refuses a run that names no report, saying how to name one", () => {
    const result = spawnSync("bun", [RUNNER], { encoding: "utf-8" });

    expect([result.status, result.stdout, result.stderr]).toStrictEqual([
      EXIT_CODES.INVALID_ARGS,
      "",
      "Usage: bun scripts/run-mutation-ranges.ts <mutation.json> [Status,Status...] (default: Ignored)\n",
    ]);
  });
});
