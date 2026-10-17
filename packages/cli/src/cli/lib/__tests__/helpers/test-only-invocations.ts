// Finds exports reached only by specs. A syntax tree, not text, so re-exports and doc comments
// don't count as invocations while a bare name passed as a callback does.
import ts from "typescript";

const TEST_SUPPORT_MARKS = [
  /\.test\.tsx?$/,
  /(^|\/)(__tests__|__mocks__)\//,
  /(^|\/)e2e\//,
  /(^|\/)vitest\.[^/]+$/,
];

export function isTestSupportModule(file: string): boolean {
  return TEST_SUPPORT_MARKS.some((mark) => mark.test(file));
}

/** Function declarations and function-valued consts only: under-reports rather than guesses. */
export function exportedCallablesIn(source: string, fileName: string): string[] {
  return parse(source, fileName).statements.flatMap(exportedCallableNamesOf);
}

/** Names used as values; import/export lists, types, property keys and comments don't count. */
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

function valueIdentifiersIn(node: ts.Node): string[] {
  if (ts.isTypeNode(node)) return [];

  return [...ownValueIdentifier(node), ...childValueIdentifiers(node)];
}

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

// The `name` check covers declarations, property keys and JSX attributes. Specifiers bind two
// names (`a as b`) without a `name` match; shorthand `{ a }` is a name slot that is also a read.
function isNameSlot(node: ts.Identifier, parent: ts.Node): boolean {
  if (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent)) return true;
  if (ts.isShorthandPropertyAssignment(parent)) return false;

  return "name" in parent && parent.name === node;
}
