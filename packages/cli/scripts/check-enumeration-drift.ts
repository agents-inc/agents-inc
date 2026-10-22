/**
 * Refuses a document whose exhaustive enumeration of a source symbol disagrees with what the symbol
 * holds, judged as membership in both directions. A row that judges nothing throws.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const E2E_CONSTANTS = "e2e/pages/constants.ts";
const E2E_README = ".ai-docs/standards/e2e/README.md";

const CONSTANT_SPAN = /`([A-Z][A-Z0-9_]*)`/g;

const TABLE_RULE = /^\|[\s:|-]+\|\s*$/;

const CALL_SIGNATURE = /\(.*\)$/;

const CODE_SPAN = /`[^`]+`/g;

const TABLE_CELL_DELIMITER = "|";
const CODE_SPAN_DELIMITER = "`";

/** An unescaped `|`; Markdown resolves `\|` before inline markup, even in code spans. */
const CELL_SEPARATOR = /(?<!\\)\|/;

const ESCAPED_PIPE = "\\|";

const PAIR_SEPARATOR = " = ";

export const NO_SOURCE_FILE = "names a source file that does not exist";
export const NO_SOURCE_DIRECTORY = "names a source directory that does not exist";
export const NO_SYMBOL = "names a symbol its source file does not export";
export const SOURCE_ENUMERATES_NOTHING = "names a symbol that enumerates nothing";
export const UNREADABLE_MEMBER = "names a symbol holding a member no reader can name";
export const UNREADABLE_VALUE = "names a symbol holding a member whose value no reader can name";
export const UNNAMEABLE_REEXPORT = "names a directory whose module re-exports a whole module";
export const WHOLE_MODULE_REEXPORT = "names a file that re-exports a whole module";
export const REEXPORTS_A_DECLARATION = "names a file handing on its own declaration as a re-export";
export const NO_DOCUMENT = "names a document that does not exist";
export const NO_SECTION = "names a section its document no longer holds";
export const AMBIGUOUS_SECTION = "opens a section at text the document uses more than once";
export const DOCUMENT_ENUMERATES_NOTHING = "opens a section that enumerates nothing";
export const AMBIGUOUS_MEMBER_CELL = "opens a section whose table cell names more than one member";
export const NO_COLUMN = "opens a section whose table carries no column of that name";
export const AMBIGUOUS_COLUMN = "opens a section whose table carries that column twice";

const MODULE_EXTENSIONS = [".ts", ".tsx"];

const SPEC_SUFFIXES = [".test.ts", ".test.tsx"];

/** `oclif.topicSeparator` in package.json. */
const COMMAND_TOPIC_SEPARATOR = " ";

/**
 * `entries` reads `key = value` pairs, so a swapped value is visible. `reexports` includes type-only
 * re-exports, unlike the directory reader.
 */
type SourceEnumeration =
  | { file: string; symbol: string }
  | { file: string; entries: string }
  | { file: string; exports: "const" | "function" }
  | { file: string; reexports: "every-name" }
  | { directory: string; enumerates: "exported-values" | "command-ids" };

/**
 * The section is the text strictly between `from` and `to`. Table columns are named rather than
 * positional, and a missing heading is refused rather than read as empty.
 */
type DocumentSection = { document: string; from: string; to: string };

export type DocumentClaim =
  | (DocumentSection & { states: "code-spans" })
  | (DocumentSection & { states: "table-rows" })
  | (DocumentSection & { states: "table-pairs"; keyColumn: string; valueColumn: string })
  | (DocumentSection & { states: "partitioned-tables"; column: string });

export type RegistryEntry = {
  claim: string;
  source: SourceEnumeration;
  document: DocumentClaim;
};

type EnumerationVerdict =
  | { claim: string; outcome: "agrees"; members: number }
  | {
      claim: string;
      outcome: "drifted";
      namedButAbsent: string[];
      presentButUnnamed: string[];
    };

export type CheckResult = { clean: boolean; verdicts: EnumerationVerdict[] };

