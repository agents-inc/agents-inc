import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { invokedNamesIn } from "./helpers/test-only-invocations.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Every suite this package runs, named by the config that starts it.
 *
 * Both drive the same `dist/`: the unit tree's `commands` project calls oclif's `run()` with this
 * package as its root, and the E2E tree spawns `node bin/run.js` — and oclif resolves commands
 * from `oclif.commands.target` (`./dist/commands`) either way. So a build that no longer matches
 * the tree is the same falsehood in both, and neither is exempt from the refusal below.
 */
const SUITE_CONFIGS = ["vitest.config.ts", "e2e/vitest.config.ts"];

/**
 * Two of the three refusals in `src/cli/lib/testing/dist-staleness.ts`, and they are asked at
 * different scopes on purpose.
 *
 * `assertDistIsFresh` compares the build against the tree, which is a property of the moment a
 * run STARTS — a source edit landing mid-run does not invalidate the build the run is already
 * executing out of. `assertDistIsPresent` asks only whether there is a build to spawn, and asks
 * it from a `beforeAll`, which is earlier than anything else here can speak: the per-test guard's
 * first word is the first `beforeEach`, and a `beforeAll` that throws skips every `beforeEach`
 * under it, so a spec reaching the binary from a `beforeAll` gets no refusal from it at all.
 * Swapping the two is not a refinement: the freshness scan asked per file refuses every spec that
 * begins after another agent saves a source file.
 */
const RUN_SCOPED_GUARD = "assertDistIsFresh";
const FILE_SCOPED_GUARD = "assertDistIsPresent";

/**
 * The third refusal in the same module, asked at every test rather than at either of the scopes
 * above: whether `dist/` still holds the one build the spec file started over. Neither of the
 * others can answer it — both are taken before a spec runs, and the collision they exist for
 * arrives while it is running.
 */
const PER_TEST_GUARD = "guardAgainstDistReplacement";

/**
 * Where the E2E door is asked, which since 2026-08-24 is the HARNESS rather than each spec.
 *
 * It was `ensureBinaryExists`, exported from `e2e/helpers/test-utils.ts` and called from a
 * `beforeAll` in 248 spec files — per-file discipline with no checker over it, where forgetting
 * the call bought a 45-second timeout naming nothing and no reader could tell a spec that omitted
 * it correctly from one that forgot. `e2e/setup.ts` is a `setupFiles` entry, so a `beforeAll`
 * registered there runs once before every spec file in the suite: the same door, at zero call
 * sites, and unforgettable. `spec-gates.test.ts` now asserts the ABSENCE of the per-spec call.
 *
 * The scope claim below is unchanged by the move and is the reason this gate exists at all.
 */
const E2E_HARNESS = "e2e/setup.ts";

/**
 * The two lists of files a suite evaluates around its specs, and the scope each one can speak at.
 *
 * `globalSetup` runs once in vitest's own process, before anything is collected, so it is where a
 * question about the moment a run STARTS belongs. `setupFiles` is evaluated once per spec file
 * inside the worker, which is the only place a per-test hook can be registered from — and a throw
 * from there fails the test rather than being logged and exited 0, which is what a globalSetup
 * teardown does with one.
 */
type SuiteHook = "globalSetup" | "setupFiles";

/** A suite config paired with the files it evaluates for one of those hooks. */
type SuiteHookFiles = { config: string; files: readonly string[] };

/** A file paired with every name it reaches as a value. */
type ScannedFile = { file: string; invoked: readonly string[] };

/** A config's hook lists, each of which vitest admits as one path or several. */
type LoadedSuiteConfig = { default: { test?: Partial<Record<SuiteHook, string | string[]>> } };

