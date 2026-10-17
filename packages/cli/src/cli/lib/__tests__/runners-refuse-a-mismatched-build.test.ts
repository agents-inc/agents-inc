import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { invokedNamesIn } from "./helpers/test-only-invocations.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Both suites execute the same `dist/` through oclif, so neither is exempt from the refusal. */
const SUITE_CONFIGS = ["vitest.config.ts", "e2e/vitest.config.ts"];

/**
 * Asked once per run, from `globalSetup`: a source edit mid-run does not invalidate the build
 * already executing, so a per-file freshness check would refuse specs whenever anyone saves a file.
 */
const RUN_SCOPED_GUARD = "assertDistIsFresh";
const FILE_SCOPED_GUARD = "assertDistIsPresent";

/** Asked per test: only it can see `dist/` replaced while a spec is running. */
const PER_TEST_GUARD = "guardAgainstDistReplacement";

/** A `beforeAll` in this `setupFiles` entry runs before every E2E spec file, at no call site. */
const E2E_HARNESS = "e2e/setup.ts";

/**
 * `globalSetup` runs once before collection; `setupFiles` runs per spec file in the worker, the
 * only place a per-test hook can register, and its throw fails the test rather than exiting 0.
 */
type SuiteHook = "globalSetup" | "setupFiles";

type SuiteHookFiles = { config: string; files: readonly string[] };

type ScannedFile = { file: string; invoked: readonly string[] };

type LoadedSuiteConfig = { default: { test?: Partial<Record<SuiteHook, string | string[]>> } };

/** Derived from the configs, so a new suite without the guard is seen. */
async function hookFilesOf(config: string, hook: SuiteHook): Promise<SuiteHookFiles> {
  // Parse boundary: vitest's own config type admits far more than the shape a gate must declare.
  const loaded = (await import(
    pathToFileURL(path.join(CLI_ROOT, config)).href
  )) as LoadedSuiteConfig;

  return { config, files: asFileList(loaded.default.test?.[hook]) };
}

function asFileList(hookFiles: string | string[] | undefined): readonly string[] {
  if (hookFiles === undefined) return [];
  if (typeof hookFiles === "string") return [hookFiles];

  return hookFiles;
}

async function scanFile(file: string): Promise<ScannedFile> {
  const source = await readFile(path.join(CLI_ROOT, file), "utf8");

  return { file, invoked: invokedNamesIn(source, file) };
}

async function filesNotInvoking(name: string, files: readonly string[]): Promise<string[]> {
  const scanned = await Promise.all(files.map(scanFile));

  return scanned.filter(({ invoked }) => !invoked.includes(name)).map(({ file }) => file);
}

/**
 * Proves the wiring: each runner asks for the refusal of an absent or stale `dist/`, which
 * otherwise surfaces as `expected 127 to be 1` or a green run over the old build. Whether the check
 * reads a tree correctly is `testing/dist-staleness.test.ts`'s subject.
 */
describe("a suite that executes dist/ refuses a build that does not match the tree", () => {
  it("reaches the dist guard from every suite's globalSetup", async () => {
    const suites = await Promise.all(
      SUITE_CONFIGS.map((config) => hookFilesOf(config, "globalSetup")),
    );

    // Subject guard: a config naming no globalSetup leaves the roster nothing to judge.
    expect(
      suites.filter(({ files }) => files.length === 0).map(({ config }) => config),
      "a suite config names no globalSetup — there is nothing for a start-of-run refusal to live in",
    ).toStrictEqual([]);

    const guardless = await filesNotInvoking(
      RUN_SCOPED_GUARD,
      suites.flatMap(({ files }) => files),
    );

    expect(
      guardless,
      "a suite starts against dist/ without checking it, so a missing or stale build reaches its specs as an ordinary assertion failure",
    ).toStrictEqual([]);
  });

  it("reads the built tree from the E2E harness door, not the shim git tracks", async () => {
    const harness = await readFile(path.join(CLI_ROOT, E2E_HARNESS), "utf8");
    const invoked = invokedNamesIn(harness, E2E_HARNESS);

    // Subject guard: deleting the hook would empty the invocation assertion's subject.
    expect(
      harness,
      `${E2E_HARNESS} no longer registers the door in a beforeAll — there is nothing left to judge`,
    ).toContain("beforeAll");

    expect(
      invoked,
      "the E2E build guard checks something other than the build, so it returns cleanly in exactly the failure it exists to name",
    ).toContain(FILE_SCOPED_GUARD);

    // A per-file freshness scan passes when working alone and refuses under concurrent edits.
    expect(
      invoked,
      "the per-file door asks the run-scoped question, so any source edit made while the suite runs refuses every spec file that has not started yet",
    ).not.toContain(RUN_SCOPED_GUARD);
  });
});

/**
 * A concurrent build (`clean: true`) empties `dist/` under a running suite, failing unrelated
 * specs. This proves each runner registers the per-test guard; the check is tested elsewhere.
 */
describe("a suite that executes dist/ refuses a build that lands while it is running", () => {
  it("takes the per-test build guard from every suite's setup files", async () => {
    const suites = await Promise.all(
      SUITE_CONFIGS.map((config) => hookFilesOf(config, "setupFiles")),
    );

    // Subject guard: a config naming no setup file leaves the roster nothing to judge.
    expect(
      suites.filter(({ files }) => files.length === 0).map(({ config }) => config),
      "a suite config names no setupFiles — there is nowhere for a per-test refusal to be registered",
    ).toStrictEqual([]);

    const guardless = await filesNotInvoking(
      PER_TEST_GUARD,
      suites.flatMap(({ files }) => files),
    );

    expect(
      guardless,
      "a suite runs its tests over whatever dist/ happens to hold at the time, so a build replacing it mid-run reaches its specs as an ordinary assertion failure",
    ).toStrictEqual([]);
  });
});