/** One row per claim; a claim spanning two documents is two rows. */
const REGISTRY: RegistryEntry[] = [
  {
    claim: "STEP_TEXT in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "STEP_TEXT" },
    document: {
      document: E2E_README,
      from: "the groups below partition all",
      to: "**Diff markers",
      states: "code-spans",
    },
  },
  {
    claim: "DIRS in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "DIRS" },
    document: {
      document: E2E_README,
      from: "**Directories (`DIRS`):**",
      to: "**Files (`FILES`)",
      states: "code-spans",
    },
  },
  {
    claim: "FILES in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "FILES" },
    document: {
      document: E2E_README,
      // No count in the anchor: the members check states exhaustiveness.
      from: "**Files (`FILES`)**",
      to: "**Step text (`STEP_TEXT`)",
      states: "code-spans",
    },
  },
  {
    claim: "TIMEOUTS in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "TIMEOUTS" },
    document: {
      document: E2E_README,
      from: "**Timeouts (`TIMEOUTS`):**",
      to: "`WIZARD_LOAD` was raised",
      states: "code-spans",
    },
  },
  {
    claim: "EXIT_CODES in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "EXIT_CODES" },
    document: {
      document: E2E_README,
      from: "**Exit codes (`EXIT_CODES`):**",
      to: "**Terminal geometry (`TERMINAL_SIZE`):**",
      states: "code-spans",
    },
  },
  {
    claim: "SOURCE_PATHS in standards/e2e/README.md",
    source: { file: E2E_CONSTANTS, symbol: "SOURCE_PATHS" },
    document: {
      document: E2E_README,
      from: "**Source paths (`SOURCE_PATHS`):**",
      to: "These are paths within",
      states: "code-spans",
    },
  },
];

export function check({
  packageRoot = PACKAGE_ROOT,
  registry = REGISTRY,
}: { packageRoot?: string | undefined; registry?: RegistryEntry[] | undefined } = {}): CheckResult {
  const verdicts = registry.map((entry) => judgeEntry(packageRoot, entry));

  return { clean: verdicts.every((verdict) => verdict.outcome !== "drifted"), verdicts };
}

function judgeEntry(packageRoot: string, entry: RegistryEntry): EnumerationVerdict {
  const held = readSource(packageRoot, entry);
  const named = readDocument(packageRoot, entry);

  const namedButAbsent = named.filter((member) => !held.includes(member));
  const presentButUnnamed = held.filter((member) => !named.includes(member));

  if (namedButAbsent.length === 0 && presentButUnnamed.length === 0) {
    return { claim: entry.claim, outcome: "agrees", members: held.length };
  }

  return { claim: entry.claim, outcome: "drifted", namedButAbsent, presentButUnnamed };
}

function readSource(packageRoot: string, { claim, source }: RegistryEntry): string[] {
  const members =
    "directory" in source
      ? membersOfDirectory(packageRoot, source, claim)
      : membersOfFile(packageRoot, source, claim);

  if (members.length === 0) throw refusal(claim, SOURCE_ENUMERATES_NOTHING, subjectOf(source));

  return members;
}

function membersOfFile(
  packageRoot: string,
  source: Extract<SourceEnumeration, { file: string }>,
  claim: string,
): string[] {
  const filePath = path.join(packageRoot, source.file);
  if (!existsSync(filePath)) throw refusal(claim, NO_SOURCE_FILE, source.file);

  const file = parseModule(filePath);

  if ("symbol" in source) return membersOfSymbol(file, source.symbol, claim);
  if ("entries" in source) return entriesOfSymbol(file, source.entries, claim);
  if ("reexports" in source) return reexportSurfaceOf(file, claim, source.file);

  return exportedNames(file, source.exports);
}

/**
 * Names as the export clause spells them, with no module resolved. A bare block handing on a local
 * declaration is refused, since no reader would otherwise see it.
 */
function reexportSurfaceOf(file: ts.SourceFile, claim: string, module: string): string[] {
  const bound = importedNamesIn(file);

  return file.statements.flatMap((statement) => reexportsIn(statement, bound, claim, module));
}

function reexportsIn(
  statement: ts.Statement,
  bound: Set<string>,
  claim: string,
  module: string,
): string[] {
  if (!ts.isExportDeclaration(statement)) return [];

  const { exportClause, moduleSpecifier } = statement;
  if (exportClause === undefined || !ts.isNamedExports(exportClause)) {
    throw refusal(claim, WHOLE_MODULE_REEXPORT, module);
  }
  if (moduleSpecifier !== undefined)
    return exportClause.elements.map((element) => element.name.text);

  const declared = exportClause.elements
    .map((element) => (element.propertyName ?? element.name).text)
    .filter((local) => !bound.has(local));
  if (declared.length > 0) {
    throw refusal(claim, REEXPORTS_A_DECLARATION, `${declared.join(", ")} in ${module}`);
  }

  return exportClause.elements.map((element) => element.name.text);
}

