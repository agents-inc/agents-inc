/**
 * Every document that claims to enumerate a source symbol exhaustively still names what that
 * symbol actually holds — judged as MEMBERSHIP in both directions, not as a total.
 *
 * It exists because the same defect was filed five times in eighteen days and re-derived by hand
 * every one of them: 2026-08-01 (72 and 64 against 74), 08-08 (94 against 109), 08-16 (139 against
 * 149), 08-17 (a different document family), 08-18 (165 against 171, and two of the 165 named
 * symbols that had been deleted). A count is correct on the day it is written and wrong within a
 * fortnight, because adding a member is a one-line edit in a file no documentation pass is looking
 * at. Nothing connected the two, so each repair held until the next member landed.
 *
 * **Membership rather than the total, because the two failures are not the same size.** A list that
 * is short under-reports: a reader looks for a sentinel, does not find it, and writes a duplicate
 * constant. A list naming a symbol that no longer exists mis-reports: the reader greps, finds
 * nothing anywhere in the tree, and reasonably concludes the document describes a different
 * codebase — after which nothing else in it is trusted either. Two lists can agree on a total and
 * disagree on every name in it.
 *
 * **The registry is not `STEP_TEXT`-shaped.** The 08-17 filing was about a different family
 * entirely, and a `STEP_TEXT`-specific checker would have caught one of the five. A row names any
 * exported symbol — a const object, a const array, a union — a module's whole export list of one
 * kind, or a whole DIRECTORY's, against any delimited section of any document.
 *
 * **A claim is not always about a symbol, and a section is not always one table.** A directory's
 * exports and a command tree are membership of a TREE — a barrel declares nothing of its own and
 * oclif's `pattern` strategy declares no id anywhere — and one enumeration may be split across
 * several tables, so each has a shape of its own.
 *
 * **A member is not always the whole claim.** Two of the columns a document writes are bound here
 * as one string — `key = value` — because a table stating what each member HOLDS is wrong in a way
 * a key-only reading cannot see. `E2E_SKILL_TITLES` was registered, answered `agrees` over ten
 * members and reported the run clean while five of its document's title cells were wrong: the
 * source side read `property.name.text` and never reached an initializer, and the document side
 * read the first cell of a row and could not reach a second column. Pairs rather than values,
 * because a values-only set cannot see a SWAP — two rows exchanging their titles leave that set
 * identical and every count intact — and because a pair is still a `string`, so the verdict, the
 * comparison and everything downstream of them are untouched by this.
 *
 * **A row that judges nothing is a hard failure, not a skip.** Every check here that has failed us
 * failed by declining to judge, and a row that quietly reads an empty section reads exactly like a
 * row that passed. So a missing file, a missing symbol, a section opener that has moved or appears
 * twice, and an enumeration that parses to nothing all throw.
 *
 * Nothing runs at module scope — the suite beside it is the enforcement, as with
 * `check-findings-frontmatter.ts`, and the package root is a parameter so it can be driven against
 * a fixture.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";

/** Where the check reads from when no other root is given. */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const E2E_CONSTANTS = "e2e/pages/constants.ts";
const E2E_README = ".ai-docs/standards/e2e/README.md";

/** A backticked name shaped like a constant. Group labels (`update`, `init --from`) are not. */
const CONSTANT_SPAN = /`([A-Z][A-Z0-9_]*)`/g;

/** A markdown table's rule row, which is what separates its heading from the rows worth reading. */
const TABLE_RULE = /^\|[\s:|-]+\|\s*$/;

/** The `(count)` or `(...)` a document writes beside a function name it is naming as a member. */
const CALL_SIGNATURE = /\(.*\)$/;

/** A backticked span, which is how a document writes one name. Counting them counts the names. */
const CODE_SPAN = /`[^`]+`/g;

const TABLE_CELL_DELIMITER = "|";
const CODE_SPAN_DELIMITER = "`";

