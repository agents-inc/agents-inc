/**
 * Every finding in `.ai-docs/agent-findings/` opens with a YAML block a parser can read, declares a
 * `root_cause` `TEMPLATE.md` offers, is not a second copy of the file beside it, names no file that
 * is gone, and pins no lifecycle claim to a symbol the tree does not declare.
 *
 * It exists because ten of them did not parse, and nothing said so. `TEMPLATE.md` defines a status
 * rollup, a link-integrity scan and a lifecycle-pairing check, all of them over parsed frontmatter
 * — so a finding whose block does not parse is skipped by every one of them while still reading, to
 * a human, exactly like its neighbours. A rollup that cannot read a `status:` field has no way to
 * say so, and a count over the files it could read is worth less than a scan that fails on the
 * files it could not.
 *
 * **One character sequence causes the whole class: a bare `: ` inside an unquoted value.** A plain
 * YAML scalar cannot contain colon-space — the parser reads it as a nested key and gives up. The
 * damage lands precisely on `resolved_by:` and `partial_note:`, the two fields `TEMPLATE.md` calls
 * REQUIRED, because they are the only ones carrying a paragraph of prose and prose is where a colon
 * turns up: a ratio, a time, a `key: value` quoted from source. Short enum fields cannot break this
 * way. Wrap prose in double quotes or write it as a `>-` block scalar.
 *
 * The second-order symptom is what surfaced it: Prettier does not leave an unreadable block alone,
 * it stops recognising the file as having frontmatter at all and reformats the block as Markdown.
 * `format:check` then reports a style violation, which reads as cosmetic and is not.
 *
 * **The two scans beside the parse are the ones a frontmatter-drift audit of this directory asked
 * for and nothing performed.** Both are about a finding that parses perfectly and is still
 * invisible to a reader who groups the directory:
 *
 *   - A `root_cause` outside the enum. One finding carried `scope-boundary-preserved`, which was
 *     defensible enough that the enum was widened rather than the value changed — and that IS the
 *     rule (`TEMPLATE.md` #4: widen the enum HERE rather than inventing an ad-hoc value). Until
 *     someone does, the finding is in no group. The enum is READ from `TEMPLATE.md` rather than
 *     restated, so widening it there widens this scan and there is no second copy to drift.
 *   - Two findings sharing `(affected_files, root_cause, date)`. That is one piece of work filed
 *     twice, or one whose file list is stale — and the pair the directory holds today is both.
 *     Reported rather than refused: the tuple names a PAIR, and which half is wrong is not knowable
 *     from the frontmatter, so the suite beside this file pins the pair by name.
 *
 * A pair that cross-links (`supersedes` / `superseded_by` / `blocked_by`) is not reported. That is
 * the discovery-then-fix lineage the same finding describes, and the link is what makes it legible.
 *
 * **The two scans after those read the VALUES rather than the shape, and each closes a scan that
 * was scoped to three keys or to no keys at all:**
 *
 *   - Every value that names a file resolves on disk. `TEMPLATE.md` rule 3a asks this of
 *     `supersedes`, `superseded_by` and `blocked_by`, and the scan that ran it covered exactly
 *     those three — so `affected_files:` and `standards_docs:` dangled unseen, and a deletion batch
 *     left 64 dangling citations of which the mandated scan caught one. Stated here as a property
 *     of the VALUE rather than as a list of keys, so a key added to `TEMPLATE.md` tomorrow is
 *     covered today.
 *   - Every symbol a lifecycle note names is one the tree declares. A `partial_note` is the field a
 *     reader takes as current state, and nothing had ever read one against source: one claimed an
 *     observability fix was pending for four months after it shipped, in terms of a call site that
 *     had been renamed. This catches the rename half, which is the half a scanner can see.
 *
 * **The scan also says whether its own inputs held still, because this directory is written by the
 * same multi-agent sessions that run the check.** It reddened once on a finding another process was
 * halfway through writing, and was green the moment that write completed — nothing was wrong, which
 * is the defect: a red meaning "someone is typing" reads exactly like a red meaning "a finding is
 * malformed", and the documented response to the second is to re-derive a pin and edit it. Acting
 * on the first writes a phantom into the record permanently, and a check that cries wolf gets
 * silenced, which is worse than not having one.
 *
 * So `inFlight` names every file whose bytes moved between the moment the scan opened it and the
 * moment the scan finished — EVIDENCE that a write landed under the run, rather than a guess about
 * one. Two guesses were considered and are refused:
 *
 *   - **Tolerating a parse failure as unknown** retires the whole check. Ten findings did not parse
 *     and nothing said so; a scan that answers "unknown" to that answers it for the settled ones
 *     too, permanently, and they are the ones it exists for.
 *   - **Skipping a file whose mtime is within a few seconds** skips precisely the file the run is
 *     about. The commonest moment to run this check is straight after writing a finding, so the
 *     window would swallow the one filing a session could still fix, and it would do it silently.
 *
 * The fingerprint catches a write that finishes anywhere near the run, which is what an ordinary
 * `writeFile` from another process looks like, and it arrives WITH the red it explains rather than
 * instead of it. `clean` still answers only for the frontmatter — folding two different facts into
 * one boolean is the ambiguity this field exists to remove.
 *
 * **It does not catch a writer that stalls for longer than the scan**, and that was measured rather
 * than reasoned about: driven against a real 20-second stall on a copy of this directory, the
 * witness and the verify saw the same truncated bytes and `inFlight` came back empty over a file
 * that was plainly cut off. So the SHAPE of the cut is the second signal, and it needs no timing —
 * an unterminated fence is reported apart from an absent one, because a file that opens a block and
 * never closes it has been truncated where a file with no block was written before the convention.
 * Neither signal is total, and a run with both silent can still have read a body mid-write; what
 * they buy is that the commonest transient names itself instead of impersonating a defect.
 *
 * Every finding is read ONCE per run for the same reason. Three scans each opened the file
 * separately, so a single call could judge three different versions of one file and report a tuple
 * from one against a symbol from another.
 *
 * Nothing runs at module scope here — the suite beside it is the enforcement, and every directory
 * the check reads is a parameter so it can be driven against a fixture.
 */