function importedNamesIn(file: ts.SourceFile): Set<string> {
  return new Set(file.statements.flatMap(importedNamesOf));
}

function importedNamesOf(statement: ts.Statement): string[] {
  if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) return [];

  const { name, namedBindings } = statement.importClause;
  const defaultName = name === undefined ? [] : [name.text];
  if (namedBindings === undefined) return defaultName;

  return ts.isNamespaceImport(namedBindings)
    ? [...defaultName, namedBindings.name.text]
    : [...defaultName, ...namedBindings.elements.map((element) => element.name.text)];
}

function membersOfDirectory(
  packageRoot: string,
  source: { directory: string; enumerates: "exported-values" | "command-ids" },
  claim: string,
): string[] {
  const directoryPath = path.join(packageRoot, source.directory);
  if (!existsSync(directoryPath)) throw refusal(claim, NO_SOURCE_DIRECTORY, source.directory);

  const modules = modulesUnder(directoryPath);

  if (source.enumerates === "command-ids") return modules.map(commandIdOf);

  return [...new Set(modules.flatMap((module) => exportedValuesOf(directoryPath, module, claim)))];
}

function modulesUnder(directoryPath: string, prefix = ""): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      return modulesUnder(path.join(directoryPath, entry.name), relativePath);
    }

    return isModule(entry.name) ? [relativePath] : [];
  });
}

function isModule(name: string): boolean {
  return (
    MODULE_EXTENSIONS.some((extension) => name.endsWith(extension)) &&
    !SPEC_SUFFIXES.some((suffix) => name.endsWith(suffix))
  );
}

function commandIdOf(module: string): string {
  const withoutExtension = module.replace(/\.[^.]+$/, "");

  return withoutExtension.split(path.sep).join(COMMAND_TOPIC_SEPARATOR);
}

function exportedValuesOf(directoryPath: string, module: string, claim: string): string[] {
  const file = parseModule(path.join(directoryPath, module));

  return [
    ...exportedNames(file, "const"),
    ...exportedNames(file, "function"),
    ...file.statements.flatMap((statement) => reexportedNames(statement, claim, module)),
  ];
}

function reexportedNames(statement: ts.Statement, claim: string, module: string): string[] {
  if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier === undefined) return [];
  if (statement.isTypeOnly) return [];

  const { exportClause } = statement;
  if (exportClause === undefined || !ts.isNamedExports(exportClause)) {
    throw refusal(claim, UNNAMEABLE_REEXPORT, module);
  }

  return exportClause.elements
    .filter((element) => !element.isTypeOnly)
    .map((element) => element.name.text);
}

function parseModule(filePath: string): ts.SourceFile {
  return ts.createSourceFile(filePath, readFileSync(filePath, "utf-8"), ts.ScriptTarget.Latest);
}

function subjectOf(source: SourceEnumeration): string {
  if ("directory" in source) return `the ${source.enumerates} of ${source.directory}`;
  if ("symbol" in source) return `${source.symbol} in ${source.file}`;
  if ("entries" in source) return `the entries of ${source.entries} in ${source.file}`;
  if ("reexports" in source) return `the re-exports of ${source.file}`;

  return `the exported ${source.exports}s of ${source.file}`;
}

/** An object's keys, an array's strings or a union's literals; any other shape enumerates nothing. */
function membersOfSymbol(file: ts.SourceFile, symbol: string, claim: string): string[] {
  const declared = declarationOf(file, symbol);
  if (declared === undefined) throw refusal(claim, NO_SYMBOL, symbol);

  if (ts.isObjectLiteralExpression(declared)) return keysOf(declared, claim, symbol);
  if (ts.isArrayLiteralExpression(declared)) return stringsOf(declared.elements, claim, symbol);
  if (ts.isUnionTypeNode(declared)) return stringsOf(declared.types, claim, symbol);

  return [];
}

