/**
 * The roster of PRODUCERS a spec compares, and whether the file derives that roster from the
 * tree or remembers it.
 *
 * A spec whose subject is agreement between several code paths is green by construction: it
 * compares the paths its author gathered, so the one nobody gathered is invisible — which is
 * exactly the recurrence such a spec is written against. The fix is always the same shape, and
 * this reader is what lets a gate ask for it: the roster's MEMBERSHIP is held against a walk of
 * the tree, so a path written tomorrow reddens the file until its author has judged it.
 *
 * **A roster of CALLABLES is the shape this reads, and it is the whole of what it claims.** A
 * roster whose members are functions reaching product code is a roster of code paths and cannot
 * be anything else — test data has no behaviour. Every broader recogniser tried against this
 * tree condemned test data as well: a roster of file paths, of exported symbol names or of any
 * subset of an enumeration the tree declares is indistinguishable, in syntax, from the inputs a
 * spec is parameterised by. `producer-rosters.test.ts` carries those shapes as fixtures.
 *
 * Source text rather than a type checker, so the shapes it refuses can be planted in a fixture:
 * a scan whose only input is a tree with nothing wrong in it has never been shown to report
 * anything.
 */
import ts from "typescript";

/** One roster of producers, and the verdict on how its membership is decided. */
export type ProducerRoster = {
  /** The constant's name, as the file spells it. */
  name: string;
  /** Whether the file holds this roster's membership against a walk of the tree. */
  derived: boolean;
};

/**
 * The smallest roster that can name a disagreement. One producer agrees with itself for free,
 * so a roster of one carries no claim for a second member to fall out of.
 */
const MIN_PRODUCERS = 2;

/**
 * Path segments that mark a module as test support rather than product. A roster of factory or
 * fixture wrappers is machinery for a spec rather than a set of shipped code paths, and the
 * disagreement this reader exists against is between things a user can reach.
 */
const TEST_SUPPORT = /(^|\/)(__tests__|__mocks__|fixtures|factories|helpers|mock-|test-)/;

/**
 * How a file reads a whole directory. Matched on the rightmost name of the callee, so `fg(...)`,
 * `fg.sync(...)` and `fs.readdir(...)` are one rule rather than three.
 */
const TREE_WALKS = new Set(["fg", "glob", "globSync", "readdir", "readdirSync"]);

/**
 * How a file reads a module's export list. Every one of them also reads an ordinary object, so
 * the ARGUMENT is what decides it — `Object.keys(ROSTER)` builds an expectation out of the
 * roster, which is what makes a spec vacuous rather than what fixes it.
 */
const OBJECT_KEY_READS = new Set(["keys", "values", "entries", "getOwnPropertyNames"]);
const TYPED_KEY_READS = new Set(["typedKeys", "typedValues", "typedEntries"]);

/** What a file declares, read once so every question below is a lookup rather than a walk. */
type SpecIndex = {
  /** Identifiers this file introduced from a module that ships. */
  productImports: ReadonlySet<string>;
  /** Identifiers bound to a whole module, which is the only thing a key read can enumerate. */
  namespaces: ReadonlySet<string>;
  /** Every name the file declares, and the node a reader has to look inside to follow it. */
  bindings: ReadonlyMap<string, ts.Node>;
  /** The subset of {@link SpecIndex.bindings} that can be called. */
  callables: ReadonlyMap<string, ts.Node>;
  /** Every statement that makes an assertion, which is where membership is decided. */
  assertions: readonly ts.Node[];
};

/** A named constant whose initialiser is a list, before anything has judged what it holds. */
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

/** Whether every member of this list is a code path rather than an input. */
function isProducerRoster({ members }: ListConstant, index: SpecIndex): boolean {
  return members.length >= MIN_PRODUCERS && members.every((member) => isProducer(member, index));
}

/**
 * Whether the file compares this roster's membership against something it read off the tree.
 *
 * Both halves follow the file's own bindings, and for the same reason: a comparison routinely
 * names a PROJECTION of the roster rather than the roster — `expect(walk).toStrictEqual(SITES)`,
 * where `SITES` was mapped off it — so a half that asked the assertion for a literal mention
 * condemned files whose walk is right there.
 *
 * The tree half's visited set is seeded with the roster's own name, and re-seeded for each
 * assertion: a roster reached through itself is the vacuous shape rather than the derivation,
 * and one assertion's trail must not decide the next one's. The roster half is seeded empty —
 * it is looking FOR that name, and stops on it rather than following through it.
 */
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

/** Whether this expression reaches the tree, following the file's own bindings to get there. */
function reachesTheTree(root: ts.Node, index: SpecIndex, followed: Set<string>): boolean {
  return reachesThroughBindings(root, index, followed, (node) => isWalk(node, index.namespaces));
}

/** Whether this expression names the roster, following the file's own bindings to get there. */
function namesTheRoster(root: ts.Node, index: SpecIndex, name: string): boolean {
  return reachesThroughBindings(
    root,
    index,
    new Set(),
    (node) => ts.isIdentifier(node) && node.text === name,
  );
}

/**
 * Whether anything under `root` matches, following the file's own bindings to get there.
 *
 * Nothing a roster spec is asked about sits inside the assertion it is asked about. Every derived
 * roster in this repository reaches its walk through a local — a helper returning a glob's result,
 * or a variable holding one — and the roster the walk is compared to arrives through one just as
 * often, so a reader looking only inside the assertion would condemn all of them.
 *
 * `followed` is shared across one traversal so a trail cannot loop, and is the caller's to seed:
 * a name in it is one this question is not allowed to answer through.
 */
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

/** Whether this node reads the tree: a directory walk, a module's export list, or an import. */
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

/** Every identifier this file introduced from a module that ships. */
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

/** Every value name one import statement binds. Type-only bindings are erased and bind none. */
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

/** Every identifier bound to a whole module, which is the only thing a key read can enumerate. */
function moduleNamespacesIn(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  eachNode(sourceFile, (node) => {
    if (ts.isNamespaceImport(node)) names.add(node.name.text);
    if (isNamedDeclaration(node) && isDynamicImport(node.initializer)) names.add(node.name.text);
  });

  return names;
}

/** Every name the file declares, and the subset of them that can be called. */
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

/** Every named constant whose initialiser is a list, paired with what that list holds. */
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

/**
 * Every statement that makes an assertion.
 *
 * The STATEMENT rather than the `expect` call, because a derivation is routinely the other
 * operand of the comparison and sits outside the call — `expect(walked).toStrictEqual(ROSTER)`
 * names the roster nowhere inside `expect(...)`.
 */
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

/** A variable declaration bound to a plain name and given a value — the only shape read here. */
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

/** The rightmost name of a callee, which is the one that says what the call does. */
function calleeName(call: ts.CallExpression): string {
  const callee = unwrap(call.expression);

  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return "";
}

/** The expression under whatever an author wrapped it in — a cast, a `satisfies`, an `await`. */
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

/** Whether any node under `root` matches, stopping at the first that does. */
function containsNode(root: ts.Node, matches: (node: ts.Node) => boolean): boolean {
  if (matches(root)) return true;

  return ts.forEachChild(root, (child) => containsNode(child, matches) || undefined) ?? false;
}
