import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  buildLocation,
  buildMutant,
  buildMutationReport,
  buildReportedFile,
  buildTestFiles,
} from "./mutation-report-factories.js";
import {
  LOADTIME_FILES_LIST,
  rebuildLoadTimeFiles,
  testFilesThatLoadCommands,
  writeLoadTimeFiles,
} from "./loadtime-files.js";
import type { MutationReport } from "./mutation-report.js";

const RUNNER = path.resolve(import.meta.dirname, "run-rebuild-loadtime-files.ts");

/** The list the runner rewrites; a refusal must leave it as it was. */
const COMMITTED_LIST = path.resolve(import.meta.dirname, "../vitest.loadtime.files.json");

/** Lets the suite drive the runner's success path against a list outside the tree. */
const OUTPUT_FLAG = "--output";

/** Unlike the committed list's name, so the line the runner prints must name the file it wrote. */
const SCRATCH_LIST = "loadtime-files.scratch.json";

const SOURCE = "unread by the list";

const EDIT = "packages/cli/src/cli/commands/edit.tsx";
const HOOK = "packages/cli/src/cli/hooks/init.ts";
const BASE_COMMAND = "packages/cli/src/cli/base-command.ts";
const CONSTS = "packages/cli/src/cli/consts.ts";
const LOADER = "packages/cli/src/cli/lib/loading/source-loader.ts";
/** Cut where the CLI's source prefix ends, its path reads `engine.ts`, as an entry module's would. */
const COMPILE_ENGINE = "packages/compile/src/engine.ts";

const EDIT_SPEC = "packages/cli/src/cli/lib/__tests__/commands/edit.test.ts";
const BARE_RUN_SPEC = "packages/cli/src/cli/lib/__tests__/commands/bare-run.test.ts";
const BASE_COMMAND_SPEC = "packages/cli/src/cli/base-command.test.ts";
const CONSTS_ONLY_SPEC = "packages/cli/src/cli/components/common/summary-panel.test.tsx";
const LOADER_SPEC = "packages/cli/src/cli/lib/loading/source-loader.test.ts";
const UNCOVERING_SPEC = "packages/cli/src/cli/lib/__tests__/commands/list.test.ts";
const COMPILE_ENGINE_SPEC = "packages/cli/src/cli/lib/compiler.test.ts";

/** One range among the first pass's globs: the run still mutated only what the range names. */
const ONE_RANGE = `${EDIT}:1245:17-1245:36`;

const NARROWED_TO_RANGES =
  "The report is from a run narrowed to --mutate ranges: every mutant outside them was carried over from an earlier run, with test ids that do not match this report's. Rebuild it from the report of a first pass of stryker.cli-commands.config.mjs.";

/** Each spec covers one module; LOADER is outside the commands, CONSTS in them but imported by all. */
function reportOverCommandsAndTheirNeighbours(): MutationReport {
  return buildMutationReport({
    files: {
      [EDIT]: buildReportedFile(SOURCE, [
        buildMutant({ status: "Killed", coveredBy: ["4", "1"] }),
        buildMutant({ status: "NoCoverage", coveredBy: [], location: buildLocation(9, 1, 9, 4) }),
      ]),
      [HOOK]: buildReportedFile(SOURCE, [buildMutant({ status: "Survived", coveredBy: ["2"] })]),
      [BASE_COMMAND]: buildReportedFile(SOURCE, [
        buildMutant({ status: "CompileError", coveredBy: ["3"] }),
      ]),
      [CONSTS]: buildReportedFile(SOURCE, [buildMutant({ status: "Killed", coveredBy: ["5"] })]),
      [LOADER]: buildReportedFile(SOURCE, [buildMutant({ status: "Killed", coveredBy: ["6"] })]),
    },
    testFiles: buildTestFiles({
      [EDIT_SPEC]: ["1", "4"],
      [BARE_RUN_SPEC]: ["2"],
      [BASE_COMMAND_SPEC]: ["3"],
      [CONSTS_ONLY_SPEC]: ["5"],
      [LOADER_SPEC]: ["6"],
      [UNCOVERING_SPEC]: ["7"],
    }),
  });
}

