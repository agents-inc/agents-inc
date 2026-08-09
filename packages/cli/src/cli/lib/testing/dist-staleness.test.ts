import { mkdir, rm, utimes, writeFile } from "fs/promises";
import path from "path";

import fg from "fast-glob";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";
import { assertDistIsFresh } from "./dist-staleness.js";

/**
 * The fixture mirrors the real repository layout, because the matrix hop is
 * relative (`<cli>/../matrix/src`) and a moved package is one of the failures
 * this guard exists to report.
 */
const CLI_ROOT_SEGMENTS = ["packages", "cli"];
const MATRIX_SRC_SEGMENTS = ["packages", "matrix", "src"];

const DIST_DIR = "dist";
const CLI_SRC_DIR = "src";
const DIST_FILES = ["dist/index.js", "dist/commands/init.js"];
const CLI_SRC_FILE = "src/cli/commands/init.ts";
/** A spec at the top of the tree, so nothing unignored is left to scan. */
const CLI_ONLY_SPEC_FILE = "src/resolver.test.ts";
const CLI_SPEC_FILE = "src/cli/lib/resolver.test.ts";
const CLI_TESTS_DIR = "src/cli/lib/__tests__";
const CLI_TESTS_HELPER_FILE = "src/cli/lib/__tests__/helpers/cli-runner.ts";
const MATRIX_SRC_FILE = "index.ts";

const BEFORE_BUILD = new Date("2026-01-01T00:00:00.000Z");
const BUILT_AT = new Date("2026-01-02T00:00:00.000Z");
const AFTER_BUILD = new Date("2026-01-03T00:00:00.000Z");

const STALE_CLI_HEADLINE = "dist/ is stale — packages/cli/src changed since the last build.";
const STALE_MATRIX_HEADLINE = "dist/ is stale — packages/matrix/src changed since the last build.";
const STALE_BOTH_HEADLINE =
  "dist/ is stale — packages/cli/src and packages/matrix/src changed since the last build.";
const WHY_MATRIX_COUNTS = "@workspace/matrix is private, unpublished and ships as TypeScript";
const WHY_DIST_DECIDES = "drive oclif through ./dist/commands";
const REBUILD_HINT = "Run `bun run build`";
const MISSING_DIST_HEADLINE = "dist/ does not exist.";
const EMPTY_MATRIX_HEADLINE =
  "A tree this guard compares against dist/ holds nothing: packages/matrix/src.";
const EMPTY_CLI_HEADLINE =
  "A tree this guard compares against dist/ holds nothing: packages/cli/src.";
const DIST_BUILT_ROW = "dist built:";
const CLI_CHANGED_ROW = "packages/cli/src changed:";

async function writeFixtureFile(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, "// fixture\n");
}

/** Every entry under `root`, directories included — the guard reads both. */
async function setModifiedTimeDeep(root: string, at: Date): Promise<void> {
  const entries = await fg("**", { cwd: root, absolute: true, dot: true, onlyFiles: false });

  await Promise.all([root, ...entries].map((entry) => utimes(entry, at, at)));
}

