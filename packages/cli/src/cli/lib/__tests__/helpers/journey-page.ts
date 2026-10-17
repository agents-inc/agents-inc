/**
 * Reads `.ai-docs/standards/e2e/user-journeys.md`'s journey tables. Classification is total: every
 * backticked name is a spec, an unlocated spec or not a spec, so nothing is skipped silently.
 */
import fg from "fast-glob";

export const SPEC_SUFFIX = ".e2e.test.ts";

/** "No from-scratch spec", in `user-journeys.md`'s vocabulary. */
export const TO_TEST_MARKER = "TO TEST";

/**
 * The `e2e/` directories whose names are spec references. Stated rather than read off the tree, so
 * a spec landing in a helper directory cannot reclassify names; the spec holds it against the tree.
 */
export const SPEC_DIRECTORIES: readonly string[] = [
  "commands",
  "integration",
  "interactive",
  "lifecycle",
  "matchers",
];

// Matched by heading cells, not width: width is what a malformed row gets wrong.
const JOURNEY_TABLE_HEADER = ["#", "Journey", "From-scratch spec", "Surfaces asserted", "Status"];

const JOURNEY_TABLE_COLUMNS = JOURNEY_TABLE_HEADER.length;

/** e.g. `13`, `13a`. */
const JOURNEY_NUMBER = /^\d+[a-z]?$/;

// An unescaped `|`: markdown resolves `\|` even inside a code span. Copied verbatim into
// `scripts/check-enumeration-drift.ts`, whose spec holds the two together.
const CELL_SEPARATOR = /(?<!\\)\|/;

const ESCAPED_PIPE = "\\|";

const NAMED_IN_BACKTICKS = /`([^`]+)`/g;

const COVERAGE_MARKER = /\*\*([^*]+)\*\*/;

/** `unlocated-spec`: a real spec named by basename alone — a page defect, not a coverage one. */
export type SpecReference =
  | { name: string; kind: "spec" }
  | { name: string; kind: "unlocated-spec"; livesAt: string }
  | { name: string; kind: "not-a-spec" };

export type JourneyRow = {
  number: string;
  journey: string;
  references: readonly SpecReference[];
  marker: string;
};

type JourneyRowCells = [string, string, string, string, string];

/** Named as the page names them: directory, basename, no suffix. */
export function readSpecNames(e2eRoot: string): string[] {
  return fg
    .sync(`**/*${SPEC_SUFFIX}`, { cwd: e2eRoot })
    .map((file) => file.slice(0, -SPEC_SUFFIX.length))
    .sort();
}

/** For the gate on `SPEC_DIRECTORIES` only; the reader must not consult it. */
export function specDirectoriesIn(specNames: readonly string[]): string[] {
  return [...new Set(specNames.map(firstSegment))].sort();
}

/** Throws on no rows or an unresolvable spec name, so no judgement holds vacuously. */
export function readJourneyRows(page: string, specNames: readonly string[]): JourneyRow[] {
  const rows = journeyTableLines(page)
    .filter(isJourneyRow)
    .map((cells) => toJourneyRow(cells, specNames));

  if (rows.length === 0) {
    throw new Error(
      "no journey row parsed out of the page — the column reader has stopped matching",
    );
  }

  return rows;
}

/** Every `#`, whatever the row's shape — so a row `readJourneyRows` drops still shows up here. */
export function journeyNumbersIn(page: string): string[] {
  return journeyTableLines(page)
    .filter(isNumbered)
    .map(([number]) => number);
}

export function specsNamedBy(row: JourneyRow): string[] {
  return row.references.filter((reference) => reference.kind === "spec").map(({ name }) => name);
}

export function unlocatedSpecsIn(rows: readonly JourneyRow[]): string[] {
  return rows.flatMap((row) =>
    row.references
      .filter((reference) => reference.kind === "unlocated-spec")
      .map(({ name }) => name),
  );
}

export function nonSpecNamesIn(rows: readonly JourneyRow[]): string[] {
  return rows.flatMap((row) =>
    row.references.filter((reference) => reference.kind === "not-a-spec").map(({ name }) => name),
  );
}

function toJourneyRow(
  [number, journey, fromScratch, , status]: JourneyRowCells,
  specNames: readonly string[],
): JourneyRow {
  return {
    number,
    journey,
    references: namesIn(fromScratch).map((name) => classify(name, specNames)),
    marker: coverageMarker(status),
  };
}

function classify(name: string, specNames: readonly string[]): SpecReference {
  if (specNames.includes(name)) return { name, kind: "spec" };

  if (SPEC_DIRECTORIES.includes(firstSegment(name))) {
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

/** The cell's opening bold span, or the whole cell. */
function coverageMarker(status: string): string {
  const [, marker] = COVERAGE_MARKER.exec(status) ?? [];

  return marker ?? status;
}

// A journey header opens a table and the first non-table line ends it; both readers use this.
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
