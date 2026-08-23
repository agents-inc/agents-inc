import { mkdir, rename, rm, utimes, writeFile } from "fs/promises";
import path from "path";

import fg from "fast-glob";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils.js";
import { assertDistIsFresh, guardAgainstDistReplacement } from "./dist-staleness.js";

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
/** A source file sharing a directory with a spec, which is what the whole tree looks like. */
const CLI_SRC_FILE_BESIDE_SPEC = "src/cli/lib/resolver.ts";
const CLI_SRC_FILE_ADDED_BESIDE_SPEC = "src/cli/lib/added.ts";
/** What an editor calls the file it writes before renaming it over the one you edited. */
const EDITOR_SWAP_SUFFIX = ".swap";
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

const DIST_ENTRY_FILE = "dist/index.js";
const REPLACED_HEADLINE = "dist/ was replaced while this run was in flight.";
const GUARDED_AT_ROW = "guarded at:";
const DIST_NOW_ROW = "dist now:";
const DIST_ABSENT_READING = "not there";
const WHY_A_REBUILD_EMPTIES_DIST = "tsup builds with `clean: true`";
const WHERE_COMMANDS_RESOLVE = "./dist/commands (package.json -> oclif.commands.target)";
const WHY_THE_SYMPTOM_MISLEADS = "surfaces as an ordinary assertion failure";
const RERUN_HINT = "Re-run with no other build in flight";

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
    await writeFixtureFile(path.join(cliRoot, CLI_SRC_FILE_BESIDE_SPEC));
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

  /**
   * The save every mainstream editor performs: the new contents go to a temp file beside the
   * original and a rename puts them in place. The spec's own mtime moves, which the ignore list
   * covers — and so does the mtime of the directory holding it, which nothing ignores. An
   * in-place overwrite moves neither, so the refusal fired on the ordinary save and not on the
   * rare one.
   */
  it("ignores a spec saved by renaming a temp file over it", async () => {
    const spec = path.join(cliRoot, CLI_SPEC_FILE);
    const swapFile = `${spec}${EDITOR_SWAP_SUFFIX}`;
    await writeFixtureFile(swapFile);

    await rename(swapFile, spec);

    await expect(assertDistIsFresh(cliRoot)).resolves.toBeUndefined();
  });

  it("refuses when a source file is added to a directory whose spec was saved that way", async () => {
    const spec = path.join(cliRoot, CLI_SPEC_FILE);
    const swapFile = `${spec}${EDITOR_SWAP_SUFFIX}`;
    await writeFixtureFile(swapFile);
    await rename(swapFile, spec);

    await writeFixtureFile(path.join(cliRoot, CLI_SRC_FILE_ADDED_BESIDE_SPEC));

    await expect(assertDistIsFresh(cliRoot)).rejects.toThrow(STALE_CLI_HEADLINE);
  });

  /**
   * The one case the rule above gives up, pinned here because a cost nobody can find is a cost
   * nobody can retire. A deletion and a spec write leave the same single reading — the directory's
   * mtime — so once something ignored inside it has moved since the build, the deletion beside it
   * is no longer distinguishable from the save. The test above is its control: a source file ADDED
   * to that same directory still refuses, because an added file carries an mtime of its own.
   */
  it("cannot see a source file deleted from a directory where a spec was also written", async () => {
    await utimes(path.join(cliRoot, CLI_SPEC_FILE), AFTER_BUILD, AFTER_BUILD);

    await rm(path.join(cliRoot, CLI_SRC_FILE_BESIDE_SPEC));

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

/**
 * The sibling guard, read at the other end of the run. `assertDistIsFresh` asks once, before
 * anything is collected, whether the build matches the tree; this asks, at every test, whether
 * the build is still the one the file started over.
 *
 * The fixture stands in for a concurrent `bun run build`: emptying `dist/` is the window
 * `clean: true` opens, and moving the entry's mtime forward is the same build having finished.
 * The race itself is not reproduced here on purpose — a spec that rebuilt this package would
 * empty `dist/` under every other worker in the run, which is the defect rather than a test of it.
 */
describe("guardAgainstDistReplacement", () => {
  let tempDir: string;
  let cliRoot: string;
  let distEntry: string;

  beforeEach(async () => {
    tempDir = await createTempDir("dist-replacement-");
    cliRoot = path.join(tempDir, ...CLI_ROOT_SEGMENTS);
    distEntry = path.join(cliRoot, DIST_ENTRY_FILE);

    await writeFixtureFile(distEntry);
    await utimes(distEntry, BUILT_AT, BUILT_AT);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("passes while dist/ still holds the build it was taken over", () => {
    const assertDistUnchanged = guardAgainstDistReplacement(cliRoot);

    expect(assertDistUnchanged()).toBeUndefined();
  });

  it("refuses while dist/ is empty, which is the window a concurrent build spends there", async () => {
    const assertDistUnchanged = guardAgainstDistReplacement(cliRoot);
    await rm(path.join(cliRoot, DIST_DIR), { recursive: true });

    expect(assertDistUnchanged).toThrow(REPLACED_HEADLINE);
  });

  it("refuses once dist/ has been rebuilt, whether or not a test caught it empty", async () => {
    const assertDistUnchanged = guardAgainstDistReplacement(cliRoot);
    await utimes(distEntry, AFTER_BUILD, AFTER_BUILD);

    expect(assertDistUnchanged).toThrow(REPLACED_HEADLINE);
  });

  it("refuses when it was taken over an absent dist/ that has since appeared", async () => {
    await rm(path.join(cliRoot, DIST_DIR), { recursive: true });
    const assertDistUnchanged = guardAgainstDistReplacement(cliRoot);

    await writeFixtureFile(distEntry);

    expect(assertDistUnchanged).toThrow(REPLACED_HEADLINE);
  });

  /**
   * The case the two readings alone cannot see, and the one a file loading inside the window
   * actually gets: absence is read as a time of zero, so a guard taken over an empty dist/ and
   * checked against the same empty dist/ compares two zeroes and returns cleanly — while every
   * command the file drives resolves against a directory that is not there.
   */
  it("refuses while dist/ is absent, including when the guard was taken inside that window", async () => {
    await rm(path.join(cliRoot, DIST_DIR), { recursive: true });
    const assertDistUnchanged = guardAgainstDistReplacement(cliRoot);

    expect(assertDistUnchanged).toThrow(REPLACED_HEADLINE);
    expect(assertDistUnchanged).toThrow(`${GUARDED_AT_ROW}  ${DIST_ABSENT_READING}`);
    expect(assertDistUnchanged).toThrow(`${DIST_NOW_ROW}    ${DIST_ABSENT_READING}`);
  });

  it("keeps refusing, so every later test names the cause rather than the first one alone", async () => {
    const assertDistUnchanged = guardAgainstDistReplacement(cliRoot);
    await utimes(distEntry, AFTER_BUILD, AFTER_BUILD);

    expect(assertDistUnchanged).toThrow(REPLACED_HEADLINE);
    expect(assertDistUnchanged).toThrow(REPLACED_HEADLINE);
  });

  it("names the mechanism, the symptom it wears and both readings", async () => {
    const assertDistUnchanged = guardAgainstDistReplacement(cliRoot);
    await utimes(distEntry, AFTER_BUILD, AFTER_BUILD);

    expect(assertDistUnchanged).toThrow(GUARDED_AT_ROW);
    expect(assertDistUnchanged).toThrow(DIST_NOW_ROW);
    expect(assertDistUnchanged).toThrow(BUILT_AT.toISOString());
    expect(assertDistUnchanged).toThrow(AFTER_BUILD.toISOString());
    expect(assertDistUnchanged).toThrow(WHY_A_REBUILD_EMPTIES_DIST);
    expect(assertDistUnchanged).toThrow(WHERE_COMMANDS_RESOLVE);
    expect(assertDistUnchanged).toThrow(WHY_THE_SYMPTOM_MISLEADS);
    expect(assertDistUnchanged).toThrow(RERUN_HINT);
  });

  it("reads an absent dist/ as absent rather than as a time", async () => {
    const assertDistUnchanged = guardAgainstDistReplacement(cliRoot);
    await rm(path.join(cliRoot, DIST_DIR), { recursive: true });

    expect(assertDistUnchanged).toThrow(`${DIST_NOW_ROW}    ${DIST_ABSENT_READING}`);
  });
});