/**
 * What ends a cell: a `|` the author did not escape.
 *
 * Markdown gives a table cell one escape and no other way to hold a pipe — `\|`, which the renderer
 * resolves BEFORE it parses the cell's inline markup, so it works inside a code span where no other
 * backslash escape does. A reader splitting on a bare `|` therefore disagrees with every renderer of
 * the same page about where a correctly-written cell ends, and the row comes out one cell too wide.
 *
 * Spelt exactly as `src/cli/lib/__tests__/helpers/journey-page.ts` spells it, which reads the
 * journey tables through the same rule. Two escape-aware readers disagreeing about where a cell
 * ends would be worse than one naive one, so the two spellings are held against each other in
 * `scripts/check-enumeration-drift.test.ts` — nothing else makes a verbatim copy move with its
 * origin, and a comment naming the other file is findable rather than binding.
 */
const CELL_SEPARATOR = /(?<!\\)\|/;

/** The escape, undone once the cell it belongs to has been separated out. */
const ESCAPED_PIPE = "\\|";

/** What binds a member to its value in a pair. Written once, in {@link pairOf}, for both sides. */
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

/** Extensions a module of this package is written in. A `.gitkeep` is not one. */
const MODULE_EXTENSIONS = [".ts", ".tsx"];

/** A spec beside a module is not part of its directory's export surface, nor a command. */
const SPEC_SUFFIXES = [".test.ts", ".test.tsx"];

/**
 * What separates a topic from its command in an id, per `oclif.topicSeparator` in `package.json`.
 * The roster's own strategy is `pattern`, so a path under the tree IS the id and nothing declares
 * it — which is why the roster is a directory rather than a symbol.
 */
const COMMAND_TOPIC_SEPARATOR = " ";

/**
 * Which members of the source tree a row is about.
 *
 * Three shapes name a FILE: one exported symbol's members, the module's own export list of one
 * kind, or its RE-EXPORT surface — what a consumer imports from it that it did not write. The
 * fourth names a DIRECTORY, because two claims this registry has to hold are membership of a tree
 * and of no file in it — a barrel `index.ts` declares nothing of its own, and no expression
 * anywhere holds "the commands under `src/cli/commands/`". Both had gone unbound for exactly that
 * reason, and the second is what let a live command be documented as deleted.
 *
 * `entries` is the fifth, and it names the same subject as `symbol` read one level deeper: every
 * member bound to the value it holds. It is a shape of its own rather than an option on `symbol`
 * because the two answer different strings for the same literal, and a row states which of them its
 * document carries — a table with a value column is a different claim from a list of names, and the
 * one that went wrong is the one nothing was reading.
 *
 * `reexports` is a shape rather than a widening of either neighbour. `exports` reads DECLARATIONS
 * and skips every `export { … }`; the directory reader answers a whole tree, so a row naming one
 * file cannot ask it — and it drops type-only re-exports, which is right for its own subject
 * (exported VALUES) and wrong for this one: a module's re-export surface is what its consumers
 * import, and seven of the thirty-one this was written for are types. `"every-name"` says so, and
 * leaves room for a values-only reading to arrive with its own reason rather than by default.
 */
export type SourceEnumeration =
  | { file: string; symbol: string }
  | { file: string; entries: string }
  | { file: string; exports: "const" | "function" }
  | { file: string; reexports: "every-name" }
  | { directory: string; enumerates: "exported-values" | "command-ids" };

/**
 * Where a document states that membership. The section is the text strictly between the two
 * markers, so a marker may carry the symbol's own name without the reader counting it as a member.
 *
 * `code-spans` reads every constant-shaped backticked name in the section. `table-rows` reads the
 * first cell of every row under the first table's rule.
 *
 * `table-pairs` reads two NAMED columns of the section's table and answers `key = value` for each
 * row. The columns are named rather than counted because a document is free to write a third
 * between them, and because a positional reader goes on answering confidently after a column is inserted, which is the failure this whole file exists
 * to refuse. A heading that has been renamed is refused by name rather than read as an empty
 * column, since silently reading nothing is how the binding was lost in the first place.
 *
 * `partitioned-tables` reads every table in the section whose first column carries `column`, for an
 * enumeration a document states as several tables rather than one. The heading is named rather than inferred from the first table, so a table
 * on another subject standing between them is not read and a renamed heading refuses rather than
 * dropping a whole partition.
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

/** One claim's answer: the document and the source name the same members, or these differ. */
export type EnumerationVerdict =
  | { claim: string; outcome: "agrees"; members: number }
  | {
      claim: string;
      outcome: "drifted";
      namedButAbsent: string[];
      presentButUnnamed: string[];
    };

