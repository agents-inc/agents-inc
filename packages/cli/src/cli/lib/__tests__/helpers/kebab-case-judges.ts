/**
 * Every surface in a module that decides whether a name is kebab-case.
 *
 * The recogniser is BEHAVIOURAL, and it has to be. The shape worth finding is a judge written
 * with its own regex, and two correct spellings of the same rule —
 * `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` and `/^[a-z][a-z0-9-]*$/` — share no substring a scan could
 * key on. A scan looking for the shared constant's NAME sees only the surfaces that already
 * agree, which is the one thing a roster of judges must not be built from.
 *
 * So each pattern is asked what it ACCEPTS. {@link KEBAB_PROBE} is chosen from names every
 * kebab-case judge answers the same way, whatever its spelling, and refused by the neighbouring
 * patterns built from the same character class — an author handle, a content hash, a finding's
 * filename, a shell-safe argument. What the probe deliberately leaves out is every name the
 * judges DISAGREE about: a judge is recognised by the rule it is trying to state, and a probe
 * demanding the right answer to the disagreements would recognise only the surfaces that give it.
 */
import ts from "typescript";

/** The constant every aligned surface reaches for, and whose own declaration judges nothing. */
export const SHARED_PATTERN = "KEBAB_CASE_PATTERN";

/**
 * The names that identify a kebab-case judge, whichever way it is spelled.
 *
 * Not a test of correctness — `acme-` and `acme--skills` are where judges differ and are
 * deliberately absent.
 */
const KEBAB_PROBE = {
  accepted: ["acme-skills", "a", "web3-tooling"],
  refused: ["@acme/skills", "Acme-Skills", "acme skills", "acme_skills"],
} as const;

/** A regex literal's source and flags, which is all `new RegExp` needs to rebuild it. */
const LITERAL = /^\/(.*)\/([a-z]*)$/s;

/**
 * Flags that give a regex a cursor. `lastIndex` survives a call on a `g` or `y` pattern, so
 * probing one in place answers on the order the probes happened to be written in.
 */
const STATEFUL_FLAGS = /[gy]/g;

/**
 * Every kebab-case verdict `source` can reach, named once each and in source order: the shared
 * constant by name, and any other pattern by its own spelling.
 *
 * The shared pattern's own declaration is left out on both counts. It judges nothing — a roster
 * carrying the constant's home names a surface with no caller, and the two halves of one
 * declaration would arrive as two.
 */
export function kebabCaseJudgesIn(source: string, fileName: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const judges = new Set<string>();

  eachNode(sourceFile, (node) => {
    const judge = judgeAt(node);
    if (judge !== undefined) judges.add(judge);
  });

  return [...judges];
}

/** What this node judges a kebab-case name by, if it judges one at all. */
function judgeAt(node: ts.Node): string | undefined {
  if (isSecondSpelling(node)) return node.text;
  if (isSharedPatternUse(node)) return SHARED_PATTERN;

  return undefined;
}

/** A pattern stating the kebab-case rule again rather than reaching for the shared constant. */
function isSecondSpelling(node: ts.Node): node is ts.RegularExpressionLiteral {
  return (
    ts.isRegularExpressionLiteral(node) && judgesKebabCase(node.text) && !isSharedDeclaration(node)
  );
}

/** A reach for the shared constant, as opposed to declaring it or importing it. */
function isSharedPatternUse(node: ts.Node): boolean {
  return (
    ts.isIdentifier(node) &&
    node.text === SHARED_PATTERN &&
    !isDeclarationName(node) &&
    !isImportBinding(node)
  );
}

function judgesKebabCase(literal: string): boolean {
  const pattern = withoutCursor(literal);
  if (pattern === undefined) return false;

  return (
    KEBAB_PROBE.accepted.every((name) => pattern.test(name)) &&
    KEBAB_PROBE.refused.every((name) => !pattern.test(name))
  );
}

/**
 * The literal rebuilt as a stateless regex, or nothing when this reader cannot construct one.
 *
 * A pattern that will not rebuild is one this recogniser cannot probe, and so one it does not
 * claim to see — a fact about the recogniser's reach rather than an error whose cause a function
 * answering with a roster has anywhere to report.
 */
function withoutCursor(literal: string): RegExp | undefined {
  const [, body, flags] = LITERAL.exec(literal) ?? [];
  if (body === undefined || flags === undefined) return undefined;

  try {
    return new RegExp(body, flags.replace(STATEFUL_FLAGS, ""));
  } catch {
    return undefined;
  }
}

/** Whether this regex literal IS the shared pattern rather than a second spelling of it. */
function isSharedDeclaration(node: ts.RegularExpressionLiteral): boolean {
  const { parent } = node;

  return (
    ts.isVariableDeclaration(parent) &&
    ts.isIdentifier(parent.name) &&
    parent.name.text === SHARED_PATTERN
  );
}

function isDeclarationName(node: ts.Identifier): boolean {
  const { parent } = node;

  return ts.isVariableDeclaration(parent) && parent.name === node;
}

function isImportBinding(node: ts.Identifier): boolean {
  const { parent } = node;

  return ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent);
}

function eachNode(root: ts.Node, visit: (node: ts.Node) => void): void {
  visit(root);
  ts.forEachChild(root, (child) => {
    eachNode(child, visit);
  });
}