/**
 * What each suite evaluates for one hook, derived from the configs rather than listed here.
 *
 * A third suite added without the guard is the case a stated roster cannot see, and it is the
 * case this gate exists for: the E2E suite ran with a `globalSetup` of its own that cleared stale
 * marketplaces and said nothing about the build, while the unit suite refused a mismatched
 * `dist/` outright — and nothing anywhere held the two configs against each other.
 */
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
 * A run that starts against a `dist/` which is absent or predates the tree is refused by name, in
 * every suite that executes `dist/`.
 *
 * The symptom it replaces is the whole reason it exists. With `dist/` absent, `bin/run.js` still
 * starts — it is three lines and git tracks it — and oclif resolves its commands from a directory
 * that is not there, so every command reports itself unknown and exits 127. The spec that asked
 * for one is handed `expected 127 to be 1`: an ordinary assertion failure naming nothing about a
 * build, and indistinguishable from a regression the change under test caused. With `dist/`
 * merely stale it is worse, because the run goes GREEN over the previous build.
 *
 * The unit runner has refused both since its `globalSetup` landed. The E2E runner had a
 * `globalSetup` of its own that removed stale marketplaces and never looked at `dist/`, and a
 * per-spec check that read `bin/run.js` — the one artefact in the whole path that cannot go
 * missing.
 *
 * **What this proves is the WIRING, and that is deliberate.** Whether the refusal reads a tree
 * correctly is `testing/dist-staleness.test.ts`'s subject, against a fixture repository it builds
 * itself. What no behavioural test can reach is whether a runner ASKS: a `globalSetup` resolves
 * to a file by path and takes no root, so there is nothing to invoke against a fixture. The
 * failure here was never in the check — it was that one of two runners never called it.
 */
describe("a suite that executes dist/ refuses a build that does not match the tree", () => {
  it("reaches the dist guard from every suite's globalSetup", async () => {
    const suites = await Promise.all(
      SUITE_CONFIGS.map((config) => hookFilesOf(config, "globalSetup")),
    );

    // Subject guard: a config naming no globalSetup contributes no file, and would satisfy the
    // roster below by leaving it nothing to judge rather than by carrying the guard.
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

    // Subject guard: the door has to still be REGISTERED for a claim about what it checks to mean
    // anything — deleting the hook would satisfy the invocation assertion below by emptying its
    // subject. `beforeAll` is the whole of what makes it per-file rather than per-test.
    expect(
      harness,
      `${E2E_HARNESS} no longer registers the door in a beforeAll — there is nothing left to judge`,
    ).toContain("beforeAll");

    expect(
      invoked,
      "the E2E build guard checks something other than the build, so it returns cleanly in exactly the failure it exists to name",
    ).toContain(FILE_SCOPED_GUARD);

    // The other half of the same claim, and the one a passing suite cannot show you. A per-file
    // freshness scan is green in every run nobody else is working in, and refuses most of a suite
    // the moment somebody is.
    expect(
      invoked,
      "the per-file door asks the run-scoped question, so any source edit made while the suite runs refuses every spec file that has not started yet",
    ).not.toContain(RUN_SCOPED_GUARD);
  });
});

/**
 * A build that lands MID-RUN is refused by name, in every suite that executes `dist/`.
 *
 * The other end of the same collision, and the reason it needs a gate of its own: the refusal
 * above is a statement about the moment a run starts, and cannot see a second agent's build
 * arriving six minutes into one. `clean: true` empties the directory both suites resolve their
 * commands from, so the run that was already executing out of it reports a screen that never
 * showed what it waited for, a command that says it is unknown, or a file that was simply never
 * written — every one an ordinary assertion failure naming an unrelated spec.
 *
 * The check itself, and whether it reads a replaced `dist/` correctly, are
 * `testing/dist-staleness.test.ts`'s subject. What no behavioural test can reach is whether a
 * runner REGISTERS it: a `setupFiles` entry resolves to a file by path and takes no root, so
 * there is nothing to invoke against a fixture, and dropping it from a config removes the hooks
 * silently — the suite stays green in every run nobody else is working in.
 */
describe("a suite that executes dist/ refuses a build that lands while it is running", () => {
  it("takes the per-test build guard from every suite's setup files", async () => {
    const suites = await Promise.all(
      SUITE_CONFIGS.map((config) => hookFilesOf(config, "setupFiles")),
    );

    // Subject guard: a config naming no setup file contributes none, and would satisfy the roster
    // below by leaving it nothing to judge rather than by carrying the guard.
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