export type CheckResult = { clean: boolean; verdicts: EnumerationVerdict[] };

/**
 * Every enumeration a document claims is exhaustive. One row per claim; a claim spanning two
 * documents is two rows, because each is separately wrong.
 */
export const REGISTRY: RegistryEntry[] = [
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
  // Five of the nine constant objects `e2e/pages/constants.ts` exports, against the quick-reference
  // that states each as a prose list. `STEP_TEXT` is registered above; these are its neighbours, and a spec reaching for a sentinel the list omits writes a
  // literal instead — which is how `FILES.MARKETPLACE_JSON` acquired stragglers.
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
      // Anchored WITHOUT a count. It carried "— all 12" until 2026-08-23, which made a prose
      // number load-bearing shell for this row: a 13th member reddens the members check
      // below, and whoever then corrected the prose to "all 13" broke this anchor and
      // reddened a SECOND row for an unrelated-looking reason. The members check is what
      // states exhaustiveness; the sentence does not need to say it twice.
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
 * Every name a module RE-EXPORTS — the identity a consumer imports from it and did not write there.
 *
 * **The design question this shape turns on is what a locally-imported-then-re-exported name
 * resolves to, and the answer is: the export clause's own spelling, with nothing followed to reach
 * it.** A document stating this surface is a list of what a spec writes in its import statement,
 * and the origin module is prose in the row beside it — so `export { a as b }` answers `b`, and a
 * bare block's names answer exactly as they are written whether their origin is one hop away or
 * five. No `moduleSpecifier` is resolved, which is why a form the existing reader returns nothing
 * for is readable here at all.
 *
 * The module's IMPORTS are read for one purpose, and it is the refusal: a bare block can hand on a
 * name the module DECLARED, and such a declaration carries no export modifier, so `exports:
 * "function"` cannot see it either. That name would fall through both readers and be reported by
 * neither — the silent under-report this file refuses everywhere else, and the reason a bare block
 * is not simply read as a list of names.
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

/** Every local name an import statement binds — default, namespace and named alike, types included. */
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

/**
 * What a directory holds: every value its modules export, or the command id each module defines.
 *
 * A spec beside a module is neither — it exports test scaffolding and oclif's pattern strategy runs
 * over compiled command modules alone — so both readers walk the same filtered tree.
 */
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

/** Every module under a directory, deepest last, as paths relative to it. */
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

/** The id oclif's pattern strategy gives a command module: its path under the tree, extension off. */
function commandIdOf(module: string): string {
  const withoutExtension = module.replace(/\.[^.]+$/, "");

  return withoutExtension.split(path.sep).join(COMMAND_TOPIC_SEPARATOR);
}

/**
 * The values one module contributes to its directory's export surface: what it declares, plus every
 * name it re-exports. A name re-exported from a sibling is the sibling's declaration read twice and
 * the caller dedupes it; one re-exported from outside the directory is a member only this reader
 * sees. A whole-module `export *` names nothing at all, and is refused rather than skipped.
 */
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

/** What a refusal about the source half is about, so the failure names a symbol and not a file. */
function subjectOf(source: SourceEnumeration): string {
  if ("directory" in source) return `the ${source.enumerates} of ${source.directory}`;
  if ("symbol" in source) return `${source.symbol} in ${source.file}`;
  if ("entries" in source) return `the entries of ${source.entries} in ${source.file}`;
  if ("reexports" in source) return `the re-exports of ${source.file}`;

  return `the exported ${source.exports}s of ${source.file}`;
}

/**
 * The members of one exported symbol: an object's keys, an array's strings, a union's literals.
 *
 * A symbol of any other shape enumerates nothing, and falls to the caller's zero-member refusal
 * along with the empty object — one message, because to a reader they are the same defect.
 */
function membersOfSymbol(file: ts.SourceFile, symbol: string, claim: string): string[] {
  const declared = declarationOf(file, symbol);
  if (declared === undefined) throw refusal(claim, NO_SYMBOL, symbol);

  if (ts.isObjectLiteralExpression(declared)) return keysOf(declared, claim, symbol);
  if (ts.isArrayLiteralExpression(declared)) return stringsOf(declared.elements, claim, symbol);
  if (ts.isUnionTypeNode(declared)) return stringsOf(declared.types, claim, symbol);

  return [];
}

/**
 * The same symbol's members bound to the values they hold, one `key = value` per property.
 *
 * A symbol of any other shape enumerates nothing and falls to the caller's refusal, as above — an
 * array and a union have members but no values, so a row asking either of them for pairs has named
 * the wrong shape rather than found an empty one.
 */
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
 * What one member holds, in the single spelling this file reads a value in anywhere: a string
 * literal, exactly as {@link stringsOf} reads an array's elements and a union's members.
 *
 * Every other spelling is refused rather than read, and the reason is that each would have to be
 * GUESSED at rather than looked up. A template with a substitution has no text until its references
 * are resolved — `SCHEMA_PATHS` writes all seven of its values that way, and the literal text under
 * the substitution is a suffix rather than the value. An identifier names a declaration elsewhere
 * in the module, or in another module — `STANDARD_FILES.METADATA_YAML` is written that way. A
 * shorthand, a method and a getter have no initializer to read at all. Skipping any of them would
 * under-report the source by one member while reporting the rest as agreed, which is the exact
 * shape of the defect this reader was added to close.
 *
 * The member is named in the refusal rather than the symbol, so the repair is one row of one table.
 */
function valueOf(property: ts.ObjectLiteralElementLike, claim: string, member: string): string {
  if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
    throw refusal(claim, UNREADABLE_VALUE, member);
  }

  return property.initializer.text;
}

