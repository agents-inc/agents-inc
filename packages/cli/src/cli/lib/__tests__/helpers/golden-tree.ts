/**
 * Reads a directory tree into a comparable value and normalises its volatile parts — temp roots,
 * this run's CLI version, install dates, ISO timestamps — so two runs compare byte for byte.
 * Nothing else is normalised, so a new volatile field reddens the golden by name.
 */
import { lstat, readdir, readFile } from "fs/promises";
import path from "path";
import { format, type Options } from "prettier";

import { STANDARD_FILES } from "../../../consts.js";
import { bytewise } from "../../../utils/string.js";
import { typedEntries } from "../../../utils/typed-object.js";

export type InstallTree = {
  /** Keyed by POSIX path relative to the root. */
  files: Record<string, string>;
  /** A populated directory is implied by its files. */
  emptyDirectories: string[];
};

type RecordedPhase = {
  files: Record<string, string>;
  emptyDirectories: string[];
};

export type RecordedGolden = {
  notPinned: string[];
  phases: Record<string, RecordedPhase>;
};

export type GoldenTreeContext = {
  /** Placeholder name to every spelling of that root; a symlinked temp dir arrives resolved. */
  roots: Record<string, readonly string[]>;
  cliVersion: string;
};

// `agent.liquid`'s "Compiled by <version>." line.
const COMPILED_BY_PREFIX = "Compiled by ";
const COMPILED_BY_SUFFIX = ".";
const CLI_VERSION_PLACEHOLDER = "<cli-version>";

/** An ISO-8601 instant, as `toISOString` writes one. */
const MACHINE_TIMESTAMP = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;
const TIMESTAMP_PLACEHOLDER = "<timestamp>";

/** A YAML `date:` holding a bare date, as an install stamps. */
const STAMPED_DATE_FIELD = /^(\s*date: )\d{4}-\d{2}-\d{2}$/gm;
const DATE_PLACEHOLDER = "<date>";

/** The style an install writes `config.ts` in; no prettier config this tree resolves matches it. */
const INSTALLED_CONFIG_FORMAT = {
  parser: "typescript",
  semi: false,
  singleQuote: true,
  printWidth: 100,
  trailingComma: "all",
} as const satisfies Options;

/**
 * `skip` leaves paths out whole. A symlink throws: following one reads a tree the install does not
 * own, and dropping one hides that the install made it.
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

function relativeTo(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/");
}

/** Volatile values as placeholders and paths sorted, so two runs serialise to the same bytes. */
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

// Longest first, so a project nested in HOME is not written as `<home>/project`.
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

/**
 * Reformats each `config.ts` as an install does. Run after normalising, so where a line breaks no
 * longer depends on the length of `TMPDIR`.
 */
export async function formatInstalledConfigs(tree: InstallTree): Promise<InstallTree> {
  const files = await Promise.all(typedEntries(tree.files).map(withConfigFormatted));

  return { files: Object.fromEntries(files), emptyDirectories: tree.emptyDirectories };
}

async function withConfigFormatted([file, text]: [string, string]): Promise<[string, string]> {
  if (!isInstalledConfig(file)) return [file, text];

  return [file, await format(text, INSTALLED_CONFIG_FORMAT)];
}

function isInstalledConfig(file: string): boolean {
  return path.posix.basename(file) === STANDARD_FILES.CONFIG_TS;
}