describe("assertDistIsFresh", () => {
  let tempDir: string;
  let cliRoot: string;
  let matrixSrcDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("dist-staleness-");
    cliRoot = path.join(tempDir, ...CLI_ROOT_SEGMENTS);
    matrixSrcDir = path.join(tempDir, ...MATRIX_SRC_SEGMENTS);

    for (const distFile of DIST_FILES) {
      await writeFixtureFile(path.join(cliRoot, distFile));
    }
    await writeFixtureFile(path.join(cliRoot, CLI_SRC_FILE));
    await writeFixtureFile(path.join(cliRoot, CLI_SPEC_FILE));
    await writeFixtureFile(path.join(cliRoot, CLI_TESTS_HELPER_FILE));
    await writeFixtureFile(path.join(matrixSrcDir, MATRIX_SRC_FILE));

    await setModifiedTimeDeep(tempDir, BEFORE_BUILD);
    await setModifiedTimeDeep(path.join(cliRoot, DIST_DIR), BUILT_AT);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("resolves when dist/ is newer than every build input tree", async () => {
    await expect(assertDistIsFresh(cliRoot)).resolves.toBeUndefined();
  });

  it("refuses when a CLI source file changed after the build", async () => {
    await utimes(path.join(cliRoot, CLI_SRC_FILE), AFTER_BUILD, AFTER_BUILD);

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(STALE_CLI_HEADLINE);
  });

  it("refuses when a matrix source file changed after the build", async () => {
    await utimes(path.join(matrixSrcDir, MATRIX_SRC_FILE), AFTER_BUILD, AFTER_BUILD);

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(STALE_MATRIX_HEADLINE);
  });

  it("names both trees when both changed after the build", async () => {
    await utimes(path.join(cliRoot, CLI_SRC_FILE), AFTER_BUILD, AFTER_BUILD);
    await utimes(path.join(matrixSrcDir, MATRIX_SRC_FILE), AFTER_BUILD, AFTER_BUILD);

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(STALE_BOTH_HEADLINE);
  });

  it("explains why matrix counts only when matrix is the tree that moved", async () => {
    await utimes(path.join(matrixSrcDir, MATRIX_SRC_FILE), AFTER_BUILD, AFTER_BUILD);
    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(WHY_MATRIX_COUNTS);

    await utimes(path.join(matrixSrcDir, MATRIX_SRC_FILE), BEFORE_BUILD, BEFORE_BUILD);
    await utimes(path.join(cliRoot, CLI_SRC_FILE), AFTER_BUILD, AFTER_BUILD);
    await expect(assertDistIsFresh(cliRoot)).rejects.not.toThrow(WHY_MATRIX_COUNTS);
  });

  it("prints the aligned build and change times, and the rebuild hint", async () => {
    await utimes(path.join(cliRoot, CLI_SRC_FILE), AFTER_BUILD, AFTER_BUILD);

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(DIST_BUILT_ROW);
    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(CLI_CHANGED_ROW);
    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(BUILT_AT.toISOString());
    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(AFTER_BUILD.toISOString());
    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(REBUILD_HINT);
    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(WHY_DIST_DECIDES);
  });

  it("refuses when a source file was deleted, which moves only its parent directory", async () => {
    await rm(path.join(cliRoot, CLI_SRC_FILE));

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(STALE_CLI_HEADLINE);
  });

  it("ignores an edited spec", async () => {
    await utimes(path.join(cliRoot, CLI_SPEC_FILE), AFTER_BUILD, AFTER_BUILD);

    await expect(assertDistIsFresh(cliRoot)).resolves.toBeUndefined();
  });

  it("ignores an edited file inside a __tests__ directory", async () => {
    await utimes(path.join(cliRoot, CLI_TESTS_HELPER_FILE), AFTER_BUILD, AFTER_BUILD);

    await expect(assertDistIsFresh(cliRoot)).resolves.toBeUndefined();
  });

  it("ignores a spec added directly inside a __tests__ directory", async () => {
    await writeFixtureFile(path.join(cliRoot, CLI_TESTS_DIR, "added.test.ts"));

    await expect(assertDistIsFresh(cliRoot)).resolves.toBeUndefined();
  });

  it("refuses when dist/ does not exist", async () => {
    await rm(path.join(cliRoot, DIST_DIR), { recursive: true });

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(MISSING_DIST_HEADLINE);
  });

  it("refuses when a build input tree holds nothing", async () => {
    await rm(path.join(matrixSrcDir, MATRIX_SRC_FILE));

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(EMPTY_MATRIX_HEADLINE);
  });

  it("refuses when a build input tree is missing entirely", async () => {
    await rm(path.dirname(matrixSrcDir), { recursive: true });

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(EMPTY_MATRIX_HEADLINE);
  });

  it("refuses when a build input tree holds nothing but ignored entries", async () => {
    await rm(path.join(cliRoot, CLI_SRC_DIR), { recursive: true });
    await writeFixtureFile(path.join(cliRoot, CLI_ONLY_SPEC_FILE));

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(EMPTY_CLI_HEADLINE);
  });
});
