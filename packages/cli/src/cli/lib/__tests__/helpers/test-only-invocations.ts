/**
 * Two readers over a TypeScript source's own text — the callables a module OFFERS, and the names
 * a file INVOKES — plus the predicate that says which side of the tree a path is on.
 *
 * Between them they answer one question: is an exported symbol reached by anything a user runs,
 * or only by the specs written for it? A symbol nothing production-side invokes is dead code
 * whose specs read as coverage of a live feature. `installEject`'s own docblock called it "the
 * main entry point for the 'eject' install mode" while `init.tsx` called the operations layer
 * instead, and the twelve symbols deleted with it carried 116 test invocations between them.
 *
 * **INVOCATIONS rather than references, and both halves of that were measured.** A barrel's
 * `export { installEject } from "./x.js"` and a doc comment's link tag naming `installEject` are
 * production references, and neither keeps a symbol alive — the census that produced those
 * deletions reported two of them as reached for exactly those two reasons. And a BARE NAME is an
 * invocation: `isSnakeCase` was reported dead while `source-validator.ts` hands it straight to
 * `.filter(isSnakeCase)`, so a reader keying on `name(` condemns a live function.
 *
 * A syntax tree rather than text, because that is what tells those apart: a doc comment
 * contributes no identifier to the tree at all, an export specifier is a different node from a
 * reference, and a bare name in an argument list is an ordinary identifier. Each of the three is
 * one traversal rule, and `test-only-invocations.test.ts` plants all three.
 */
import ts from "typescript";

/**
 * How a path says it is test support rather than something that ships. A module read as
 * production here keeps every symbol it touches out of the roster, so each mark is stated with
 * what it covers.
 */
const TEST_SUPPORT_MARKS = [
  /** A spec, whichever suffix the suite collecting it uses. */
  /\.test\.tsx?$/,
  /** The two directories the unit tree keeps its machinery in. */
  /(^|\/)(__tests__|__mocks__)\//,
  /** The E2E tree, every file of which is harness. */
  /(^|\/)e2e\//,
  /** The runner's own entry points, which sit at the package root beside the build's. */
  /(^|\/)vitest\.[^/]+$/,
];

/** Whether this path belongs to the suite rather than to the package the suite is run against. */
export function isTestSupportModule(file: string): boolean {
  return TEST_SUPPORT_MARKS.some((mark) => mark.test(file));
}

/**
 * Every name this module exports that something could call, in source order.
 *
 * A function declaration and the two function-valued `const` forms, and nothing else. A default
 * export is loaded by path and named by no caller; an exported constant, type or class answers a
 * different question than "is this invoked", and a value assembled by a call — `memoize(read)` —
 * is a callable no syntax names as one. Each is left out rather than guessed at, which under-
 * reports and never over-reports: the roster this feeds is only worth having if a name on it is
 * one a reader can act on.
 *
 * A barrel finds nothing here, which is the point — it declares none of what it forwards.
 */
export function exportedCallablesIn(source: string, fileName: string): string[] {
  return parse(source, fileName).statements.flatMap(exportedCallableNamesOf);
}

/**
 * Every name this file reaches as a VALUE, in source order and named once each.
 *
 * "Reaches as a value" is the invocation question written honestly. A bare name handed to a
 * higher-order function is a call the file makes, and a name that appears only in an import list,
 * an export list, a type position, a property key or a comment is not — the four together are
 * every shape that made the earlier census wrong.
 *
 * Names rather than counts: what a gate over this asks is whether ANY production module reaches
 * a symbol, and a count invites an assertion that a count cannot support.
 */
export function invokedNamesIn(source: string, fileName: string): string[] {
  return [...new Set(valueIdentifiersIn(parse(source, fileName)))];
}

function parse(source: string, fileName: string): ts.SourceFile {
  const scriptKind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;

  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKind);
}

function exportedCallableNamesOf(statement: ts.Statement): string[] {
  if (!isNamedExport(statement)) return [];

  if (ts.isFunctionDeclaration(statement)) {
    return statement.name === undefined ? [] : [statement.name.text];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap(functionValuedName);
  }

  return [];
}

/** Exported under a name a caller can write. A default export is reached by path instead. */
function isNamedExport(statement: ts.Statement): boolean {
  const modifiers = modifierKindsOf(statement);

  return (
    modifiers.includes(ts.SyntaxKind.ExportKeyword) &&
    !modifiers.includes(ts.SyntaxKind.DefaultKeyword)
  );
}

function modifierKindsOf(statement: ts.Statement): ts.SyntaxKind[] {
  if (!ts.canHaveModifiers(statement)) return [];

  return (ts.getModifiers(statement) ?? []).map((modifier) => modifier.kind);
}

function functionValuedName(declaration: ts.VariableDeclaration): string[] {
  if (!ts.isIdentifier(declaration.name)) return [];
  if (declaration.initializer === undefined) return [];

  return isFunctionLiteral(declaration.initializer) ? [declaration.name.text] : [];
}

function isFunctionLiteral(expression: ts.Expression): boolean {
  return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression);
}

/**
 * Every identifier under `node` that stands for a value, in source order and with repeats.
 *
 * A type node is not descended into rather than having each identifier inside it judged:
 * `typeof installEject`, `Array<installEject>` and `satisfies Handlers` all erase, and an
 * identifier is reachable in a type position no other way.
 */
function valueIdentifiersIn(node: ts.Node): string[] {
  if (ts.isTypeNode(node)) return [];

  return [...ownValueIdentifier(node), ...childValueIdentifiers(node)];
}

/** What this node contributes on its own, which is one name or none. */
function ownValueIdentifier(node: ts.Node): string[] {
  if (!ts.isIdentifier(node)) return [];

  return isNameSlot(node, node.parent) ? [] : [node.text];
}

function childValueIdentifiers(node: ts.Node): string[] {
  const names: string[] = [];

  ts.forEachChild(node, (child) => {
    names.push(...valueIdentifiersIn(child));
  });

  return names;
}

/**
 * Whether this identifier fills its parent's NAME slot — the place a construct writes what it is
 * called, rather than a place it reaches something.
 *
 * The last line covers every declaration, every property key and every JSX attribute at once,
 * because each of them holds its identifier in a field called `name`. The two arms above it are
 * where that rule is wrong, in opposite directions. A module specifier binds TWO identifiers —
 * `export { installEject as install }` holds the forwarded name and the name it is forwarded
 * under, and neither is a call, which is the barrel half of the defect this reader exists
 * against. Object shorthand is the inverse: `{ installPluginConfig }` writes a property's name
 * and reads the binding of that name in one token, so it is the one name slot that is also a
 * reference.
 */
function isNameSlot(node: ts.Identifier, parent: ts.Node): boolean {
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return true;
  if (ts.isShorthandPropertyAssignment(parent)) return false;

  return "name" in parent && parent.name === node;
}