function entriesOfSymbol(file: ts.SourceFile, symbol: string, claim: string): string[] {
  const declared = declarationOf(file, symbol);
  if (declared === undefined) throw refusal(claim, NO_SYMBOL, symbol);
  if (!ts.isObjectLiteralExpression(declared)) return [];

  return declared.properties.map((property) => entryOf(property, claim, symbol));
}

function entryOf(property: ts.ObjectLiteralElementLike, claim: string, symbol: string): string {
  const key = keyOf(property, claim, symbol);

  return pairOf(key, valueOf(property, claim, `${key} in ${symbol}`));
}

/**
 * Only a string literal is read; any other spelling would have to be guessed at, so it is refused
 * rather than silently under-reporting.
 */
function valueOf(property: ts.ObjectLiteralElementLike, claim: string, member: string): string {
  if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
    throw refusal(claim, UNREADABLE_VALUE, member);
  }

  return property.initializer.text;
}

function declarationOf(file: ts.SourceFile, symbol: string): ts.Node | undefined {
  for (const statement of file.statements) {
    if (ts.isTypeAliasDeclaration(statement) && statement.name.text === symbol) {
      return statement.type;
    }

    if (!ts.isVariableStatement(statement)) continue;

    const declaration = statement.declarationList.declarations.find(
      (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === symbol,
    );
    if (declaration?.initializer !== undefined) return unwrap(declaration.initializer);
  }

  return undefined;
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return unwrap(expression.expression);
  }

  return expression;
}

/** A spread or computed key is refused rather than silently dropped. */
function keysOf(literal: ts.ObjectLiteralExpression, claim: string, symbol: string): string[] {
  return literal.properties.map((property) => keyOf(property, claim, symbol));
}

function keyOf(property: ts.ObjectLiteralElementLike, claim: string, symbol: string): string {
  const { name } = property;
  if (name === undefined || (!ts.isIdentifier(name) && !ts.isStringLiteral(name))) {
    throw refusal(claim, UNREADABLE_MEMBER, symbol);
  }

  return name.text;
}

function stringsOf(
  nodes: ts.NodeArray<ts.Expression | ts.TypeNode>,
  claim: string,
  symbol: string,
): string[] {
  return nodes.map((node) => {
    const literal = ts.isLiteralTypeNode(node) ? node.literal : node;
    if (!ts.isStringLiteral(literal)) throw refusal(claim, UNREADABLE_MEMBER, symbol);

    return literal.text;
  });
}

function exportedNames(file: ts.SourceFile, kind: "const" | "function"): string[] {
  const exported = file.statements.filter(isExported);

  return kind === "function" ? exported.flatMap(functionNameOf) : exported.flatMap(constantNamesOf);
}

function functionNameOf(statement: ts.Statement): string[] {
  if (!ts.isFunctionDeclaration(statement) || statement.name === undefined) return [];

  return [statement.name.text];
}

function constantNamesOf(statement: ts.Statement): string[] {
  if (!ts.isVariableStatement(statement)) return [];

  return statement.declarationList.declarations
    .map((declaration) => declaration.name)
    .filter((name) => ts.isIdentifier(name))
    .map((name) => name.text);
}

