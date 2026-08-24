import { statSync } from "fs";
import fs from "fs/promises";
import path from "path";

import fg from "fast-glob";

const EVERY_ENTRY = "**";
const NOTHING_FOUND = 0;

const DIST_DIR = "dist";

/**
 * The one file in dist/ every build rewrites, and the one `main` and both `bin` entries name.
 *
 * Its mtime stands in for the whole directory below, where {@link assertDistIsFresh} scans the
 * tree: that scan runs once per run and this one runs at every test, so the cost has to be a
 * single stat. It reads a replacement in both of the shapes a build produces — absent while
 * `clean` has the directory emptied, and moved forward once the emit has finished — and it would
 * still read one if `clean` were ever dropped, because tsup rewrites the file either way.
 */
const DIST_ENTRY = path.join(DIST_DIR, "index.js");

/** How an absent dist/ prints: mid-`clean`, or a checkout where nothing has been built yet. */
const DIST_ABSENT = "not there";

/** A time a message reports, under the name of what was read to get it. */
type Reading = { readonly label: string; readonly at: number };

/** One entry a scan read, under the time it last changed. */
type EntryReading = { readonly path: string; readonly changedAt: number };

const DIST_BUILT_LABEL = "dist built:";
const GUARDED_AT_LABEL = "guarded at:";
const DIST_NOW_LABEL = "dist now:";

const REPLACED_DIST_HEADLINE = "dist/ was replaced while this run was in flight.";

const WHY_A_REBUILD_EMPTIES_DIST =
  "tsup builds with `clean: true`, so a `bun run build` started from anywhere else empties dist/ " +
  "before refilling it, and nothing serialises that against a suite already executing out of it. " +
  "The npm `pretest*` hooks used to be three such places and were removed on 2026-08-23 — " +
  "turbo.json already ordered a build ahead of each task, so they were a second build that raced " +
  "the first. What remains is a second AGENT, or a build run by hand in another terminal.";

// Stated door-neutrally, unlike WHY_DIST_DECIDES further down: both suites read this one, and
// the E2E half spawns bin/run.js under a pseudo-terminal rather than calling runCliCommand.
const WHY_THE_SYMPTOM_MISLEADS =
  "Commands resolve from ./dist/commands (package.json -> oclif.commands.target), so one invoked " +
  "inside that window resolves against an empty directory: help prints no commands, a known " +
  "command is reported as unknown, and a file that should have been written is simply absent. " +
  "Every one of those surfaces as an ordinary assertion failure rather than as a build error, " +
  "which is what makes it read as a regression the change under test caused.";

const RERUN_HINT =
  "Re-run with no other build in flight. Nothing above is evidence about the change under test.";

// Mirrors the entry negations in tsup.config.ts and the `inputs` negations in
// turbo.json: nothing matched here is compiled into dist, so touching one of
// these cannot make dist stale — and the most common thing anyone does before
// running the suite is edit a spec.
//
// Read twice below, and the second read is what keeps that true: once as an
// ignore list, so nothing matched here is compared against dist, and once as a
// pattern list, so a directory whose mtime one of these moved can be told from
// one whose mtime a lost build input moved — see
// directoriesAnIgnoredChangeAccountsFor.
//
// Each directory is named alongside its contents on purpose. `**/__tests__/**`
// does not match `__tests__` itself, and a directory's own mtime moves every
// time a file inside it is created or deleted, so without the bare form
// deleting a spec would read as a source change.
//
// The same list covers both trees below. packages/matrix has no `__tests__`
// anywhere — its specs sit beside the code as `*.test.ts`, which the first
// entry catches — so the bare directory forms are inert there rather than
// wrong.
const NOT_BUILD_INPUT = [
  "**/*.test.ts",
  "**/*.test.tsx",
  "**/__tests__",
  "**/__tests__/**",
  "**/__mocks__",
  "**/__mocks__/**",
];

const WHY_DIST_DECIDES =
  "The `commands` specs — and anything else calling runCliCommand — drive oclif through " +
  "./dist/commands (package.json -> oclif.commands.target), so their result describes the last " +
  "build rather than the tree in front of you.";

