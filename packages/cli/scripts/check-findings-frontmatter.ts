/**
 * Every finding in `.ai-docs/agent-findings/` has parseable frontmatter, a `root_cause` from
 * `TEMPLATE.md`, no duplicate filing, no dangling file reference and no undeclared symbol.
 *
 * `inFlight` names files whose bytes moved during the run, so a red caused by a concurrent write
 * says so instead of reading as a malformed finding.
 */
import { spawnSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";

import ts from "typescript";
import { parse } from "yaml";

import { getErrorMessage } from "../src/cli/utils/errors.ts";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, "../..");

const FINDINGS_DIR = path.join(PACKAGE_ROOT, ".ai-docs/agent-findings");

const MARKDOWN_EXTENSION = ".md";

export const TEMPLATE_FILE = "TEMPLATE.md";

export const INDEX_FILE = "INDEX.md";

const APPARATUS_FILES = [TEMPLATE_FILE, INDEX_FILE];

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

/** A file opening this with no closing fence was cut off part-way. */
const FRONTMATTER_OPENS = "---\n";

const ENUM_SEPARATOR = "|";

const CROSS_LINK_KEYS = ["supersedes", "superseded_by", "blocked_by"];

export const NO_FRONTMATTER = "opens with no --- frontmatter block";
export const UNTERMINATED_FRONTMATTER = "opens a --- frontmatter block nothing closes";
export const ROOT_CAUSE_OUTSIDE_ENUM = "declares a root_cause TEMPLATE.md does not offer";
export const NO_ROOT_CAUSE_ENUM = `${TEMPLATE_FILE} states no root_cause enum`;
export const NO_INDEX = `${INDEX_FILE} is not in the findings directory`;

const FILED_ON_A_DAY = /^\d{4}-\d{2}-\d{2}-/;

