/**
 * Finds rosters of producer callables in a spec and whether the spec holds their membership
 * against a walk of the tree, so a code path added later reddens the spec until judged.
 */
import ts from "typescript";

export type ProducerRoster = {
  name: string;
  derived: boolean;
};

// One producer agrees with itself, so a roster of one claims nothing.
const MIN_PRODUCERS = 2;

const TEST_SUPPORT = /(^|\/)(__tests__|__mocks__|fixtures|factories|helpers|mock-|test-)/;

// Matched on the callee's rightmost name, so `fg.sync(...)` and `fs.readdir(...)` count.
const TREE_WALKS = new Set(["fg", "glob", "globSync", "readdir", "readdirSync"]);

// Key reads count as walks only when their argument is a module namespace (see namesAModule).
const OBJECT_KEY_READS = new Set(["keys", "values", "entries", "getOwnPropertyNames"]);
const TYPED_KEY_READS = new Set(["typedKeys", "typedValues", "typedEntries"]);

type SpecIndex = {
  productImports: ReadonlySet<string>;
  namespaces: ReadonlySet<string>;
  bindings: ReadonlyMap<string, ts.Node>;
  callables: ReadonlyMap<string, ts.Node>;
  assertions: readonly ts.Node[];
};

type ListConstant = {
  name: string;
  members: ts.Expression[];
};

export function producerRostersIn(source: string, fileName: string): ProducerRoster[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

  const productImports = productImportsIn(sourceFile);
  if (productImports.size === 0) return [];

  const index = indexOf(sourceFile, productImports);

  return listConstantsIn(sourceFile)
    .filter((constant) => isProducerRoster(constant, index))
    .map((constant) => ({
      name: constant.name,
      derived: isHeldAgainstAWalk(constant.name, index),
    }));
}

function indexOf(sourceFile: ts.SourceFile, productImports: ReadonlySet<string>): SpecIndex {
  const { bindings, callables } = declarationsIn(sourceFile);

  return {
    productImports,
    namespaces: moduleNamespacesIn(sourceFile),
    bindings,
    callables,
    assertions: assertionsIn(sourceFile),
  };
}

function isProducerRoster({ members }: ListConstant, index: SpecIndex): boolean {
  return members.length >= MIN_PRODUCERS && members.every((member) => isProducer(member, index));
}

// The tree half is seeded with the roster's name per assertion: a roster reached through itself
// is vacuous, not derived.
function isHeldAgainstAWalk(name: string, index: SpecIndex): boolean {
  return index.assertions
    .filter((assertion) => namesTheRoster(assertion, index, name))
    .some((assertion) => reachesTheTree(assertion, index, new Set([name])));
}

function isProducer(member: ts.Expression, index: SpecIndex): boolean {
  const node = unwrap(member);

  if (isFunction(node)) return references(node, index.productImports);
  if (ts.isIdentifier(node)) {
    const callable = index.callables.get(node.text);
    return callable !== undefined && references(callable, index.productImports);
  }
  if (ts.isObjectLiteralExpression(node)) {
    return propertyValuesOf(node).some((value) => isProducer(value, index));
  }
  return false;
}

function reachesTheTree(root: ts.Node, index: SpecIndex, followed: Set<string>): boolean {
  return reachesThroughBindings(root, index, followed, (node) => isWalk(node, index.namespaces));
}

function namesTheRoster(root: ts.Node, index: SpecIndex, name: string): boolean {
  return reachesThroughBindings(
    root,
    index,
    new Set(),
    (node) => ts.isIdentifier(node) && node.text === name,
  );
}

// Follows local bindings, since walks and rosters usually reach an assertion through a local.
// `followed` stops loops; names the caller seeds into it are never followed.
function reachesThroughBindings(
  root: ts.Node,
  index: SpecIndex,
  followed: Set<string>,
  matches: (node: ts.Node) => boolean,
): boolean {
  return containsNode(
    root,
    (node) => matches(node) || followsBinding(node, index, followed, matches),
  );
}

function followsBinding(
  node: ts.Node,
  index: SpecIndex,
  followed: Set<string>,
  matches: (node: ts.Node) => boolean,
): boolean {
  if (!ts.isIdentifier(node) || followed.has(node.text)) return false;

  const binding = index.bindings.get(node.text);
  if (binding === undefined) return false;

  followed.add(node.text);
  return reachesThroughBindings(binding, index, followed, matches);
}

function isWalk(node: ts.Node, namespaces: ReadonlySet<string>): boolean {
  if (!ts.isCallExpression(node)) return false;
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  if (TREE_WALKS.has(calleeName(node))) return true;

  return isKeyRead(node) && namesAModule(node, namespaces);
}

function isKeyRead(call: ts.CallExpression): boolean {
  const callee = unwrap(call.expression);

  if (ts.isIdentifier(callee)) return TYPED_KEY_READS.has(callee.text);
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "Object" &&
    OBJECT_KEY_READS.has(callee.name.text)
  );
}