const WHY_MATRIX_COUNTS =
  "@workspace/matrix is private, unpublished and ships as TypeScript, so tsup inlines it rather " +
  "than importing it (`noExternal` in tsup.config.ts). Its source is compiled into this package's " +
  "dist exactly as src/ is, and it has no build output of its own to go stale instead.";

const REBUILD_HINT =
  "Run `bun run build` first, or `turbo run test`, which orders a build ahead of it.";

const MISSING_DIST_MESSAGE = ["dist/ does not exist.", "", WHY_DIST_DECIDES, "", REBUILD_HINT].join(
  "\n",
);

// Every tree tsup compiles into dist/. `dir` is relative to the CLI package
// root, which the caller supplies — the matrix hop leaves the package, and a
// checkout where it no longer lands on a tree is the empty scan below.
// `alsoBecause` is printed only when that tree is the one that moved, so
// editing a command does not make anyone read about matrix.
type BuildInputTree = {
  readonly label: string;
  readonly dir: string;
  readonly alsoBecause: readonly string[];
};

type ScannedTree = BuildInputTree & {
  readonly changedAt: number;
  readonly buildInputCount: number;
};

const BUILD_INPUT_TREES = [
  { label: "packages/cli/src", dir: "src", alsoBecause: [] },
  {
    label: "packages/matrix/src",
    dir: path.join("..", "matrix", "src"),
    alsoBecause: [WHY_MATRIX_COUNTS],
  },
] as const satisfies readonly BuildInputTree[];

/**
 * Refuses a run whose `dist/` predates any tree compiled into it.
 *
 * A stale `dist/` is invisible in the direction that matters: a command spec
 * that stays green after its command's source is deleted reads as "nothing
 * depended on it". Deliberately a refusal and not a rebuild — a direct
 * `vitest run` stays fast and stays something you asked for.
 *
 * Called from `vitest.global-setup.ts`, which is the invocation path nothing
 * else reaches. `turbo test` orders a build ahead of the run through
 * `test -> dependsOn: ["build"]`, and since 2026-08-23 that is the ONLY thing that
 * does: the npm `pretest*` hooks were removed because they were a second build
 * racing turbo's first. A bare `bun run test` inside this package now reaches this
 * refusal rather than a rebuild, which is the posture this file argues for — and
 * turbo covers packages/matrix as well as src/, because a dependency package's
 * files are hashed into the dependent's build task even though matrix has no
 * `build` script of its own (measured on turbo 2.10.8: a one-line matrix edit
 * turns the CLI's cached build from FULL TURBO into a re-run). Neither of those
 * sees `npx vitest run <file>`, which is how most scoped runs here are actually
 * made. So this scans both trees for the same reason turbo hashes both.
 *
 * Keep this module dependency-free beyond node builtins and fast-glob. It is
 * imported by a `globalSetup` hook, which runs before dist/ freshness is known
 * and before any spec is collected; anything it drags in is transpiled and
 * evaluated at that point, and a module graph reaching back into the CLI would
 * make the guard's own cost grow with the code it guards.
 */
export async function assertDistIsFresh(cliRoot: string): Promise<void> {
  const distBuiltAt = await newestModifiedTime(path.join(cliRoot, DIST_DIR));
  if (distBuiltAt === NOTHING_FOUND) {
    throw new Error(MISSING_DIST_MESSAGE);
  }

  const trees = await scanBuildInputTrees(cliRoot, distBuiltAt);
  const unreadable = trees.filter(holdsNothing);
  if (unreadable.length > 0) {
    throw new Error(unreadableTreeMessage(unreadable));
  }

  const staleTrees = trees.filter((tree) => tree.changedAt > distBuiltAt);
  if (staleTrees.length === 0) return;

  throw new Error(staleDistMessage(distBuiltAt, staleTrees));
}

