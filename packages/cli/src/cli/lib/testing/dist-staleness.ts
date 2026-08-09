import fs from "fs/promises";
import path from "path";

import fg from "fast-glob";

const EVERY_ENTRY = "**";
const NOTHING_FOUND = 0;

const DIST_DIR = "dist";

// Mirrors the entry negations in tsup.config.ts and the `inputs` negations in
// turbo.json: nothing matched here is compiled into dist, so touching one of
// these cannot make dist stale — and the most common thing anyone does before
// running the suite is edit a spec.
//
// Each directory is named alongside its contents on purpose. `**/__tests__/**`
// does not match `__tests__` itself, and a directory's own mtime moves every
// time a file inside it is created or deleted, so without the bare form a new
// spec file would read as a source change.
//
// The same list covers both trees below. packages/matrix has no `__tests__`
// anywhere — its specs sit beside the code as `*.test.ts`, which the first
// entry catches — so the bare directory forms are inert there rather than
// wrong. One consequence is worth knowing before it surprises anyone: EDITING a
// matrix spec does not trip the guard (a file's own mtime moves, and that file
// is ignored), but ADDING or DELETING one does, because it moves the mtime of a
// source directory that is not ignored. That is a refusal you did not need, not
// a green you should not have had.
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

const REBUILD_HINT = "Run `bun run build`, or `bun run test`, which builds first.";

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

type ScannedTree = BuildInputTree & { readonly changedAt: number };

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
 * else reaches. `bun run test` and `npm test` rebuild through the `pretest`
 * hook, and `turbo test` rebuilds through `test -> dependsOn: ["build"]` — and
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

  const trees = await scanBuildInputTrees(cliRoot);
  const unreadable = trees.filter(holdsNothing);
  if (unreadable.length > 0) {
    throw new Error(unreadableTreeMessage(unreadable));
  }

  const staleTrees = trees.filter((tree) => tree.changedAt > distBuiltAt);
  if (staleTrees.length === 0) return;

  throw new Error(staleDistMessage(distBuiltAt, staleTrees));
}

async function scanBuildInputTrees(cliRoot: string): Promise<readonly ScannedTree[]> {
  return Promise.all(BUILD_INPUT_TREES.map((tree) => scanTree(cliRoot, tree)));
}

async function scanTree(cliRoot: string, tree: BuildInputTree): Promise<ScannedTree> {
  const changedAt = await newestModifiedTime(path.join(cliRoot, tree.dir), NOT_BUILD_INPUT);

  return { ...tree, changedAt };
}

// Directories as well as files (`onlyFiles: false`), because a deletion is the
// case this exists for and an unlinked file leaves no file behind to stat —
// only its parent directory's mtime moves.
async function newestModifiedTime(dir: string, ignore: string[] = []): Promise<number> {
  const entries = await fg(EVERY_ENTRY, {
    cwd: dir,
    absolute: true,
    dot: true,
    onlyFiles: false,
    ignore,
  });
  const stats = await Promise.all(entries.map((entry) => fs.stat(entry)));

  return Math.max(NOTHING_FOUND, ...stats.map((stat) => stat.mtimeMs));
}

function holdsNothing(tree: ScannedTree): boolean {
  return tree.changedAt === NOTHING_FOUND;
}

function staleDistMessage(distBuiltAt: number, staleTrees: readonly ScannedTree[]): string {
  const labels = staleTrees.map((tree) => tree.label).join(" and ");
  const extraReasons = staleTrees.flatMap((tree) => tree.alsoBecause);

  return [
    `dist/ is stale — ${labels} changed since the last build.`,
    ...alignedTimes(distBuiltAt, staleTrees),
    "",
    WHY_DIST_DECIDES,
    ...extraReasons.flatMap((reason) => ["", reason]),
    "",
    REBUILD_HINT,
  ].join("\n");
}

function alignedTimes(distBuiltAt: number, staleTrees: readonly ScannedTree[]): string[] {
  const rows = [
    { label: "dist built:", at: distBuiltAt },
    ...staleTrees.map((tree) => ({ label: `${tree.label} changed:`, at: tree.changedAt })),
  ];
  const column = Math.max(...rows.map((row) => row.label.length));

  return rows.map((row) => `  ${row.label.padEnd(column)}  ${new Date(row.at).toISOString()}`);
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