import { spawnSync } from "child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";

import ts from "typescript";
import { parse } from "yaml";

import { getErrorMessage } from "../src/cli/utils/errors.ts";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

/** Where a `todo/` path is written from, and the tree a symbol has to be declared somewhere in. */
const REPOSITORY_ROOT = path.resolve(PACKAGE_ROOT, "../..");

/** Where the check reads from when no other directory is given. */
const FINDINGS_DIR = path.join(PACKAGE_ROOT, ".ai-docs/agent-findings");

const MARKDOWN_EXTENSION = ".md";

/** The schema every finding is judged against. */
export const TEMPLATE_FILE = "TEMPLATE.md";

/** The registry naming every finding. It cannot be a member of itself, so it is not judged as one. */
export const INDEX_FILE = "INDEX.md";

/** The directory's own apparatus: the schema, and the registry of what the directory holds. */
const APPARATUS_FILES = [TEMPLATE_FILE, INDEX_FILE];

/** The frontmatter block: `---`, the YAML, `---`, all at the very top of the file. */
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

/** How that block opens. A file carrying this and no closing fence was cut off part-way. */
const FRONTMATTER_OPENS = "---\n";

/** How `TEMPLATE.md` writes an enum: the values of one field, separated by pipes. */
const ENUM_SEPARATOR = "|";

/** The keys that make two findings over the same work a lineage rather than a duplicate. */
const CROSS_LINK_KEYS = ["supersedes", "superseded_by", "blocked_by"];

export const NO_FRONTMATTER = "opens with no --- frontmatter block";
export const UNTERMINATED_FRONTMATTER = "opens a --- frontmatter block nothing closes";
export const ROOT_CAUSE_OUTSIDE_ENUM = "declares a root_cause TEMPLATE.md does not offer";
export const NO_ROOT_CAUSE_ENUM = `${TEMPLATE_FILE} states no root_cause enum`;
export const NO_INDEX = `${INDEX_FILE} is not in the findings directory`;

/**
 * How a finding is named: the day it was filed, then its subject. `README.md` carries the
 * directory's apparatus rather than a filing, so it asks for no row and is not a member.
 */
const FILED_ON_A_DAY = /^\d{4}-\d{2}-\d{2}-/;