/**
 * Refuses a spec file that begins with no `dist/` under it.
 *
 * The narrowest of the three checks here, and the narrowness is the point.
 * {@link assertDistIsFresh} asks whether the build MATCHES THE TREE, which is a property of the
 * moment a run starts: a source edit landing mid-run does not invalidate the build the run is
 * already executing out of, it means the NEXT run has to rebuild. Asked per spec file instead, it
 * refuses every file that begins after another agent touches `src/` — measured in this checkout,
 * one `packages/matrix/src` edit two minutes into an E2E run refused most of the suite's spec
 * files and left hundreds of tests unrun, none of which was evidence about anything.
 *
 * **What it buys over {@link guardAgainstDistReplacement} is WHEN it speaks, and the reason
 * stated here until 2026-08-23 was a different one that has since been fixed.** That reason was
 * that the per-test guard takes ABSENCE as its baseline inside the window `clean: true` opens and
 * then compares absence against absence — equal, and silent. {@link holdsTheGuardedBuild} closed
 * it by refusing the not-found reading outright, so an absent `dist/` is now refused at every test
 * boundary of both suites, in files that never call this one.
 *
 * What the per-test guard still cannot do is speak EARLY. Its first word is the first
 * `beforeEach`, vitest runs that after every `beforeAll` in the file, and a `beforeAll` that
 * throws SKIPS every `beforeEach` under it. So for a spec that reaches the binary from a
 * `beforeAll` — every one that launches a wizard, and every one built on `createE2EPluginSource`,
 * which spawns `build plugins` and `build marketplace` — the per-test guard is not merely later,
 * it is unreachable.
 *
 * Measured against `e2e/lifecycle/global-scope-install-reporting.e2e.test.ts`, whose `beforeAll`
 * drives a whole init wizard through a PTY, with `dist/index.js` and `dist/commands` removed and
 * `dist/` itself left newer than `src/` so the run-scoped scan still passes: this refuses the file
 * in under a second naming the build, and without it the same file spends 45s and fails with
 * `timeout waiting for "Choose a stack"` — an ordinary assertion failure naming nothing about a
 * build, over a screen reading `init is not a agents-inc command`. That misattribution is what
 * this module exists to prevent, and no later check gets to make it.
 *
 * A single stat, because this is asked once per spec file rather than once per run. `dist/index.js`
 * is what stands in for the directory, for the reason given on {@link DIST_ENTRY}.
 */
export function assertDistIsPresent(cliRoot: string): void {
  if (distEntryWrittenAt(cliRoot) !== NOTHING_FOUND) return;

  throw new Error(MISSING_DIST_MESSAGE);
}

/**
 * Reads which build `dist/` currently holds, and answers the check that refuses once it is a
 * different one.
 *
 * The sibling of {@link assertDistIsFresh}, asked at the other end of the run. That one asks once,
 * before anything is collected, whether the build matches the tree; this one asks at every test
 * whether the build is still the one the file started over. Neither question implies the other,
 * and only this one can see a SECOND agent working in the same checkout: `clean: true` empties
 * dist/ before refilling it, so a build started anywhere else deletes, mid-flight, the directory
 * this run resolves its commands from.
 *
 * **Detection rather than prevention, and deliberately.** Nothing here stops the race — two agents
 * building one tree is what the workflow does, and the routes that would serialise it each cost
 * more than it does: dropping `clean` reinstates the orphaned command modules it was turned on
 * for, a lock file wedges the tree when a build is killed, and an output directory keyed per
 * process cannot be honoured by `oclif.commands.target`, which is a fixed string in package.json.
 * What the race actually costs is misattribution — every symptom it produces is an assertion
 * failure, so it reads as a regression the change under test caused, and the lane spends its time
 * disproving that. A named refusal costs one re-run instead.
 *
 * The guard is taken per SPEC FILE, where each suite's setup file is evaluated, and that is the
 * honest scope: a file whose dist moved under it produced a result over two different builds, and
 * a file that started after the rebuild finished ran against one complete build and is sound.
 *
 * Returns the check rather than taking a baseline argument, so no caller can hold the two apart
 * or refresh one against the other — a baseline that moved when the guard fired would name the
 * cause in the first test only, and every test after it would go back to reporting the symptom.
 */
