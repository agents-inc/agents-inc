/**
 * The reader for `.ai-docs/standards/e2e/user-journeys.md`'s journey tables.
 *
 * It lived inline in `spec-gates.test.ts` and had the defect a parser in a spec file always
 * eventually has: **it declined to judge, silently.** Its rule was "a name whose first segment is a
 * spec directory is a spec, everything else is not", so five specs the page named without their
 * directory and one code symbol went unread — and a page whose entries are skipped reads exactly
 * like a page whose entries all passed. Six of them, on a page whose whole job is to say what has
 * been proved (CLI-528).
 *
 * So classification here is TOTAL. Every backticked name in a From-scratch cell comes back as one
 * of three things, and the two ways a name can fail to be a resolvable spec are kept apart because
 * they mean opposite things: `init-from-agent-scope` is a real spec the page named without saying
 * where it lives, and `skipIf` is a code symbol that was never a spec at all. A gate can require the
 * first set to be empty and the second to hold only names it recognises; it could do neither while
 * both were dropped on the floor.
 *
 * That was NAME classification, and for a while it was the only half made total — a ROW still had to
 * be five cells wide or it went the way the six names had gone. One unescaped `|` inside a code span
 * is all it takes: markdown splits the row into six cells, the reader drops it, and the six specs it
 * named stop being judged by any gate that walks row → spec. So `journeyNumbersIn` reads the `#`
 * column alone, blind to everything else a row must satisfy, and a gate holding it against what
 * `readJourneyRows` returned sees the drop.
 *
 * The parsing is pure and the filesystem is one function at the edge, so the classification can be
 * tested against a three-element spec list rather than a fixture tree.
 */
import fg from "fast-glob";

/** The suffix every spec the `e2e` project collects carries, and so every spec a journey names. */
export const SPEC_SUFFIX = ".e2e.test.ts";

/** The marker `user-journeys.md`'s vocabulary defines as "No from-scratch spec". */
export const TO_TEST_MARKER = "TO TEST";

/**
 * The header every journey table opens with, and what tells one from the other tables on the page.
 *
 * Identified by its heading cells rather than by its width, because width is the thing under test:
 * the four-surfaces table numbers its rows 1 to 4 as well, so a reading that told the two apart by
 * counting columns would condemn it and be blind to the malformed row it exists to find.
 */
const JOURNEY_TABLE_HEADER = ["#", "Journey", "From-scratch spec", "Surfaces asserted", "Status"];

/** `#`, Journey, From-scratch spec, Surfaces asserted, Status — the shape of every journey table. */
const JOURNEY_TABLE_COLUMNS = JOURNEY_TABLE_HEADER.length;

/** A journey row's `#`, which is a number and sometimes a letter after it (`13a`, `28a`). */
const JOURNEY_NUMBER = /^\d+[a-z]?$/;

/**
 * What ends a cell: a `|` the author did not escape.
 *
 * Markdown gives a table cell one escape and no other way to hold a pipe — `\|`, which the renderer
 * resolves BEFORE it parses the cell's inline markup, so it works inside a code span where no other
 * backslash escape does. A reader splitting on a bare `|` therefore disagrees with every renderer of
 * the same page about where a correctly-written cell ends, and the row comes out one cell too wide.
 *
 * Copied verbatim into `scripts/check-enumeration-drift.ts`, which reads registered documentation
 * tables through the same rule, and held against that copy by
 * `scripts/check-enumeration-drift.test.ts`. What was deliberately NOT copied is this file's own
 * contract rather than the escape rule: the `.slice(1, -1)` and the per-cell trim below.
 */
const CELL_SEPARATOR = /(?<!\\)\|/;

/** The escape, undone once the cell it belongs to has been separated out. */
const ESCAPED_PIPE = "\\|";

/** Each spec, helper and source file the From-scratch column names is in backticks. */
const NAMED_IN_BACKTICKS = /`([^`]+)`/g;

/** The coverage marker a Status cell opens with, which the page renders bold. */
const COVERAGE_MARKER = /\*\*([^*]+)\*\*/;

/**
 * What the page named, and what answers to it.
 *
 * `unlocated-spec` is the interesting one: the name resolves to a real spec by basename alone, so
 * the page is naming proof that exists while giving no way to reach it. It is a page defect rather
 * than a coverage defect, which is why it is not folded into either neighbour.
 */
export type SpecReference =
  | { name: string; kind: "spec" }
  | { name: string; kind: "unlocated-spec"; livesAt: string }
  | { name: string; kind: "not-a-spec" };

/** One journey row: its number, its description, everything its From-scratch column names, and its marker. */
export type JourneyRow = {
  number: string;
  journey: string;
  references: readonly SpecReference[];
  marker: string;
};

/** The same row before it is read: `#`, Journey, From-scratch spec, Surfaces asserted, Status. */
type JourneyRowCells = [string, string, string, string, string];

/**
 * Every spec under `e2eRoot`, named the way the page names one: directory, basename, no suffix.
 *
 * Derived rather than listed, which is also how the reader learns which directories hold specs. A
 * hand-maintained list of those was the second half of the silent decline — a spec tree that gained
 * a directory would have every row naming it skipped, and nothing would say so.
 */
export function readSpecNames(e2eRoot: string): string[] {
  return fg
    .sync(`**/*${SPEC_SUFFIX}`, { cwd: e2eRoot })
    .map((file) => file.slice(0, -SPEC_SUFFIX.length))
    .sort();
}