/** A finding as the INDEX names one — backticked, with the `.md` optional; it writes both forms. */
const INDEXED_FINDING = /`(\d{4}-\d{2}-\d{2}-[^`]+?)(?:\.md)?`/g;

/** One finding's answer: its frontmatter parses and passes, or it does not and this is why. */
export type FindingVerdict =
  { file: string; outcome: "readable" } | { file: string; outcome: "unreadable"; problem: string };

/** One piece of work filed more than once — the files, and the tuple they agree on. */
export type DuplicateFiling = { files: string[]; rootCause: string; date: string };

/** A frontmatter value that names a file, and no root the value could be written from holds it. */
export type UnresolvedReference = { file: string; key: string; value: string };

/** A name a lifecycle note pins its claim to, which nothing in the tree declares. */
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

/** The three fields the tuple scan reads by name, beyond the parse itself. */
const ROOT_CAUSE = "root_cause";
export const AFFECTED_FILES = "affected_files";
const DATE = "date";

export function check({
  findingsDir = FINDINGS_DIR,
  referenceRoots = [PACKAGE_ROOT, REPOSITORY_ROOT],
  sourceRoots = [REPOSITORY_ROOT],
  isIgnored = gitIgnoresUnder(),
}: {
  findingsDir?: string | undefined;
  referenceRoots?: string[] | undefined;
  sourceRoots?: string[] | undefined;
  /**
   * Whether the repository would carry this file. Injected so a test can state the answer without
   * creating a git repository, and so the scan's subject is stated rather than assumed.
   */
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
    unresolved: unresolvedReferencesIn(parsed, [findingsDir, ...referenceRoots]),
    undeclared: undeclaredSymbolsIn(parsed, declaredNamesUnder(sourceRoots, isIgnored)),
    unlisted: unlistedFindingsIn(findingsDir, files),
    inFlight: changedSince(findingsDir, witnessed),
  };
}

/** What one file looked like at a moment: absent, or these bytes last written then. */
export type FileWitness = { file: string; fingerprint: string };

/** A file the directory does not hold. One arriving under the scan is a change like any other. */
const ABSENT = "absent";

/**
 * What every named file looks like now, so a write landing under the scan can be seen afterwards.
 *
 * The apparatus is witnessed alongside the findings, because a half-written `INDEX.md` reports
 * every finding in the directory as unlisted at once and a half-written `TEMPLATE.md` refuses the
 * run outright — the two loudest reds this check can produce, from files nobody has touched.
 */
export function witnessOf(findingsDir: string, files: string[]): FileWitness[] {
  return files.map((file) => ({
    file,
    fingerprint: fingerprintOf(path.join(findingsDir, file)),
  }));
}

/** Every witnessed file whose bytes have moved since — which is a write this run did not see whole. */
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

/**
 * Every finding on disk the INDEX names nowhere.
 *
 * ONE direction, deliberately. A row naming a file that is GONE is the record working as intended —
 * the INDEX grades a finding and keeps the judgement after the file is deleted, and its own header
 * says exactly that — so failing on that direction would fight the protocol and report the hundreds
 * of rows a grading pass exists to leave behind. A finding with no row is the direction that loses
 * information: it is invisible to every pass that groups this directory, and nothing on the way IN
 * looks, which is how a finding written today is already unreachable by tomorrow's rollup.
 */
function unlistedFindingsIn(findingsDir: string, files: string[]): string[] {
  const named = findingsNamedIn(findingsDir);

  return files.filter((file) => FILED_ON_A_DAY.test(file) && !named.has(nameOf(file)));
}

/**
 * Every finding the INDEX names, as basenames.
 *
 * Read as text rather than as rows: the INDEX names findings in prose paragraphs as well as in
 * tables, and a row is not the only place a name is a reference. The name is matched to its closing
 * backtick rather than by a character class, because a class of the lower-case ones a first pass
 * writes reports `registerProjectPath` and `HOME` as unnamed while the INDEX names both.
 */
function findingsNamedIn(findingsDir: string): Set<string> {
  const indexPath = path.join(findingsDir, INDEX_FILE);
  if (!existsSync(indexPath)) throw new Error(NO_INDEX);

  const index = readFileSync(indexPath, "utf-8");

  return new Set([...index.matchAll(INDEXED_FINDING)].flatMap((match) => match[1] ?? []));
}

function nameOf(file: string): string {
  return file.slice(0, -MARKDOWN_EXTENSION.length);
}

/** The values `TEMPLATE.md` offers for `root_cause`, which is the only definition of that enum. */
function rootCauseEnumOf(findingsDir: string): string[] {
  const template = frontmatterOf(readFileSync(path.join(findingsDir, TEMPLATE_FILE), "utf-8"));
  const declared = template === undefined ? undefined : rootCauseLineIn(template);
  if (declared === undefined) throw new Error(NO_ROOT_CAUSE_ENUM);

  return declared.split(ENUM_SEPARATOR).map((value) => value.trim());
}

/**
 * Read as text rather than through the YAML parser: `a | b | c` is one scalar to YAML, and the
 * enum's own separator is what has to be split on.
 */
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

/**
 * One finding as the scan read it: its frontmatter parsed, or the reason no parser could reach it.
 *
 * Every scan below reads this rather than the file, so one run judges ONE version of each finding.
 */
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

/**
 * Which of the two a file with no readable block is, and the distinction is the one the fingerprint
 * cannot make. A file that opens a fence and never closes it has been CUT OFF, which is what a
 * finding another process is still writing looks like; a file with no fence at all was written
 * before the convention existed. Evidence of truncation rather than proof of it — a fence someone
 * deleted reads the same — and the repair is the same edit either way, so this changes the message
 * and nothing else.
 */
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

/**
 * Every group of findings agreeing on all three fields, in filename order.
 *
 * A file whose frontmatter did not parse contributes nothing — the verdict above already reports it,
 * and reporting it twice under a tuple read out of a broken block would name the wrong defect.
 */
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

/** Every filename this finding names as a predecessor, replacement or blocker. */
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

/** One field of a frontmatter block, read without knowing which keys the schema offers. */
type FrontmatterField = { key: string; value: unknown };

/** One finding's frontmatter as key/value pairs — what the two scans below read, once each. */
type ParsedFinding = { file: string; fields: FrontmatterField[] };

/**
 * Every finding whose frontmatter parses, as fields.
 *
 * A file that does not parse contributes nothing: the verdict above already reports it, and a value
 * read out of a broken block would name a defect the file does not have.
 */
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

/**
 * Every frontmatter value that names a file and does not resolve, under any key.
 *
 * `TEMPLATE.md` rule 3a asks this of three keys, and the scan that ran it covered exactly those
 * three. `affected_files:` and `standards_docs:` name files too, and a widening pass found four
 * dangling targets the mandated scan was structurally unable to see. So the rule is stated as a
 * PROPERTY of the value rather than as a list of keys — an enumeration of keys reads as exhaustive
 * while being short, and goes stale the day a key is added, which is the same defect one level up.
 */
function unresolvedReferencesIn(findings: ParsedFinding[], roots: string[]): UnresolvedReference[] {
  return findings.flatMap(({ file, fields }) =>
    fields.flatMap(({ key, value }) =>
      referencesIn(value)
        .filter((reference) => !resolvesUnder(reference, roots))
        .map((reference) => ({ file, key, value: reference })),
    ),
  );
}

/**
 * Which values under a key name a file. Two clauses, each with its own reason:
 *
 *   - Every member of a SEQUENCE is one. In this schema a list is always a file list, so an entry
 *     that does not resolve is a defect whatever it looks like — a summary sentence included, which
 *     is what `TEMPLATE.md` rule 6 forbids when it calls the list the grep's output pasted.
 *   - A SCALAR is one only when it reads as one: a single token carrying a separator or a file
 *     extension. `partial_note:` and `resolved_by:` are paragraphs that quote paths inside
 *     sentences, and judging those would report every note in the directory.
 */
function referencesIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];

  return isPathShaped(value) ? [value] : [];
}

/** Extensions a frontmatter value carries when it names a file rather than describing one. */
const REFERENCE_EXTENSIONS = [".md", ".ts", ".tsx", ".js", ".mjs", ".json", ".yaml", ".yml"];

function isPathShaped(value: string): boolean {
  if (/\s/.test(value)) return false;

  return value.includes("/") || REFERENCE_EXTENSIONS.some((extension) => value.endsWith(extension));
}

/**
 * Whether any root the value could be written from holds it — the findings directory for a bare
 * cross-link basename, the package for a `src/` or `.ai-docs/` path, the repository for a `todo/`
 * one. An absolute path resolves under none of them, which is the leading-slash check the same
 * finding asked for and `CLAUDE.md` already bans, arriving for free.
 */
function resolvesUnder(reference: string, roots: string[]): boolean {
  return roots.some((root) => existsSync(path.join(root, reference)));
}

/**
 * Every name a lifecycle note pins its claim to that the tree does not declare.
 *
 * A `partial_note` is prose about code and no scanner can evaluate whether the work it calls
 * pending has landed — one sat four months claiming an observability fix was pending after it
 * shipped in two commands. What a scanner CAN do is ask whether the names survive, which catches
 * the rename half of the class: the same note called `writeScopedConfigs` a call site, and
 * `writeScopedFromWizard` had replaced it.
 */
function undeclaredSymbolsIn(findings: ParsedFinding[], declared: Set<string>): UndeclaredSymbol[] {
  return findings.flatMap(({ file, fields }) =>
    fields.flatMap(({ key, value }) =>
      symbolsNamedIn(value)
        .filter((symbol) => !declared.has(symbol))
        .map((symbol) => ({ file, key, symbol })),
    ),
  );
}

/**
 * A backticked span the whole of which is one identifier. A span carrying anything else — a quoted
 * `key: value`, a CLI flag, a sentence — is prose that happens to be in code font, and is not a
 * claim about a symbol.
 */
const BACKTICKED_IDENTIFIER = /`([A-Za-z_][A-Za-z0-9_]*)`/g;

/**
 * Whether the name is one this codebase would give a symbol, which is the difference between a
 * claim and a word in code font. Functions here are camelCase, types PascalCase and constants
 * SCREAMING_SNAKE, so every symbol carries a case boundary or an underscore; a bare lowercase word
 * carries neither, and `tsc` and `satisfies` are both backticked in notes as exactly that.
 *
 * The cost is a lowercase single-word function going unchecked, and it is worth paying: the
 * alternative reports every ordinary English word an author put in backticks, and a scan whose hits
 * are mostly noise is one nobody reads.
 */
function isSymbolShaped(name: string): boolean {
  return /_/.test(name) || /[a-z][A-Z]/.test(name) || /^[A-Z]/.test(name);
}

function symbolsNamedIn(value: unknown): string[] {
  if (typeof value !== "string") return [];

  return [...value.matchAll(BACKTICKED_IDENTIFIER)]
    .flatMap((match) => match[1] ?? [])
    .filter(isSymbolShaped);
}

/** Extensions this repository's modules are written in. */
const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];

/** Configuration whose keys are names the repository declares as surely as a module does. */
const DATA_EXTENSION = ".json";

/**
 * Directories holding nothing anyone authored. `dist/` is the one that matters: it carries the
 * names of the tree that produced it, so a deleted symbol goes on resolving there until the next
 * build.
 */
const UNAUTHORED_DIRECTORIES = ["node_modules", "dist", ".git", "coverage", ".turbo"];

/**
 * Every name the tree declares — the identifiers its modules parse to, plus its JSON keys.
 *
 * Read from the PARSE rather than as words, and that is load-bearing rather than fastidious: a
 * scan that counted every word would find each of these names in the suite beside this file, which
 * pins them as the strings it expects to be missing. The pin would then declare what it asserts is
 * undeclared and pass on its own evidence. An identifier is a token the parser puts in code
 * position; a name inside a string or a comment is not one.
 */
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
 * Whether the repository would carry this path — asked of git rather than guessed from a denylist.
 *
 * `UNAUTHORED_DIRECTORIES` above is a hardcoded list and cannot track `.gitignore`, which is how
 * this scan came to answer differently per machine: three ignored locations in this repository
 * still declared two deleted constants, so it said 10 locally and 12 on a clean checkout, and CI
 * was red on that assertion across two releases while every local run passed. The denylist stays
 * because it is cheaper than any subprocess for the four directories that dominate the walk; git
 * decides everything else.
 *
 * ONE call per root, not one per path. The obvious form — `git check-ignore` per file — is correct
 * and cost 5 seconds on this repository, which would have made this scan one of the slowest tests
 * in the suite to fix a correctness bug. `ls-files --others --ignored --exclude-standard
 * --directory` lists what git ignores under a root, collapsing whole ignored directories to one
 * entry, so a prefix test answers every path beneath them.
 *
 * Outside a working tree the command fails and the answer is that nothing is ignored — exactly
 * right for the temp trees this scan is unit-tested against, and the reason no test needs a
 * repository of its own.
 */
function gitIgnoresUnder(): (file: string) => boolean {
  const perRoot = new Map<string, string[]>();

  return (file: string): boolean => {
    const root = path.parse(file).root === file ? file : path.dirname(file);
    const anchor = nearestKnownRoot(perRoot, root) ?? loadIgnoredUnder(perRoot, root);

    return anchor.some((ignored) => file === ignored || file.startsWith(`${ignored}${path.sep}`));
  };
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

/** Deduped per file, so the whole-tree walk never holds one array of every name in the repository. */
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

/**
 * A key in a JSON document, read lexically because several of them carry comments and are not JSON
 * to a parser. `prepublishOnly` is a name this repository declares in `package.json` and a note
 * citing it is naming a script rather than a symbol.
 */
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

/** A YAML error's own message plus a source excerpt; only the first line names the fault. */
function firstLineOf(message: string): string {
  return message.split("\n")[0] ?? message;
}