export function guardAgainstDistReplacement(cliRoot: string): () => void {
  const guardedAt = distEntryWrittenAt(cliRoot);

  return function assertDistUnchanged(): void {
    const distNow = distEntryWrittenAt(cliRoot);
    if (holdsTheGuardedBuild(guardedAt, distNow)) return;

    throw new Error(replacedDistMessage(guardedAt, distNow));
  };
}

/**
 * Whether `dist/` still holds a build at all, and the same one the guard was taken over.
 *
 * The second clause is the obvious half; the first is the one that has to be written down,
 * because comparing the readings alone cannot express it. Absence reads as {@link NOTHING_FOUND},
 * so a file whose setup was evaluated inside the window `clean: true` opens takes ABSENCE as its
 * baseline, and every check it then makes compares absence against absence — equal, and silent —
 * while each command the file drives resolves against a directory that is not there. Which files
 * land in that window is a matter of when a worker happened to pick them up, so the run reports
 * the cause on some of its files and an ordinary assertion failure on the rest.
 *
 * No run reaches here with nothing ever built: {@link assertDistIsFresh} refuses that before a
 * spec is collected, in both suites. So an absent reading at a test boundary always means
 * something removed the build after this run started.
 */
function holdsTheGuardedBuild(guardedAt: number, distNow: number): boolean {
  if (distNow === NOTHING_FOUND) return false;

  return distNow === guardedAt;
}

// `throwIfNoEntry: false` rather than a catch: absence is the reading this guard exists to take,
// and it is being taken against a directory something else is deleting — while a permission or
// I/O failure is a different fault that must not be laundered into "the build moved".
function distEntryWrittenAt(cliRoot: string): number {
  const entry = statSync(path.join(cliRoot, DIST_ENTRY), { throwIfNoEntry: false });
  if (!entry) return NOTHING_FOUND;

  return entry.mtimeMs;
}

function replacedDistMessage(guardedAt: number, distNow: number): string {
  return [
    REPLACED_DIST_HEADLINE,
    ...alignedReadings([
      { label: GUARDED_AT_LABEL, at: guardedAt },
      { label: DIST_NOW_LABEL, at: distNow },
    ]),
    "",
    WHY_A_REBUILD_EMPTIES_DIST,
    "",
    WHY_THE_SYMPTOM_MISLEADS,
    "",
    RERUN_HINT,
  ].join("\n");
}

async function scanBuildInputTrees(
  cliRoot: string,
  distBuiltAt: number,
): Promise<readonly ScannedTree[]> {
  return Promise.all(BUILD_INPUT_TREES.map((tree) => scanTree(cliRoot, tree, distBuiltAt)));
}

async function scanTree(
  cliRoot: string,
  tree: BuildInputTree,
  distBuiltAt: number,
): Promise<ScannedTree> {
  const dir = path.join(cliRoot, tree.dir);
  const [buildInputs, ignored] = await Promise.all([
    readEntries(dir, EVERY_ENTRY, NOT_BUILD_INPUT),
    readEntries(dir, NOT_BUILD_INPUT),
  ]);
  const accountedFor = directoriesAnIgnoredChangeAccountsFor(ignored, distBuiltAt);
  const evidence = buildInputs.filter((entry) => !accountedFor.has(entry.path));

  return { ...tree, changedAt: newestChange(evidence), buildInputCount: buildInputs.length };
}

/**
 * Directories whose mtime a change to something the build never compiles already accounts for.
 *
 * A directory's mtime is the only reading a DELETION leaves — an unlinked file is not there to
 * stat — which is why the scan reads directories at all. But every entry that arrives or leaves
 * moves that same one reading, and a SAVE is one of them: mainstream editors write the new
 * contents to a temp file beside the original and rename it into place, so saving a spec moves the
 * mtime of the directory holding it however thoroughly the spec itself is ignored. An in-place
 * overwrite moves neither mtime, so the refusal fired on the ordinary save and not on the rare one.
 *
 * So a directory holding something ignored that has itself moved since the build has an
 * explanation for its mtime that the build does not care about, and drops out of the comparison.
 *
 * **What that gives up, exactly:** a build input DELETED from a directory where a spec, a
 * `__tests__` or a `__mocks__` entry was also written since the last build. Those two events leave
 * one reading between them, and nothing in it says which of them moved it. Nothing else is given
 * up — a build input added or edited carries an mtime of its own, and a deletion from a directory
 * whose ignored entries all predate the build is still the only account of its mtime there is.
 */
