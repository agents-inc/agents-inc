/**
 * Which sentinel constants name a TOAST, answered by following the product rather than by
 * remembering.
 *
 * A toast lives in an absolutely-positioned row Ink rewrites in place, so a gate that keeps
 * assertions off the processed buffer needs to know which sentinels name one — and every other
 * sentinel names a screen that stays painted, which is what reading the screen is FOR. Nothing
 * about a sentinel says which it is: `STEP_TEXT` is one flat object of strings, and the toasts in
 * it look exactly like the step headings beside them.
 *
 * So the question is asked of the store. **The toast surface is one field and its setter** —
 * `toastMessage`, and `setToastMessage` — and a third way to paint a toast would be a new
 * mechanism rather than a new member, which is what makes this a definition and not a roster
 * somebody has to maintain:
 *
 * ```
 * grep -rn -P 'toastMessage' src/cli --include='*.ts' --include='*.tsx'
 * ```
 *
 * A sentinel names a toast when its message is EXACTLY one the product paints. Containment was
 * tried and is unusable: `SCOPE` — the build step's footer hotkey label — is a substring of
 * `Scope toggle unavailable in global context`, so a reader matching on containment bans reading
 * the screen for a step heading. The cost is that a sentinel written as a FRAGMENT of a toast is
 * invisible here, and {@link PaintedToasts.unresolved} is the other residue: a toast composed at
 * its call site cannot be resolved to a string by any reader of source text. Both are reported
 * rather than swallowed, because a scan that silently sees less than it claims reads exactly like
 * a clean one.
 */
import ts from "typescript";

/** One module's text, paired with the path a reader should name it by. */
export type SourceModule = {
  /** Path relative to the package root. */
  file: string;
  source: string;
};

/** What the product paints, and what it paints that cannot be read off the source. */
export type PaintedToasts = {
  /** Every message reaching the toast row, in source order and named once each. */
  messages: string[];
  /** Every toast expression that resolves to no fixed string, as `file: expression`. */
  unresolved: string[];
};

/** The whole toast surface: the store field the row is drawn from, and the setter for it. */
const TOAST_FIELD = "toastMessage";
const TOAST_SETTER = "setToastMessage";

/**
 * What one expression in a toast position turns out to be. `cleared` is the third answer and the
 * reason this is a union rather than `string | undefined`: `setToastMessage(null)` takes the row
 * down, which is neither a message nor something the reader failed to read.
 */
type ToastValue =
  | { kind: "message"; text: string }
  | { kind: "cleared" }
  | { kind: "unreadable"; expression: string };

/** One expression in a toast position, and the file it was written in. */
type ToastSite = {
  file: string;
  value: ToastValue;
};

export function paintedToastsIn(modules: readonly SourceModule[]): PaintedToasts {
  const constants = constantStringsIn(modules);
  const sites = modules.flatMap((module) => toastSitesIn(module, constants));

  return {
    messages: [...new Set(sites.flatMap(messageOf))],
    unresolved: sites.flatMap(unreadableIn),
  };
}

/**
 * Which members of `constantName` in `sentinels` name a message `product` paints as a toast, in
 * the order the constant declares them.
 *
 * An empty answer is a legitimate return rather than a throw — a renamed constant, a moved file
 * and a product that paints nothing all arrive here the same way, and which of them happened is
 * a question for the caller's own guard rather than for a reader of one file.
 */
export function toastKeysIn(
  sentinels: SourceModule,
  constantName: string,
  product: readonly SourceModule[],
): { keys: string[]; unresolved: string[] } {
  const { messages, unresolved } = paintedToastsIn(product);
  const painted = new Set(messages);

  const keys = constantMembersIn(sentinels, constantName)
    .filter(([, message]) => painted.has(message))
    .map(([key]) => key);

  return { keys, unresolved };
}

function messageOf({ value }: ToastSite): string[] {
  return value.kind === "message" ? [value.text] : [];
}

function unreadableIn({ file, value }: ToastSite): string[] {
  return value.kind === "unreadable" ? [`${file}: ${value.expression}`] : [];
}

