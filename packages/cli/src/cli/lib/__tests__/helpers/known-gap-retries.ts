// Each known gap (`it.fails`, `test.fails`) in a spec and the retry its own options set. A syntax
// tree rather than text, so a comment or a string naming `it.fails` is not a known gap.
import ts from "typescript";

export type KnownGap = {
  /** One-based: the line the call starts on. */
  line: number;
  /** What the call's own options set; `null` when they set none, so the config's applies. */
  retry: number | null;
};

const TEST_FUNCTIONS = ["it", "test"];
const KNOWN_GAP_MODIFIER = "fails";
const RETRY_OPTION = "retry";

/** Refuses a known gap whose form, options or retry it cannot read, rather than guessing. */
export function knownGapsIn(source: string, fileName: string): KnownGap[] {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);

  return knownGapMarkersIn(parsed).map((marker) => readKnownGap(marker, parsed));
}

function knownGapMarkersIn(node: ts.Node): ts.PropertyAccessExpression[] {
  const markers = isKnownGapMarker(node) ? [node] : [];

  ts.forEachChild(node, (child) => {
    markers.push(...knownGapMarkersIn(child));
  });

  return markers;
}

/** `.fails` on a chain rooted at `it` or `test`: `it.fails`, `it.concurrent.fails`, `it.skipIf(x).fails`. */
function isKnownGapMarker(node: ts.Node): node is ts.PropertyAccessExpression {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === KNOWN_GAP_MODIFIER &&
    isRootedAtATestFunction(node.expression)
  );
}

function isRootedAtATestFunction(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) return TEST_FUNCTIONS.includes(expression.text);
  if (ts.isPropertyAccessExpression(expression))
    return isRootedAtATestFunction(expression.expression);
  if (ts.isCallExpression(expression)) return isRootedAtATestFunction(expression.expression);

  return false;
}

function readKnownGap(marker: ts.PropertyAccessExpression, sourceFile: ts.SourceFile): KnownGap {
  const line = lineOf(marker, sourceFile);
  const site = `${sourceFile.fileName}:${String(line)}`;
  const call = marker.parent;

  if (!ts.isCallExpression(call) || call.expression !== marker) {
    throw new Error(`${site} marks a known gap in a form this reader cannot read`);
  }

  return { line, retry: retryIn(call.arguments[1], site) };
}

function lineOf(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/** The second argument is the options object when there is one; a body there means none. */
function retryIn(secondArgument: ts.Expression | undefined, site: string): number | null {
  if (secondArgument === undefined || isFunctionLiteral(secondArgument)) return null;
  if (!ts.isObjectLiteralExpression(secondArgument)) {
    throw new Error(`${site} gives a known gap options this reader cannot read`);
  }

  return retrySetBy(secondArgument, site);
}

function isFunctionLiteral(expression: ts.Expression): boolean {
  return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression);
}

function retrySetBy(options: ts.ObjectLiteralExpression, site: string): number | null {
  if (options.properties.some(ts.isSpreadAssignment)) {
    throw new Error(`${site} spreads options into a known gap, which may carry a retry`);
  }

  const retry = options.properties.find((property) => nameOf(property) === RETRY_OPTION);
  if (retry === undefined) return null;
  if (!ts.isPropertyAssignment(retry) || !ts.isNumericLiteral(retry.initializer)) {
    throw new Error(`${site} gives a known gap a retry this reader cannot evaluate`);
  }

  return Number(retry.initializer.text);
}

function nameOf(property: ts.ObjectLiteralElementLike): string | null {
  const { name } = property;
  if (name === undefined) return null;

  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
}