function namesAModule(call: ts.CallExpression, namespaces: ReadonlySet<string>): boolean {
  const [argument] = call.arguments;
  if (argument === undefined) return false;

  const subject = unwrap(argument);
  return ts.isIdentifier(subject) && namespaces.has(subject.text);
}

function productImportsIn(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isProductSpecifier(statement.moduleSpecifier.text)) continue;

    for (const name of importedNamesOf(statement)) names.add(name);
  }

  return names;
}

function isProductSpecifier(specifier: string): boolean {
  return specifier.startsWith(".") && !TEST_SUPPORT.test(specifier);
}

function importedNamesOf(statement: ts.ImportDeclaration): string[] {
  const clause = statement.importClause;
  if (clause === undefined || clause.isTypeOnly) return [];

  const defaultName = clause.name === undefined ? [] : [clause.name.text];
  const bindings = clause.namedBindings;

  if (bindings === undefined) return defaultName;
  if (ts.isNamespaceImport(bindings)) return [...defaultName, bindings.name.text];

  return [
    ...defaultName,
    ...bindings.elements.flatMap((element) => (element.isTypeOnly ? [] : [element.name.text])),
  ];
}

function moduleNamespacesIn(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  eachNode(sourceFile, (node) => {
    if (ts.isNamespaceImport(node)) names.add(node.name.text);
    if (isNamedDeclaration(node) && isDynamicImport(node.initializer)) names.add(node.name.text);
  });

  return names;
}

function declarationsIn(sourceFile: ts.SourceFile): {
  bindings: Map<string, ts.Node>;
  callables: Map<string, ts.Node>;
} {
  const bindings = new Map<string, ts.Node>();
  const callables = new Map<string, ts.Node>();

  eachNode(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      bindings.set(node.name.text, node);
      callables.set(node.name.text, node);
      return;
    }
    if (!isNamedDeclaration(node)) return;

    bindings.set(node.name.text, node.initializer);
    const value = unwrap(node.initializer);
    if (isFunction(value)) callables.set(node.name.text, value);
  });

  return { bindings, callables };
}

function listConstantsIn(sourceFile: ts.SourceFile): ListConstant[] {
  const constants: ListConstant[] = [];

  eachNode(sourceFile, (node) => {
    if (!isNamedDeclaration(node)) return;

    const members = membersOf(node.initializer);
    if (members.length > 0) constants.push({ name: node.name.text, members });
  });

  return constants;
}

function membersOf(initializer: ts.Expression): ts.Expression[] {
  const node = unwrap(initializer);

  if (ts.isArrayLiteralExpression(node)) return node.elements.filter(ts.isExpression);
  if (ts.isObjectLiteralExpression(node)) return propertyValuesOf(node);
  return [];
}

function propertyValuesOf(node: ts.ObjectLiteralExpression): ts.Expression[] {
  return node.properties.flatMap((property) =>
    ts.isPropertyAssignment(property) ? [property.initializer] : [],
  );
}

// The whole statement, since `expect(walked).toStrictEqual(ROSTER)` names ROSTER outside expect().
function assertionsIn(sourceFile: ts.SourceFile): ts.Node[] {
  const statements = new Set<ts.Node>();

  eachNode(sourceFile, (node) => {
    if (isExpectCall(node)) statements.add(statementHolding(node));
  });

  return [...statements];
}

function isExpectCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "expect"
  );
}

function statementHolding(node: ts.Node): ts.Node {
  let holder = node;
  while (!ts.isExpressionStatement(holder) && !ts.isSourceFile(holder)) holder = holder.parent;

  return holder;
}

function references(root: ts.Node, names: ReadonlySet<string>): boolean {
  return containsNode(root, (node) => ts.isIdentifier(node) && names.has(node.text));
}

function isNamedDeclaration(
  node: ts.Node,
): node is ts.VariableDeclaration & { name: ts.Identifier; initializer: ts.Expression } {
  return (
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined
  );
}

function isFunction(node: ts.Node): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function isDynamicImport(expression: ts.Expression): boolean {
  const node = unwrap(expression);
  return ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword;
}

function calleeName(call: ts.CallExpression): string {
  const callee = unwrap(call.expression);

  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return "";
}

function unwrap(expression: ts.Expression): ts.Expression {
  let node = expression;
  while (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isAwaitExpression(node)
  ) {
    node = node.expression;
  }

  return node;
}

function eachNode(root: ts.Node, visit: (node: ts.Node) => void): void {
  visit(root);
  ts.forEachChild(root, (child) => {
    eachNode(child, visit);
  });
}

function containsNode(root: ts.Node, matches: (node: ts.Node) => boolean): boolean {
  if (matches(root)) return true;

  return ts.forEachChild(root, (child) => containsNode(child, matches) || undefined) ?? false;
}