/** What the symbol is defined as, with any `as const`, `satisfies` and parentheses read through. */
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

/**
 * An annotation constrains what a declaration may hold; it is not itself the membership list. So
 * every one of them is read through to the literal underneath, `satisfies` included — `as const
 * satisfies readonly T[]` is this codebase's house style for a vocabulary array, which made the
 * shapes most worth binding the ones the reader could not see.
 */
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

/**
 * An object's property names. A spread or a computed key is a member this reader cannot name, and
 * dropping it silently would under-report the source — the exact shape every one of the five
 * filings took — so it refuses instead.
 */
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

/** Every name a module exports of one kind, which is what a "no other X is exported" claim is about. */
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

/** The text strictly between the markers, so neither marker's own words are read as members. */
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

/** The first cell of every row under the table's rule — the heading and the rule itself are not rows. */
function tableRowKeysIn(section: string, claim: string): string[] {
  const lines = section.split("\n");
  const rule = lines.findIndex((line) => TABLE_RULE.test(line));
  if (rule === -1) return [];

  return rowKeysUnder(lines, rule, claim);
}

/** Which cells of a row hold the two halves of a pair, resolved from the headings once per table. */
type PairColumns = { key: number; value: number };

/**
 * Every row of the section's table as `key = value`, read from the two columns the claim NAMES.
 *
 * The key half goes through {@link memberNameIn}, so one member per row is the same contract here
 * as it is for the reader above and is stated in one place. The value half is read verbatim —
 * markup off and trimmed, with no call signature stripped — because a value is text the document
 * quotes rather than a name it writes, and `plans(3)` is a value that means what it says.
 */
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