const NOTHING_COVERS_A_COMMAND =
  "No test in the report covers a command module, so the list would be empty and the loaded-dist pass would collect no tests. Rebuild it from the report of a first pass of stryker.cli-commands.config.mjs.";

describe("the test files that load a command module", () => {
  it("lists the files covering a command, a hook or an entry module once each, sorted, and no other", () => {
    expect(testFilesThatLoadCommands(reportOverCommandsAndTheirNeighbours())).toStrictEqual([
      "src/cli/base-command.test.ts",
      "src/cli/lib/__tests__/commands/bare-run.test.ts",
      "src/cli/lib/__tests__/commands/edit.test.ts",
    ]);
  });

  it("adds nothing for a mutant no test covers", () => {
    const report = buildMutationReport({
      files: {
        [EDIT]: buildReportedFile(SOURCE, [
          buildMutant({ coveredBy: ["1"] }),
          buildMutant({ status: "NoCoverage", coveredBy: [] }),
        ]),
        [HOOK]: buildReportedFile(SOURCE, [buildMutant({ status: "NoCoverage", coveredBy: [] })]),
      },
      testFiles: buildTestFiles({ [EDIT_SPEC]: ["1"], [BARE_RUN_SPEC]: ["2"] }),
    });

    expect(testFilesThatLoadCommands(report)).toStrictEqual([
      "src/cli/lib/__tests__/commands/edit.test.ts",
    ]);
  });

  it("refuses a report in which no test covers a command, rather than list nothing", () => {
    expect(() => testFilesThatLoadCommands(buildMutationReport())).toThrow(
      NOTHING_COVERS_A_COMMAND,
    );
  });

  it("refuses a report from a run narrowed to --mutate ranges", () => {
    const ranged = buildMutationReport({
      ...reportOverCommandsAndTheirNeighbours(),
      config: { mutate: [`${EDIT}:1245:17-1245:36`] },
    });

    expect(() => testFilesThatLoadCommands(ranged)).toThrow(
      "The report is from a run narrowed to --mutate ranges: every mutant outside them was carried over from an earlier run, with test ids that do not match this report's. Rebuild it from the report of a first pass of stryker.cli-commands.config.mjs.",
    );
  });

  it("refuses a report whose --mutate holds one range among the first pass's globs", () => {
    const firstPass = reportOverCommandsAndTheirNeighbours();
    const partlyRanged = buildMutationReport({
      ...firstPass,
      config: { mutate: [...firstPass.config.mutate, ONE_RANGE] },
    });

    expect(() => testFilesThatLoadCommands(partlyRanged)).toThrow(NARROWED_TO_RANGES);
  });

  it("refuses a report narrowed to whole lines, a range with no columns", () => {
    const lineRanged = buildMutationReport({
      ...reportOverCommandsAndTheirNeighbours(),
      config: { mutate: [`${EDIT}:1245-1250`] },
    });

    expect(() => testFilesThatLoadCommands(lineRanged)).toThrow(NARROWED_TO_RANGES);
  });

  it("adds no file covering only a module outside the CLI's source, whatever its path reads as", () => {
    const report = buildMutationReport({
      files: {
        [EDIT]: buildReportedFile(SOURCE, [buildMutant({ coveredBy: ["1"] })]),
        [COMPILE_ENGINE]: buildReportedFile(SOURCE, [buildMutant({ coveredBy: ["2"] })]),
      },
      testFiles: buildTestFiles({ [EDIT_SPEC]: ["1"], [COMPILE_ENGINE_SPEC]: ["2"] }),
    });

    expect(testFilesThatLoadCommands(report)).toStrictEqual([
      "src/cli/lib/__tests__/commands/edit.test.ts",
    ]);
  });

  it("refuses a mutant covered by a test the report does not hold", () => {
    const report = buildMutationReport({
      files: { [EDIT]: buildReportedFile(SOURCE, [buildMutant({ coveredBy: ["1", "9"] })]) },
      testFiles: buildTestFiles({ [EDIT_SPEC]: ["1"] }),
    });

    expect(() => testFilesThatLoadCommands(report)).toThrow(
      `A mutant in ${EDIT} is covered by test 9, which no test file in the report holds.`,
    );
  });

  it("refuses a report that records no coverage for a command's mutant", () => {
    const report = buildMutationReport({
      files: {
        [EDIT]: buildReportedFile(SOURCE, [buildMutant({ coveredBy: ["1"] }), buildMutant()]),
      },
      testFiles: buildTestFiles({ [EDIT_SPEC]: ["1"] }),
    });

    expect(() => testFilesThatLoadCommands(report)).toThrow(
      `A mutant in ${EDIT} records no coverage, so the report cannot say which tests reach it. Rebuild it from the report of a first pass of stryker.cli-commands.config.mjs.`,
    );
  });

  it("refuses a covering test file outside packages/cli, which its config cannot collect", () => {
    const report = buildMutationReport({
      files: { [EDIT]: buildReportedFile(SOURCE, [buildMutant({ coveredBy: ["1"] })]) },
      testFiles: buildTestFiles({ "apps/editor/src/app.test.ts": ["1"] }),
    });

    expect(() => testFilesThatLoadCommands(report)).toThrow(
      "Test file apps/editor/src/app.test.ts is outside packages/cli/, so vitest.loadtime.config.ts cannot collect it.",
    );
  });
});