/**
 * The journey rows `page` carries, read off the page rather than restated — a second copy of the
 * From-scratch column in a gate would agree with itself whatever the page went on to say.
 *
 * Throws rather than returning nothing when the table shape has moved, and throws rather than
 * classifying when a name inside a spec directory answers to no file: a row cannot be proved by a
 * gap, and a reader that returns `[]` for a page it failed to understand makes every judgement over
 * it hold vacuously.
 */
export function readJourneyRows(page: string, specNames: readonly string[]): JourneyRow[] {
  const directories = specDirectories(specNames);
  const rows = journeyTableLines(page)
    .filter(isJourneyRow)
    .map((cells) => toJourneyRow(cells, specNames, directories));

  if (rows.length === 0) {
    throw new Error(
      "no journey row parsed out of the page — the column reader has stopped matching",
    );
  }

  return rows;
}

/**
 * Every `#` the journey tables number, whatever shape the row carrying it came out.
 *
 * Deliberately blind to everything else `isJourneyRow` requires, which is what makes it a check ON
 * the reader rather than a second copy of it: a row `readJourneyRows` drops still answers here, so
 * the difference between the two IS the silence. Nothing else can see it — a page whose entries are
 * skipped reads exactly like a page whose entries all passed.
 */
export function journeyNumbersIn(page: string): string[] {
  return journeyTableLines(page)
    .filter(isNumbered)
    .map(([number]) => number);
}

/** The specs a row names and a run can reach. */
export function specsNamedBy(row: JourneyRow): string[] {
  return row.references.filter((reference) => reference.kind === "spec").map(({ name }) => name);
}

/** Every spec named without the directory it lives in, across all the rows given. */
export function unlocatedSpecsIn(rows: readonly JourneyRow[]): string[] {
  return rows.flatMap((row) =>
    row.references
      .filter((reference) => reference.kind === "unlocated-spec")
      .map(({ name }) => name),
  );
}

/** Every backticked name no spec answers to — helpers, fixtures and code symbols. */
export function nonSpecNamesIn(rows: readonly JourneyRow[]): string[] {
  return rows.flatMap((row) =>
    row.references.filter((reference) => reference.kind === "not-a-spec").map(({ name }) => name),
  );
}

/** The `e2e/` subdirectories that hold specs, which is what makes a name an intended spec reference. */
function specDirectories(specNames: readonly string[]): Set<string> {
  return new Set(specNames.map(firstSegment));
}

function toJourneyRow(
  [number, journey, fromScratch, , status]: JourneyRowCells,
  specNames: readonly string[],
  directories: ReadonlySet<string>,
): JourneyRow {
  return {
    number,
    journey,
    references: namesIn(fromScratch).map((name) => classify(name, specNames, directories)),
    marker: coverageMarker(status),
  };
}

function classify(
  name: string,
  specNames: readonly string[],
  directories: ReadonlySet<string>,
): SpecReference {
  if (specNames.includes(name)) return { name, kind: "spec" };

  if (directories.has(firstSegment(name))) {
    throw new Error(`the page names '${name}', and no spec file answers to it`);
  }

  const livesAt = specNames.find((spec) => lastSegment(spec) === name);
  if (livesAt !== undefined) return { name, kind: "unlocated-spec", livesAt };

  return { name, kind: "not-a-spec" };
}

function namesIn(fromScratch: string): string[] {
  return [...fromScratch.matchAll(NAMED_IN_BACKTICKS)]
    .map(([, named]) => named)
    .filter((named): named is string => named !== undefined);
}

/** A Status cell's opening bold span, or the whole cell when the page bolds nothing in it. */
function coverageMarker(status: string): string {
  const [, marker] = COVERAGE_MARKER.exec(status) ?? [];

  return marker ?? status;
}

/**
 * Every line the journey tables hold, split into cells — the whole of what this module reads.
 *
 * A markdown table has no closing delimiter, so the scan carries which table it is in: a journey
 * header opens one and the first line that is not a table row ends it. Reading the rows of the
 * journey tables and reading their numbers must not disagree about which lines those are, so both
 * come through here.
 */
function journeyTableLines(page: string): string[][] {
  const lines: string[][] = [];
  let insideJourneyTable = false;

  for (const cells of page.split("\n").map(tableCells)) {
    if (cells.length === 0) insideJourneyTable = false;
    else if (isJourneyTableHeader(cells)) insideJourneyTable = true;
    else if (insideJourneyTable) lines.push(cells);
  }

  return lines;
}

function tableCells(line: string): string[] {
  if (!line.startsWith("|")) return [];

  return line
    .split(CELL_SEPARATOR)
    .slice(1, -1)
    .map((cell) => cell.trim().replaceAll(ESCAPED_PIPE, "|"));
}

function isJourneyTableHeader(cells: readonly string[]): boolean {
  return (
    cells.length === JOURNEY_TABLE_HEADER.length &&
    cells.every((cell, column) => cell === JOURNEY_TABLE_HEADER[column])
  );
}

/** Whether a table line is numbered as a journey — the one thing the two readings share. */
function isNumbered(cells: string[]): cells is [string, ...string[]] {
  const [number] = cells;

  return number !== undefined && JOURNEY_NUMBER.test(number);
}

function isJourneyRow(cells: string[]): cells is JourneyRowCells {
  return isNumbered(cells) && cells.length === JOURNEY_TABLE_COLUMNS;
}

function firstSegment(name: string): string {
  return name.split("/")[0] ?? name;
}

function lastSegment(name: string): string {
  return name.split("/").at(-1) ?? name;
}
