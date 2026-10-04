/**
 * A directory tree read into a comparable value, and the normaliser that makes one run's tree
 * comparable with another's.
 *
 * Built for the Claude golden trees in `e2e/lifecycle/claude-install-byte-identity.e2e.test.ts`,
 * which pin every file a Claude install leaves behind so that a refactor claiming "no behaviour
 * change for Claude users" can be checked rather than asserted. A golden tree is only as strict as
 * its normaliser is narrow, so this names each thing it removes and leaves every other byte alone:
 *
 * - **temp paths** — each machine-specific root a run is handed, written `<name>` for the name the
 *   caller files it under, longest root first so a project nested in its HOME keeps its own;
 * - **the CLI version** — only inside the one line that carries it, `Compiled by <version>.` in a
 *   compiled agent's trailing volatile block, and only when it names THIS run's version;
 * - **the install date** — a YAML `date:` field holding a bare date, which is how
 *   `injectForkedFromMetadata` (`lib/skills/skill-metadata.ts`) stamps every ejected skill;
 * - **machine timestamps** — full ISO-8601 instants, which is what the Claude CLI's own plugin
 *   registry records each install at;
 * - **mtimes** — never read at all. A golden tree compares what was written, not when.
 *
 * Nothing is inferred beyond that list. A value this does not know about is left in the tree, so a
 * NEW volatile field reddens the golden by name rather than being absorbed by a pattern that
 * happened to fit it.
 */
import { lstat, readdir, readFile } from "fs/promises";
import path from "path";

import { bytewise } from "../../../utils/string.js";
import { typedEntries } from "../../../utils/typed-object.js";

/** One directory tree as it stands on disk: every file's text, and every directory holding nothing. */
export type InstallTree = {
  /** Each file's text, keyed by its path relative to the tree's root in POSIX form. */
  files: Record<string, string>;
  /** Each directory with nothing in it, in the same form. A directory holding files is implied by them. */
  emptyDirectories: string[];
};

/** One phase of a recorded journey, in the shape `readInstallTree` serialises. */
export type RecordedPhase = {
  files: Record<string, string>;
  emptyDirectories: string[];
};

/** One journey's recorded trees: each phase by name, and the paths the journey does not pin. */
export type RecordedGolden = {
  notPinned: string[];
  phases: Record<string, RecordedPhase>;
};

/** What one run's tree is normalised against. */
export type GoldenTreeContext = {
  /**
   * Each machine-specific root the run was handed, by the name its placeholder is written with —
   * `home` is written `<home>`. Every spelling of one root is listed under its name, because a temp
   * directory reached through a symlink arrives at the CLI resolved, and the two spellings are one
   * directory.
   */
  roots: Record<string, readonly string[]>;
  /** The CLI version the run's agents were compiled by. */
  cliVersion: string;
};

/** Where the compiled-agent template renders the CLI version — `agent.liquid`'s volatile block. */
const COMPILED_BY_PREFIX = "Compiled by ";
const COMPILED_BY_SUFFIX = ".";
const CLI_VERSION_PLACEHOLDER = "<cli-version>";

/** A full ISO-8601 instant, as `Date.prototype.toISOString` writes one. */
const MACHINE_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;
const TIMESTAMP_PLACEHOLDER = "<timestamp>";

/** A YAML `date:` field whose whole value is a bare date — the shape an install stamps. */
const STAMPED_DATE_FIELD = /^(\s*date: )\d{4}-\d{2}-\d{2}$/gm;
const DATE_PLACEHOLDER = "<date>";

/**
 * Reads every file under `root` as text, and names every directory holding nothing.
 *
 * `skip` names paths relative to `root` — a file, or a directory with everything under it — that
 * the tree leaves out whole. It exists for state another program keeps beside the install, whose
 * content no change here can move; the caller names each one, so what a golden does not pin is
 * written down where the golden is.
 *
 * A symbolic link is refused rather than followed or dropped: following one reads a tree the
 * install does not own, and dropping one hides that the install made it.
 */