/** Every expression this module puts in a toast position, resolved as far as the source allows. */
function toastSitesIn(module: SourceModule, constants: ReadonlyMap<string, string>): ToastSite[] {
  const sourceFile = parse(module);
  const sites: ToastSite[] = [];

  eachNode(sourceFile, (node) => {
    const painted = paintedBy(node);
    if (painted !== undefined) {
      sites.push({ file: module.file, value: resolve(painted, sourceFile, constants) });
    }
  });

  return sites;
}

/** The expression a node hands the toast row, if it hands it one at all. */
function paintedBy(node: ts.Node): ts.Expression | undefined {
  if (ts.isCallExpression(node) && calleeName(node) === TOAST_SETTER) return node.arguments[0];
  if (ts.isPropertyAssignment(node) && memberName(node) === TOAST_FIELD) return node.initializer;

  return undefined;
}

function resolve(
  expression: ts.Expression,
  sourceFile: ts.SourceFile,
  constants: ReadonlyMap<string, string>,
): ToastValue {
  const node = unwrap(expression);

  if (ts.isStringLiteral(node)) return { kind: "message", text: node.text };
  if (node.kind === ts.SyntaxKind.NullKeyword) return { kind: "cleared" };

  const named = ts.isPropertyAccessExpression(node)
    ? constants.get(`${node.expression.getText(sourceFile)}.${node.name.text}`)
    : undefined;

  return named === undefined
    ? { kind: "unreadable", expression: node.getText(sourceFile) }
    : { kind: "message", text: named };
}

/** Every `OBJECT.MEMBER` in these modules that holds a fixed string, keyed by how it is written. */
function constantStringsIn(modules: readonly SourceModule[]): Map<string, string> {
  const strings = new Map<string, string>();

  for (const module of modules) {
    eachNode(parse(module), (node) => {
      if (!isNamedDeclaration(node)) return;

      for (const [key, value] of stringMembersOf(node.initializer)) {
        strings.set(`${node.name.text}.${key}`, value);
      }
    });
  }

  return strings;
}

/** The string members of one named constant object in this module, in declaration order. */
function constantMembersIn(module: SourceModule, constantName: string): [string, string][] {
  const members: [string, string][] = [];

  eachNode(parse(module), (node) => {
    if (isNamedDeclaration(node) && node.name.text === constantName) {
      members.push(...stringMembersOf(node.initializer));
    }
  });

  return members;
}

function stringMembersOf(initializer: ts.Expression): [string, string][] {
  const node = unwrap(initializer);
  if (!ts.isObjectLiteralExpression(node)) return [];

  return node.properties.flatMap((property): [string, string][] => {
    const key = memberName(property);
    if (key === undefined || !ts.isPropertyAssignment(property)) return [];

    const value = unwrap(property.initializer);
    return ts.isStringLiteral(value) ? [[key, value.text]] : [];
  });
}

/** A variable declaration bound to a plain name and given a value — the only shape read here. */
function isNamedDeclaration(
  node: ts.Node,
): node is ts.VariableDeclaration & { name: ts.Identifier; initializer: ts.Expression } {
  return (
    ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined
  );
}

function memberName(property: ts.ObjectLiteralElementLike): string | undefined {
  const name = property.name;
  if (name === undefined) return undefined;

  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/** The rightmost name of a callee, which is the one that says what the call does. */
function calleeName(call: ts.CallExpression): string {
  const callee = unwrap(call.expression);

  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return "";
}

/** The expression under whatever an author wrapped it in — a cast, a `satisfies`, a paren. */
function unwrap(expression: ts.Expression): ts.Expression {
  let node = expression;
  while (
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isParenthesizedExpression(node)
  ) {
    node = node.expression;
  }

  return node;
}

function parse(module: SourceModule): ts.SourceFile {
  return ts.createSourceFile(module.file, module.source, ts.ScriptTarget.Latest, true);
}

function eachNode(root: ts.Node, visit: (node: ts.Node) => void): void {
  visit(root);
  ts.forEachChild(root, (child) => {
    eachNode(child, visit);
  });
}
