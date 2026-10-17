/**
 * Finds every surface in a module that judges kebab-case names. Behavioural: two spellings of the
 * rule share no substring, so each regex literal is probed for what it accepts.
 */
import ts from "typescript";

export const SHARED_PATTERN = "KEBAB_CASE_PATTERN";

/** Identifies a judge, not its correctness: names judges disagree on (`acme-`) are left out. */
const KEBAB_PROBE = {
  accepted: ["acme-skills", "a", "web3-tooling"],
  refused: ["@acme/skills", "Acme-Skills", "acme skills", "acme_skills"],
} as const;

const LITERAL = /^\/(.*)\/([a-z]*)$/s;

// Stripped before probing: `lastIndex` survives calls on a `g`/`y` pattern.
const STATEFUL_FLAGS = /[gy]/g;

/** The shared constant by name, others by spelling; the constant's own declaration is excluded. */
export function kebabCaseJudgesIn(source: string, fileName: string): string[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const judges = new Set<string>();

  eachNode(sourceFile, (node) => {
    const judge = judgeAt(node);
    if (judge !== undefined) judges.add(judge);
  });

  return [...judges];
}

function judgeAt(node: ts.Node): string | undefined {
  if (isSecondSpelling(node)) return node.text;
  if (isSharedPatternUse(node)) return SHARED_PATTERN;

  return undefined;
}

function isSecondSpelling(node: ts.Node): node is ts.RegularExpressionLiteral {
  return (
    ts.isRegularExpressionLiteral(node) && judgesKebabCase(node.text) && !isSharedDeclaration(node)
  );
}

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

/** A pattern that will not rebuild is one this cannot probe, so it is not reported. */
function withoutCursor(literal: string): RegExp | undefined {
  const [, body, flags] = LITERAL.exec(literal) ?? [];
  if (body === undefined || flags === undefined) return undefined;

  try {
    return new RegExp(body, flags.replace(STATEFUL_FLAGS, ""));
  } catch {
    return undefined;
  }
}

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
