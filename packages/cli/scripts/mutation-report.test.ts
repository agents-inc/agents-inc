import { writeFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  buildLocation,
  buildMutant,
  buildMutationReport,
  buildReportedFile,
  buildTestFiles,
} from "./mutation-report-factories.js";
import { readMutationReport } from "./mutation-report.js";

const EDIT = "packages/cli/src/cli/commands/edit.tsx";
const EDIT_SPEC = "packages/cli/src/cli/lib/__tests__/commands/edit.test.ts";

describe("a mutation.json, read", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir("mutation-report-");
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  function written(content: string): string {
    const reportFile = path.join(dir, "mutation.json");
    writeFileSync(reportFile, content);
    return reportFile;
  }

  it("reads the files, mutants, tests and config the scripts use", () => {
    const report = buildMutationReport({
      files: {
        [EDIT]: buildReportedFile("const a = 1;", [
          buildMutant({ status: "Killed", testsCompleted: 2, coveredBy: ["1"] }),
          buildMutant({ status: "NoCoverage", location: buildLocation(1, 7, 1, 8) }),
        ]),
      },
      testFiles: buildTestFiles({ [EDIT_SPEC]: ["1"] }),
    });

    expect(readMutationReport(written(JSON.stringify(report)))).toStrictEqual(report);
  });

  it("refuses a report a run left unfinished, naming the file", () => {
    const unfinished = buildMutationReport({
      files: { [EDIT]: buildReportedFile("const a = 1;", [buildMutant()]) },
    });
    const reportFile = written(JSON.stringify(unfinished).replace('"Survived"', '"Pending"'));

    expect(() => readMutationReport(reportFile)).toThrow(
      `${reportFile} is not a finished Stryker mutation.json:`,
    );
  });
});
