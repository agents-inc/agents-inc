import { statSync } from "fs";
import fs from "fs/promises";
import path from "path";

import fg from "fast-glob";

const EVERY_ENTRY = "**";
const NOTHING_FOUND = 0;

const DIST_DIR = "dist";

/** Every build rewrites this file, so its mtime stands in for dist/ in the per-test checks. */
const DIST_ENTRY = path.join(DIST_DIR, "index.js");

const DIST_ABSENT = "not there";

type Reading = { readonly label: string; readonly at: number };

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

const WHY_THE_SYMPTOM_MISLEADS =
  "Commands resolve from ./dist/commands (package.json -> oclif.commands.target), so one invoked " +
  "inside that window resolves against an empty directory: help prints no commands, a known " +
  "command is reported as unknown, and a file that should have been written is simply absent. " +
  "Every one of those surfaces as an ordinary assertion failure rather than as a build error, " +
  "which is what makes it read as a regression the change under test caused.";

const RERUN_HINT =
  "Re-run with no other build in flight. Nothing above is evidence about the change under test.";

// Mirrors the negations in tsup.config.ts and turbo.json. Bare directory forms too, since
// `**/__tests__/**` does not match the directory whose mtime a spec deletion moves.
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

const WHY_COMPILE_COUNTS =
  "@workspace/compile is private, unpublished and ships as TypeScript, so tsup inlines it rather " +
  "than importing it (`noExternal` in tsup.config.ts). It holds the config-pair and " +
  "compiled-agent renderers this CLI writes with, so a change there changes what a command emits.";

const WHY_MATRIX_COUNTS =
  "@workspace/matrix is private, unpublished and ships as TypeScript, so tsup inlines it rather " +
  "than importing it (`noExternal` in tsup.config.ts). Its source is compiled into this package's " +
  "dist exactly as src/ is, and it has no build output of its own to go stale instead.";

const WHY_API_COUNTS =
  "@workspace/api is private and ships as TypeScript, so tsup inlines it the same way — and it " +
  "brings hono/client with it, which is the whole of what `fetch-seed.ts` gained by moving onto " +
  "the shared worker client. It arrived on 2026-08-29 and this list is what stops a dist built " +
  "before it from being read as current.";

const REBUILD_HINT =
  "Run `bun run build` first, or `turbo run test`, which orders a build ahead of it.";

const MISSING_DIST_MESSAGE = ["dist/ does not exist.", "", WHY_DIST_DECIDES, "", REBUILD_HINT].join(
  "\n",
);

// `dir` is relative to the CLI package root; `alsoBecause` prints only when that tree moved.
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
  {
    label: "packages/compile/src",
    dir: path.join("..", "compile", "src"),
    alsoBecause: [WHY_COMPILE_COUNTS],
  },
  {
    label: "packages/api/src",
    dir: path.join("..", "api", "src"),
    alsoBecause: [WHY_API_COUNTS],
  },
] as const satisfies readonly BuildInputTree[];

/**
 * Refuses a run whose `dist/` predates any tree compiled into it; a refusal, not a rebuild.
 * Keep this module free of imports beyond node builtins and fast-glob: a `globalSetup` loads it.
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
 * Per spec file, before any `beforeAll`: the per-test guard runs in `beforeEach`, which a throwing
 * `beforeAll` skips. Presence only, since a mid-run source edit does not invalidate this run.
 */
export function assertDistIsPresent(cliRoot: string): void {
  if (distEntryWrittenAt(cliRoot) !== NOTHING_FOUND) return;

  throw new Error(MISSING_DIST_MESSAGE);
}

/**
 * Detects (not prevents) another build replacing `dist/` mid-run, so the failure is named rather
 * than read as a regression. Returns the check so no caller can refresh its baseline.
 */
export function guardAgainstDistReplacement(cliRoot: string): () => void {
  const guardedAt = distEntryWrittenAt(cliRoot);

  return function assertDistUnchanged(): void {
    const distNow = distEntryWrittenAt(cliRoot);
    if (holdsTheGuardedBuild(guardedAt, distNow)) return;

    throw new Error(replacedDistMessage(guardedAt, distNow));
  };
}

/** Absence always fails, or a baseline taken mid-`clean` would compare absent against absent. */
function holdsTheGuardedBuild(guardedAt: number, distNow: number): boolean {
  if (distNow === NOTHING_FOUND) return false;

  return distNow === guardedAt;
}

// Not a catch: a permission or I/O failure must not read as "the build moved".
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
 * Editors save by rename, so saving a spec moves its directory's mtime; such directories drop out.
 * Cost: a build input deleted from a directory where an ignored entry also moved goes unseen.
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

// Directories too: a deletion leaves only its parent directory's mtime to read.
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

// A count, since a tree whose every reading is accounted for still holds build inputs.
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

// An empty scan reads like an unchanged one, so a moved package would silently stop being guarded.
function unreadableTreeMessage(unreadable: readonly ScannedTree[]): string {
  const labels = unreadable.map((tree) => tree.label).join(", ");

  return [
    `A tree this guard compares against dist/ holds nothing: ${labels}.`,
    "",
    "Either the checkout is incomplete or the package moved and BUILD_INPUT_TREES in " +
      "src/cli/lib/testing/dist-staleness.ts still names the old path.",
  ].join("\n");
}