/**
 * Which column a heading names — refused when the document no longer carries it, and refused again
 * when it carries it twice.
 *
 * Neither is a case to guess at. A renamed heading read as an empty column would answer `key = `
 * for every row and report the whole table as drifted, which invites the repair of editing a
 * correct document; read as a MISSING column it would answer nothing, which is the silent pass this
 * file refuses everywhere. And two columns under one heading is a table whose author meant one of
 * them; taking whichever comes first binds the row to a column by accident.
 */
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

/** The same, for every table in the section whose first column carries the heading `column`. */
function partitionedTableKeysIn(section: string, column: string, claim: string): string[] {
  const lines = section.split("\n");

  return lines.flatMap((line, index) =>
    TABLE_RULE.test(line) && headingAbove(lines, index) === column
      ? rowKeysUnder(lines, index, claim)
      : [],
  );
}

/** A heading names a column rather than a member, so it is read as written and never refused. */
function headingAbove(lines: string[], rule: number): string {
  return cellTextOf(firstCellOf(lines[rule - 1] ?? ""));
}

function rowKeysUnder(lines: string[], rule: number, claim: string): string[] {
  return rowsUnder(lines, rule).map((row) => memberNameIn(firstCellOf(row), claim));
}

/** A table's rows, which end at the first line under its rule that is not one. */
function rowsUnder(lines: string[], rule: number): string[] {
  const body = lines.slice(rule + 1);
  const ends = body.findIndex((line) => !isTableRow(line));

  return ends === -1 ? body : body.slice(0, ends);
}

function isTableRow(line: string): boolean {
  return line.trimStart().startsWith(TABLE_CELL_DELIMITER);
}

/**
 * The one member a row states, or a refusal to guess which of several it meant.
 *
 * A row maps to exactly one member here and always has, so a cell naming two is outside what this
 * reader can answer. It is refused rather than read because the failure mode of reading it is a
 * confident wrong answer: {@link CALL_SIGNATURE} is greedy and anchored at the end, so
 * `` `agentsPath(dir)` / `skillsPath(dir)` `` loses everything from the first `(` to the last `)`
 * and survives as the single valid name `agentsPath` — whereupon the checker reports `skillsPath`,
 * which the document plainly carries, as unnamed. A checker that manufactures a drift report is
 * worse than one that refuses, because the repair it invites is to edit a correct document.
 *
 * Splitting the cell on a separator was the alternative and is rejected: no separator convention is
 * stated anywhere, `/` is also an ordinary character in the path-valued tables this same reader
 * serves, and inferring one would make the answer depend on punctuation. One name per cell is the
 * contract, and this is where it is enforced.
 */
function memberNameIn(cell: string, claim: string): string {
  if ([...cell.matchAll(CODE_SPAN)].length > 1) {
    throw refusal(claim, AMBIGUOUS_MEMBER_CELL, cell.trim());
  }

  return cellTextOf(cell).replace(CALL_SIGNATURE, "");
}

/**
 * The cells of a row as written, code spans intact, which is what counting their names needs. A row
 * opens with the delimiter, so the first part of the split is the empty string before it.
 *
 * The escape is undone here rather than left to the readers, so a cell answers what the page
 * renders — every column of a row is separated and read by one rule, whichever reader asks.
 */
function cellsOf(row: string): string[] {
  return row
    .split(CELL_SEPARATOR)
    .slice(1)
    .map((cell) => cell.replaceAll(ESCAPED_PIPE, TABLE_CELL_DELIMITER));
}

function firstCellOf(row: string): string {
  return cellsOf(row)[0] ?? "";
}

/** What a cell says with its markup off. A heading and a value are both read exactly this far. */
function cellTextOf(cell: string): string {
  return cell.replaceAll(CODE_SPAN_DELIMITER, "").trim();
}

/**
 * One member bound to its value. Both sides of the check pass through here, so the encoding is
 * written once and a source pair and a document pair cannot be spelt differently.
 */
function pairOf(key: string, value: string): string {
  return `${key}${PAIR_SEPARATOR}${value}`;
}

/** Named so the row to repair is the one the failure prints, rather than a fault with no address. */
function refusal(claim: string, problem: string, subject: string): Error {
  return new Error(`${claim}: ${problem} — ${subject}`);
}