const INDEXED_FINDING = /`(\d{4}-\d{2}-\d{2}-[^`]+?)(?:\.md)?`/g;

type FindingVerdict =
  { file: string; outcome: "readable" } | { file: string; outcome: "unreadable"; problem: string };

type DuplicateFiling = { files: string[]; rootCause: string; date: string };

export type UnresolvedReference = { file: string; key: string; value: string };

export type UndeclaredSymbol = { file: string; key: string; symbol: string };

export type CheckResult = {
  clean: boolean;
  verdicts: FindingVerdict[];
  duplicates: DuplicateFiling[];
  unresolved: UnresolvedReference[];
  undeclared: UndeclaredSymbol[];
  unlisted: string[];
  inFlight: string[];
};

const ROOT_CAUSE = "root_cause";
export const AFFECTED_FILES = "affected_files";
const DATE = "date";

export function check({
  findingsDir = FINDINGS_DIR,
  referenceRoots = [PACKAGE_ROOT, REPOSITORY_ROOT],
  sourceRoots = [REPOSITORY_ROOT],
  repositoryRoot = REPOSITORY_ROOT,
  isIgnored = gitIgnoresUnder(),
}: {
  findingsDir?: string | undefined;
  referenceRoots?: string[] | undefined;
  sourceRoots?: string[] | undefined;
  repositoryRoot?: string | undefined;
  /** Injected so a test needs no git repository. */
  isIgnored?: ((file: string) => boolean) | undefined;
} = {}): CheckResult {
  const files = findingFiles(findingsDir);
  const witnessed = witnessOf(findingsDir, [...APPARATUS_FILES, ...files]);
  const enumValues = rootCauseEnumOf(findingsDir);
  const readings = files.map((file) => readFinding(findingsDir, file));
  const verdicts = readings.map((reading) => judgeFinding(reading, enumValues));
  const parsed = parsedFindingsIn(readings);

  return {
    clean: verdicts.every((verdict) => verdict.outcome === "readable"),
    verdicts,
    duplicates: duplicateFilingsIn(readings),
    unresolved: unresolvedReferencesIn(parsed, {
      roots: [findingsDir, ...referenceRoots],
      repositoryRoot,
      isIgnored,
    }),
    undeclared: undeclaredSymbolsIn(parsed, declaredNamesUnder(sourceRoots, isIgnored)),
    unlisted: unlistedFindingsIn(findingsDir, files),
    inFlight: changedSince(findingsDir, witnessed),
  };
}

export type FileWitness = { file: string; fingerprint: string };

const ABSENT = "absent";

/** Witnesses the apparatus too: a half-written INDEX or TEMPLATE makes the loudest reds. */
export function witnessOf(findingsDir: string, files: string[]): FileWitness[] {
  return files.map((file) => ({
    file,
    fingerprint: fingerprintOf(path.join(findingsDir, file)),
  }));
}

export function changedSince(findingsDir: string, witnessed: FileWitness[]): string[] {
  return witnessed
    .filter(({ file, fingerprint }) => fingerprintOf(path.join(findingsDir, file)) !== fingerprint)
    .map(({ file }) => file);
}

function fingerprintOf(filePath: string): string {
  const stats = statSync(filePath, { throwIfNoEntry: false });
  if (stats === undefined) return ABSENT;

  return `${stats.size}:${stats.mtimeMs}`;
}

/** One direction only: an INDEX row naming a deleted finding is the record working as intended. */
function unlistedFindingsIn(findingsDir: string, files: string[]): string[] {
  const named = findingsNamedIn(findingsDir);

  return files.filter((file) => FILED_ON_A_DAY.test(file) && !named.has(nameOf(file)));
}

/** Read as text, not rows: the INDEX names findings in prose as well as tables. */
function findingsNamedIn(findingsDir: string): Set<string> {
  const indexPath = path.join(findingsDir, INDEX_FILE);
  if (!existsSync(indexPath)) throw new Error(NO_INDEX);

  const index = readFileSync(indexPath, "utf-8");

  return new Set([...index.matchAll(INDEXED_FINDING)].flatMap((match) => match[1] ?? []));
}

function nameOf(file: string): string {
  return file.slice(0, -MARKDOWN_EXTENSION.length);
}

function rootCauseEnumOf(findingsDir: string): string[] {
  const template = frontmatterOf(readFileSync(path.join(findingsDir, TEMPLATE_FILE), "utf-8"));
  const declared = template === undefined ? undefined : rootCauseLineIn(template);
  if (declared === undefined) throw new Error(NO_ROOT_CAUSE_ENUM);

  return declared.split(ENUM_SEPARATOR).map((value) => value.trim());
}

/** Not YAML-parsed: `a | b | c` is one scalar to YAML. */
function rootCauseLineIn(block: string): string | undefined {
  const prefix = `${ROOT_CAUSE}:`;
  const line = block.split("\n").find((candidate) => candidate.startsWith(prefix));

  return line?.slice(prefix.length).trim();
}

function findingFiles(findingsDir: string): string[] {
  return readdirSync(findingsDir)
    .filter((entry) => entry.endsWith(MARKDOWN_EXTENSION) && !APPARATUS_FILES.includes(entry))
    .sort();
}

/** Every scan reads this rather than the file, so one run judges one version of each finding. */
type ReadFinding =
  | { file: string; outcome: "parsed"; frontmatter: unknown }
  | { file: string; outcome: "unparsed"; problem: string };

function readFinding(findingsDir: string, file: string): ReadFinding {
  const source = readFileSync(path.join(findingsDir, file), "utf-8");
  const block = frontmatterOf(source);
  if (block === undefined)
    return { file, outcome: "unparsed", problem: missingBlockProblem(source) };

  try {
    return { file, outcome: "parsed", frontmatter: parse(block) };
  } catch (error) {
    return { file, outcome: "unparsed", problem: firstLineOf(getErrorMessage(error)) };
  }
}

/** An unclosed fence suggests a write in progress, which the fingerprint misses for a stalled writer. */
function missingBlockProblem(source: string): string {
  return source.startsWith(FRONTMATTER_OPENS) ? UNTERMINATED_FRONTMATTER : NO_FRONTMATTER;
}

function judgeFinding(reading: ReadFinding, enumValues: string[]): FindingVerdict {
  const { file } = reading;
  if (reading.outcome === "unparsed") {
    return { file, outcome: "unreadable", problem: reading.problem };
  }

  const rootCause = fieldOf(reading.frontmatter, ROOT_CAUSE);
  if (typeof rootCause === "string" && !enumValues.includes(rootCause)) {
    return { file, outcome: "unreadable", problem: `${ROOT_CAUSE_OUTSIDE_ENUM}: ${rootCause}` };
  }

  return { file, outcome: "readable" };
}

function duplicateFilingsIn(readings: ReadFinding[]): DuplicateFiling[] {
  const filings = readings.flatMap(filingOf);
  const grouped = new Map<string, typeof filings>();

  for (const filing of filings) {
    grouped.set(filing.tuple, [...(grouped.get(filing.tuple) ?? []), filing]);
  }

  return [...grouped.values()].filter(isUnlinkedDuplicate).map(toDuplicateFiling);
}

type Filing = {
  file: string;
  tuple: string;
  rootCause: string;
  date: string;
  linksTo: string[];
};

function filingOf(reading: ReadFinding): Filing[] {
  if (reading.outcome === "unparsed") return [];

  const { file, frontmatter } = reading;
  const rootCause = fieldOf(frontmatter, ROOT_CAUSE);
  const date = fieldOf(frontmatter, DATE);
  const affectedFiles = fieldOf(frontmatter, AFFECTED_FILES);
  if (typeof rootCause !== "string" || !Array.isArray(affectedFiles)) return [];

  const stamp = String(date);

  return [
    {
      file,
      tuple: JSON.stringify([affectedFiles, rootCause, stamp]),
      rootCause,
      date: stamp,
      linksTo: crossLinksOf(frontmatter),
    },
  ];
}

function crossLinksOf(parsed: unknown): string[] {
  return CROSS_LINK_KEYS.flatMap((key) => {
    const value = fieldOf(parsed, key);
    if (typeof value === "string") return [value];

    return Array.isArray(value) ? value.map(String) : [];
  });
}

function isUnlinkedDuplicate(group: Filing[]): boolean {
  if (group.length < 2) return false;

  const named = new Set(group.flatMap((filing) => filing.linksTo));

  return !group.some((filing) => named.has(filing.file));
}

function toDuplicateFiling(group: Filing[]): DuplicateFiling {
  const [first] = group;

  return {
    files: group.map((filing) => filing.file),
    rootCause: first?.rootCause ?? "",
    date: first?.date ?? "",
  };
}

type FrontmatterField = { key: string; value: unknown };

type ParsedFinding = { file: string; fields: FrontmatterField[] };

function parsedFindingsIn(readings: ReadFinding[]): ParsedFinding[] {
  return readings.flatMap((reading) =>
    reading.outcome === "parsed"
      ? [{ file: reading.file, fields: fieldsOf(reading.frontmatter) }]
      : [],
  );
}

function fieldsOf(parsed: unknown): FrontmatterField[] {
  if (typeof parsed !== "object" || parsed === null) return [];

  return Object.keys(parsed).map((key) => ({ key, value: fieldOf(parsed, key) }));
}

type ReferenceScope = {
  roots: string[];
  repositoryRoot: string;
  isIgnored: (file: string) => boolean;
};

/** Judged by value under any key. Resolution is filtered first: a stat is cheaper than spawning git. */
function unresolvedReferencesIn(
  findings: ParsedFinding[],
  scope: ReferenceScope,
): UnresolvedReference[] {
  return findings.flatMap(({ file, fields }) =>
    fields.flatMap(({ key, value }) =>
      referencesIn(value)
        .filter((reference) => !resolvesUnder(reference, scope.roots))
        .filter((reference) => isCarriedByRepository(reference, scope))
        .map((reference) => ({ file, key, value: reference })),
    ),
  );
}

/** A sibling checkout or a git-ignored file exists on some machines only, so is not judged. */
function isCarriedByRepository(
  reference: string,
  { roots, repositoryRoot, isIgnored }: ReferenceScope,
): boolean {
  if (isOutside(repositoryRoot, path.join(repositoryRoot, reference))) return false;

  return !roots.some((root) => isIgnored(path.join(root, reference)));
}

function isOutside(directory: string, file: string): boolean {
  const relative = path.relative(directory, file);

  return relative === ".." || relative.startsWith(`..${path.sep}`);
}

/** Every list member is a file reference; a scalar only when it is one path-shaped token. */
function referencesIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];

  return isPathShaped(value) ? [value] : [];
}

const REFERENCE_EXTENSIONS = [".md", ".ts", ".tsx", ".js", ".mjs", ".json", ".yaml", ".yml"];

function isPathShaped(value: string): boolean {
  if (/\s/.test(value)) return false;

  return value.includes("/") || REFERENCE_EXTENSIONS.some((extension) => value.endsWith(extension));
}

function resolvesUnder(reference: string, roots: string[]): boolean {
  return roots.some((root) => existsSync(path.join(root, reference)));
}

function undeclaredSymbolsIn(findings: ParsedFinding[], declared: Set<string>): UndeclaredSymbol[] {
  return findings.flatMap(({ file, fields }) =>
    fields.flatMap(({ key, value }) =>
      symbolsNamedIn(value)
        .filter((symbol) => !declared.has(symbol))
        .map((symbol) => ({ file, key, symbol })),
    ),
  );
}

const BACKTICKED_IDENTIFIER = /`([A-Za-z_][A-Za-z0-9_]*)`/g;

/** camelCase, PascalCase or SNAKE; a bare lowercase word in backticks is prose, not a symbol. */
function isSymbolShaped(name: string): boolean {
  return /_/.test(name) || /[a-z][A-Z]/.test(name) || /^[A-Z]/.test(name);
}

function symbolsNamedIn(value: unknown): string[] {
  if (typeof value !== "string") return [];

  return [...value.matchAll(BACKTICKED_IDENTIFIER)]
    .flatMap((match) => match[1] ?? [])
    .filter(isSymbolShaped);
}

const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

const DATA_EXTENSION = ".json";

/** `dist/` matters most: a deleted symbol keeps resolving there until the next build. */
const UNAUTHORED_DIRECTORIES = ["node_modules", "dist", ".git", "coverage", ".turbo"];

/** Parsed identifiers plus JSON keys; parsed, so names in the suite's strings don't count as declared. */
function declaredNamesUnder(roots: string[], isIgnored: (file: string) => boolean): Set<string> {
  return new Set(roots.flatMap((root) => namesUnder(root, isIgnored)));
}

function namesUnder(root: string, isIgnored: (file: string) => boolean): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (UNAUTHORED_DIRECTORIES.includes(entry.name)) return [];
      return isIgnored(entryPath) ? [] : namesUnder(entryPath, isIgnored);
    }

    if (isIgnored(entryPath)) return [];

    if (entry.name.endsWith(DATA_EXTENSION)) return keysIn(readFileSync(entryPath, "utf-8"));

    return isModule(entry.name) ? identifiersIn(entryPath) : [];
  });
}

/**
 * A present path is answered from one cached `ls-files --ignored` listing per root (per-path
 * `check-ignore` is slow); an absent path asks `check-ignore`, which reads patterns alone. Outside a
 * working tree nothing is ignored.
 */
function gitIgnoresUnder(): (file: string) => boolean {
  const perRoot = new Map<string, string[]>();

  return (file) =>
    existsSync(file) ? isListedAsIgnored(perRoot, file) : matchesIgnorePattern(file);
}

function isListedAsIgnored(perRoot: Map<string, string[]>, file: string): boolean {
  const directory = path.parse(file).root === file ? file : path.dirname(file);
  const listing = nearestKnownRoot(perRoot, directory) ?? loadIgnoredUnder(perRoot, directory);

  return listing.some((ignored) => file === ignored || file.startsWith(`${ignored}${path.sep}`));
}

const IGNORED_BY_A_PATTERN = 0;

function matchesIgnorePattern(file: string): boolean {
  const result = spawnSync("git", [
    "-C",
    nearestExistingDirectory(file),
    "check-ignore",
    "--quiet",
    "--",
    file,
  ]);

  return result.status === IGNORED_BY_A_PATTERN;
}

function nearestExistingDirectory(file: string): string {
  const parent = path.dirname(file);

  return existsSync(parent) ? parent : nearestExistingDirectory(parent);
}

function nearestKnownRoot(perRoot: Map<string, string[]>, dir: string): string[] | undefined {
  for (const [known, entries] of perRoot) {
    if (dir === known || dir.startsWith(`${known}${path.sep}`)) return entries;
  }

  return undefined;
}

function loadIgnoredUnder(perRoot: Map<string, string[]>, dir: string): string[] {
  const result = spawnSync(
    "git",
    ["-C", dir, "ls-files", "--others", "--ignored", "--exclude-standard", "--directory"],
    { encoding: "utf-8" },
  );
  const entries =
    result.status === 0
      ? result.stdout
          .split("\n")
          .filter((line) => line !== "")
          .map((line) => path.resolve(dir, line.replace(/\/$/, "")))
      : [];
  perRoot.set(dir, entries);

  return entries;
}

function isModule(name: string): boolean {
  return MODULE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function identifiersIn(filePath: string): string[] {
  const file = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf-8"),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ false,
  );
  const names = new Set<string>();

  const collect = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) names.add(node.text);
    node.forEachChild(collect);
  };
  file.forEachChild(collect);

  return [...names];
}

/** Lexical, because several JSON files here carry comments. */
const JSON_KEY = /"([A-Za-z_][A-Za-z0-9_-]*)"\s*:/g;

function keysIn(source: string): string[] {
  return [...new Set([...source.matchAll(JSON_KEY)].flatMap((match) => match[1] ?? []))];
}

function fieldOf(parsed: unknown, key: string): unknown {
  if (typeof parsed !== "object" || parsed === null) return undefined;

  return Object.hasOwn(parsed, key) ? Reflect.get(parsed, key) : undefined;
}

function frontmatterOf(source: string): string | undefined {
  return FRONTMATTER.exec(source)?.[1];
}

function firstLineOf(message: string): string {
  return message.split("\n")[0] ?? message;
}