function directoriesAnIgnoredChangeAccountsFor(
  ignored: readonly EntryReading[],
  distBuiltAt: number,
): ReadonlySet<string> {
  const movedSinceBuild = ignored.filter((entry) => entry.changedAt > distBuiltAt);

  return new Set(movedSinceBuild.map((entry) => path.dirname(entry.path)));
}

async function newestModifiedTime(dir: string): Promise<number> {
  return newestChange(await readEntries(dir, EVERY_ENTRY));
}

function newestChange(entries: readonly EntryReading[]): number {
  return Math.max(NOTHING_FOUND, ...entries.map((entry) => entry.changedAt));
}

// Directories as well as files (`onlyFiles: false`), because a deletion is the
// case this exists for and an unlinked file leaves no file behind to stat —
// only its parent directory's mtime moves.
async function readEntries(
  dir: string,
  patterns: string | string[],
  ignore: string[] = [],
): Promise<readonly EntryReading[]> {
  const paths = await fg(patterns, {
    cwd: dir,
    absolute: true,
    dot: true,
    onlyFiles: false,
    ignore,
  });

  return Promise.all(
    paths.map(async (entry) => ({ path: entry, changedAt: (await fs.stat(entry)).mtimeMs })),
  );
}

// A count rather than the newest reading above it, which the two answered
// together until a directory's mtime could be accounted for elsewhere: a tree
// whose every reading is accounted for holds build inputs and reports no
// change, and reading that back as an empty scan would refuse the whole run.
function holdsNothing(tree: ScannedTree): boolean {
  return tree.buildInputCount === NOTHING_FOUND;
}

function staleDistMessage(distBuiltAt: number, staleTrees: readonly ScannedTree[]): string {
  const labels = staleTrees.map((tree) => tree.label).join(" and ");
  const extraReasons = staleTrees.flatMap((tree) => tree.alsoBecause);

  return [
    `dist/ is stale — ${labels} changed since the last build.`,
    ...alignedReadings([
      { label: DIST_BUILT_LABEL, at: distBuiltAt },
      ...staleTrees.map((tree) => ({ label: `${tree.label} changed:`, at: tree.changedAt })),
    ]),
    "",
    WHY_DIST_DECIDES,
    ...extraReasons.flatMap((reason) => ["", reason]),
    "",
    REBUILD_HINT,
  ].join("\n");
}

/** One indented `label   time` row per reading, labels padded into a common column. */
function alignedReadings(readings: readonly Reading[]): string[] {
  const column = Math.max(...readings.map((reading) => reading.label.length));

  return readings.map(
    (reading) => `  ${reading.label.padEnd(column)}  ${asTimeOrAbsent(reading.at)}`,
  );
}

function asTimeOrAbsent(at: number): string {
  if (at === NOTHING_FOUND) return DIST_ABSENT;

  return new Date(at).toISOString();
}

// An empty scan reads identically to an unchanged one, so a moved or renamed
// package would take its tree out of the comparison and say nothing. The guard
// that quietly stops guarding is the failure this whole file exists to prevent.
function unreadableTreeMessage(unreadable: readonly ScannedTree[]): string {
  const labels = unreadable.map((tree) => tree.label).join(", ");

  return [
    `A tree this guard compares against dist/ holds nothing: ${labels}.`,
    "",
    "Either the checkout is incomplete or the package moved and BUILD_INPUT_TREES in " +
      "src/cli/lib/testing/dist-staleness.ts still names the old path.",
  ].join("\n");
}