function isExported(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    (ts.getModifiers(statement) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

function readDocument(packageRoot: string, { claim, document }: RegistryEntry): string[] {
  const documentPath = path.join(packageRoot, document.document);
  if (!existsSync(documentPath)) throw refusal(claim, NO_DOCUMENT, document.document);

  const section = sectionOf(readFileSync(documentPath, "utf-8"), document, claim);
  const named = namesIn(section, document, claim);

  if (named.length === 0) throw refusal(claim, DOCUMENT_ENUMERATES_NOTHING, document.from);

  return [...new Set(named)];
}

function namesIn(section: string, document: DocumentClaim, claim: string): string[] {
  switch (document.states) {
    case "code-spans":
      return constantSpansIn(section);
    case "table-rows":
      return tableRowKeysIn(section, claim);
    case "table-pairs":
      return tablePairsIn(section, document, claim);
    case "partitioned-tables":
      return partitionedTableKeysIn(section, document.column, claim);
    default: {
      const exhaustive: never = document;

      return exhaustive;
    }
  }
}

function sectionOf(source: string, { from, to }: DocumentClaim, claim: string): string {
  const opens = source.indexOf(from);
  if (opens === -1) throw refusal(claim, NO_SECTION, from);

  const start = opens + from.length;
  if (source.includes(from, start)) throw refusal(claim, AMBIGUOUS_SECTION, from);

  const closes = source.indexOf(to, start);
  if (closes === -1) throw refusal(claim, NO_SECTION, to);

  return source.slice(start, closes);
}

function constantSpansIn(section: string): string[] {
  return [...section.matchAll(CONSTANT_SPAN)].flatMap((match) => match[1] ?? []);
}

function tableRowKeysIn(section: string, claim: string): string[] {
  const lines = section.split("\n");
  const rule = lines.findIndex((line) => TABLE_RULE.test(line));
  if (rule === -1) return [];

  return rowKeysUnder(lines, rule, claim);
}

type PairColumns = { key: number; value: number };

/** Values are read verbatim, with no call signature stripped. */
function tablePairsIn(
  section: string,
  document: Extract<DocumentClaim, { states: "table-pairs" }>,
  claim: string,
): string[] {
  const lines = section.split("\n");
  const rule = lines.findIndex((line) => TABLE_RULE.test(line));
  if (rule === -1) return [];

  const headings = cellsOf(lines[rule - 1] ?? "").map(cellTextOf);
  const columns = {
    key: columnIndexOf(headings, document.keyColumn, claim),
    value: columnIndexOf(headings, document.valueColumn, claim),
  };

  return rowsUnder(lines, rule).map((row) => pairIn(row, columns, claim));
}

function columnIndexOf(headings: string[], column: string, claim: string): number {
  if (!headings.includes(column)) throw refusal(claim, NO_COLUMN, column);
  if (occursTwice(headings, column)) throw refusal(claim, AMBIGUOUS_COLUMN, column);

  return headings.indexOf(column);
}

function occursTwice(headings: string[], column: string): boolean {
  return headings.indexOf(column) !== headings.lastIndexOf(column);
}

function pairIn(row: string, columns: PairColumns, claim: string): string {
  const cells = cellsOf(row);

  return pairOf(
    memberNameIn(cells[columns.key] ?? "", claim),
    cellTextOf(cells[columns.value] ?? ""),
  );
}

function partitionedTableKeysIn(section: string, column: string, claim: string): string[] {
  const lines = section.split("\n");

  return lines.flatMap((line, index) =>
    TABLE_RULE.test(line) && headingAbove(lines, index) === column
      ? rowKeysUnder(lines, index, claim)
      : [],
  );
}

function headingAbove(lines: string[], rule: number): string {
  return cellTextOf(firstCellOf(lines[rule - 1] ?? ""));
}

function rowKeysUnder(lines: string[], rule: number, claim: string): string[] {
  return rowsUnder(lines, rule).map((row) => memberNameIn(firstCellOf(row), claim));
}

function rowsUnder(lines: string[], rule: number): string[] {
  const body = lines.slice(rule + 1);
  const ends = body.findIndex((line) => !isTableRow(line));

  return ends === -1 ? body : body.slice(0, ends);
}

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith(TABLE_CELL_DELIMITER);
}

/**
 * One member per cell. A cell naming several is refused: the greedy {@link CALL_SIGNATURE} strip
 * would otherwise keep the first name and report the rest as unnamed.
 */
function memberNameIn(cell: string, claim: string): string {
  if ([...cell.matchAll(CODE_SPAN)].length > 1) {
    throw refusal(claim, AMBIGUOUS_MEMBER_CELL, cell.trim());
  }

  return cellTextOf(cell).replace(CALL_SIGNATURE, "");
}

/** The leading delimiter yields an empty first part, which is dropped. */
function cellsOf(row: string): string[] {
  return row
    .split(CELL_SEPARATOR)
    .slice(1)
    .map((cell) => cell.replaceAll(ESCAPED_PIPE, TABLE_CELL_DELIMITER));
}

function firstCellOf(row: string): string {
  return cellsOf(row)[0] ?? "";
}

function cellTextOf(cell: string): string {
  return cell.replaceAll(CODE_SPAN_DELIMITER, "").trim();
}

/** Shared by both sides, so a source pair and a document pair cannot be spelt differently. */
function pairOf(key: string, value: string): string {
  return `${key}${PAIR_SEPARATOR}${value}`;
}

function refusal(claim: string, problem: string, subject: string): Error {
  return new Error(`${claim}: ${problem} — ${subject}`);
}