describe("the load-time file list written from a report", () => {
  const LIST_FILE = "vitest.loadtime.files.json";
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir("loadtime-files-");
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  it("writes the files as a JSON list, one path per line", () => {
    const listFile = path.join(dir, LIST_FILE);

    writeLoadTimeFiles(reportOverCommandsAndTheirNeighbours(), listFile);

    expect(readFileSync(listFile, "utf-8")).toBe(
      [
        "[",
        '  "src/cli/base-command.test.ts",',
        '  "src/cli/lib/__tests__/commands/bare-run.test.ts",',
        '  "src/cli/lib/__tests__/commands/edit.test.ts"',
        "]",
        "",
      ].join("\n"),
    );
  });

  it("writes no list where there was none when it refuses the report", () => {
    const listFile = path.join(dir, LIST_FILE);

    expect(() => writeLoadTimeFiles(buildMutationReport(), listFile)).toThrow(
      NOTHING_COVERS_A_COMMAND,
    );
    expect(existsSync(listFile)).toBe(false);
  });
});

describe("the load-time file list rebuilt from a report file", () => {
  const LIST_FILE = "vitest.loadtime.files.json";
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir("loadtime-files-rebuild-");
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  it("rewrites the committed list beside vitest.loadtime.config.ts, which reads it", () => {
    expect(LOADTIME_FILES_LIST).toBe(COMMITTED_LIST);
  });

  it("writes the files the report names and says how many it wrote, and where", () => {
    const reportFile = path.join(dir, "mutation.json");
    const listFile = path.join(dir, LIST_FILE);
    writeFileSync(reportFile, JSON.stringify(reportOverCommandsAndTheirNeighbours()));

    const said = rebuildLoadTimeFiles(reportFile, listFile);

    expect(said).toBe("  ✓ wrote 3 test files to vitest.loadtime.files.json");
    expect(JSON.parse(readFileSync(listFile, "utf-8"))).toStrictEqual([
      "src/cli/base-command.test.ts",
      "src/cli/lib/__tests__/commands/bare-run.test.ts",
      "src/cli/lib/__tests__/commands/edit.test.ts",
    ]);
  });
});