export async function readInstallTree(
  root: string,
  options?: { skip?: readonly string[] },
): Promise<InstallTree> {
  const skip = options?.skip ?? [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const pinned = entries
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((absolute) => !isSkipped(relativeTo(root, absolute), skip));
  const read = await Promise.all(pinned.map((absolute) => readEntry(root, absolute)));

  return { files: filesAmong(read), emptyDirectories: emptyDirectoriesAmong(read) };
}

/** One entry of the walk, read for the only two things a tree records. */
type ReadEntry =
  | { kind: "file"; pair: [string, string] }
  | { kind: "empty-directory"; path: string }
  | { kind: "populated-directory" };

async function readEntry(root: string, absolute: string): Promise<ReadEntry> {
  const relative = relativeTo(root, absolute);
  const stats = await lstat(absolute);

  if (stats.isFile()) return { kind: "file", pair: [relative, await readFile(absolute, "utf-8")] };
  if (stats.isDirectory()) {
    const children = await readdir(absolute);
    return children.length === 0
      ? { kind: "empty-directory", path: relative }
      : { kind: "populated-directory" };
  }

  throw new Error(
    `readInstallTree reads files and directories only, and ${relative} under ${root} is neither`,
  );
}

function filesAmong(read: readonly ReadEntry[]): Record<string, string> {
  return Object.fromEntries(read.flatMap((entry) => (entry.kind === "file" ? [entry.pair] : [])));
}

function emptyDirectoriesAmong(read: readonly ReadEntry[]): string[] {
  return read.flatMap((entry) => (entry.kind === "empty-directory" ? [entry.path] : []));
}

function isSkipped(relative: string, skip: readonly string[]): boolean {
  return skip.some((skipped) => relative === skipped || relative.startsWith(`${skipped}/`));
}

/** A path under `root`, relative to it and in POSIX form — the key a tree records it under. */
function relativeTo(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

/**
 * The same tree with every volatile value written as a placeholder, and its files and empty
 * directories in path order — so two runs of one journey serialise to the same bytes, and a
 * difference between them is a difference in what the install wrote.
 */
export function normalizeInstallTree(tree: InstallTree, context: GoldenTreeContext): InstallTree {
  const normalizeText = textNormalizer(context);

  return {
    files: Object.fromEntries(
      Object.keys(tree.files)
        .sort(bytewise)
        .map((file) => [file, normalizeText(fileText(tree, file))]),
    ),
    emptyDirectories: [...tree.emptyDirectories].sort(bytewise),
  };
}

/** A file the tree names. Only ever asked for a key taken from the same tree. */
function fileText(tree: InstallTree, file: string): string {
  const text = tree.files[file];
  if (text === undefined) throw new Error(`${file} is not a file in this tree`);

  return text;
}

function textNormalizer(context: GoldenTreeContext): (text: string) => string {
  const rootPlaceholders = longestRootFirst(context.roots);
  const compiledBy = compiledByLine(context.cliVersion);
  const compiledByPlaceholder = compiledByLine(CLI_VERSION_PLACEHOLDER);

  return (text) =>
    writeRootsAsPlaceholders(text, rootPlaceholders)
      .replaceAll(compiledBy, compiledByPlaceholder)
      .replace(MACHINE_TIMESTAMP, TIMESTAMP_PLACEHOLDER)
      .replace(STAMPED_DATE_FIELD, `$1${DATE_PLACEHOLDER}`);
}

/**
 * Every spelling of every root, paired with its placeholder, longest first: a project nested in its
 * HOME must be replaced before the HOME it sits under, or it is written as `<home>/project` and a
 * HOME that moved relative to it reads as a change.
 */
function longestRootFirst(roots: GoldenTreeContext["roots"]): (readonly [string, string])[] {
  return typedEntries(roots)
    .flatMap(([name, spellings]) => spellings.map((root) => [root, `<${name}>`] as const))
    .sort(([one], [other]) => other.length - one.length || bytewise(one, other));
}

function writeRootsAsPlaceholders(
  text: string,
  rootPlaceholders: readonly (readonly [string, string])[],
): string {
  return rootPlaceholders.reduce(
    (written, [root, placeholder]) => written.replaceAll(root, placeholder),
    text,
  );
}

function compiledByLine(version: string): string {
  return `${COMPILED_BY_PREFIX}${version}${COMPILED_BY_SUFFIX}`;
}