describe("bun scripts/run-rebuild-loadtime-files.ts", () => {
  it("refuses a run that names no report, saying how to name one", () => {
    const result = spawnSync("bun", [RUNNER], { encoding: "utf-8" });

    expect([result.status, result.stdout, result.stderr]).toStrictEqual([
      EXIT_CODES.INVALID_ARGS,
      "",
      "Usage: bun scripts/run-rebuild-loadtime-files.ts <mutation.json> [--output <file>]\n",
    ]);
  });
});

describe("bun scripts/run-rebuild-loadtime-files.ts, given a report it refuses", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await createTempDir("loadtime-files-runner-");
  });

  afterEach(async () => {
    await cleanupTempDir(dir);
  });

  it("names why, exits 1 and leaves the committed list as it was", () => {
    const reportFile = path.join(dir, "mutation.json");
    const ranged = buildMutationReport({
      ...reportOverCommandsAndTheirNeighbours(),
      config: { mutate: [ONE_RANGE] },
    });
    writeFileSync(reportFile, JSON.stringify(ranged));
    const listBefore = readFileSync(COMMITTED_LIST, "utf-8");

    const result = spawnSync("bun", [RUNNER, reportFile], { encoding: "utf-8" });

    expect([result.status, result.stdout]).toStrictEqual([EXIT_CODES.ERROR, ""]);
    expect(result.stderr).toContain(NARROWED_TO_RANGES);
    expect(readFileSync(COMMITTED_LIST, "utf-8")).toBe(listBefore);
  });
});

describe("bun scripts/run-rebuild-loadtime-files.ts --output <file>", () => {
  let dir: string;
  let reportFile: string;
  let committedBefore: string;

  beforeEach(async () => {
    dir = await createTempDir("loadtime-files-output-");
    reportFile = path.join(dir, "mutation.json");
    writeFileSync(reportFile, JSON.stringify(reportOverCommandsAndTheirNeighbours()));
    committedBefore = readFileSync(COMMITTED_LIST, "utf-8");
  });

  afterEach(async () => {
    // A runner that ignores the option rewrites the tracked list: the spec has failed by then, and
    // putting the list back keeps that failure from leaving the tree changed.
    if (readFileSync(COMMITTED_LIST, "utf-8") !== committedBefore) {
      writeFileSync(COMMITTED_LIST, committedBefore);
    }
    await cleanupTempDir(dir);
  });

  it.each([
    {
      order: "before the report",
      argumentsFor: (listFile: string) => [OUTPUT_FLAG, listFile, reportFile],
    },
    {
      order: "after the report",
      argumentsFor: (listFile: string) => [reportFile, OUTPUT_FLAG, listFile],
    },
  ])(
    "writes the list to the file it names, says so and exits 0, leaving the committed list as it was, with the option $order",
    ({ argumentsFor }) => {
      const listFile = path.join(dir, SCRATCH_LIST);

      const result = spawnSync("bun", [RUNNER, ...argumentsFor(listFile)], {
        encoding: "utf-8",
      });

      expect([result.status, result.stdout, result.stderr]).toStrictEqual([
        EXIT_CODES.SUCCESS,
        `  ✓ wrote 3 test files to ${SCRATCH_LIST}\n`,
        "",
      ]);
      expect(JSON.parse(readFileSync(listFile, "utf-8"))).toStrictEqual([
        "src/cli/base-command.test.ts",
        "src/cli/lib/__tests__/commands/bare-run.test.ts",
        "src/cli/lib/__tests__/commands/edit.test.ts",
      ]);
      expect(readFileSync(COMMITTED_LIST, "utf-8")).toBe(committedBefore);
    },
  );

  it("refuses the option with no file after it, naming it, rather than rewrite the committed list", () => {
    const result = spawnSync("bun", [RUNNER, reportFile, OUTPUT_FLAG], { encoding: "utf-8" });

    expect([result.status, result.stdout]).toStrictEqual([EXIT_CODES.INVALID_ARGS, ""]);
    expect(result.stderr).toContain(OUTPUT_FLAG);
    expect(readFileSync(COMMITTED_LIST, "utf-8")).toBe(committedBefore);
  });
});
