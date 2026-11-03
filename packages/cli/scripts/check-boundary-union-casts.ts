import path from "path";

import ts from "typescript";

import { eachNode } from "../src/cli/lib/__tests__/helpers/syntax-tree.js";
import { toPosixPath } from "../src/cli/utils/posix-path.js";

import { ownedFiles } from "./owned-sources.js";

/**
 * Refuses a cast from `string` itself into an all-string-literal union declared under
 * {@link GENERATED_DIRS}, outside {@link PARSE_BOUNDARIES}. Scoped by directory, never by an
 * on-site comment.
 */
const GENERATED_DIRS: readonly string[] = [
  path.join("types", "generated"),
  path.join("vendor", "generated"),
];

/** Package-relative directories whose job is reading unvalidated bytes. */
const PARSE_BOUNDARIES: readonly string[] = [path.join("src", "cli", "lib", "loading")];

export {
  NO_OWN_SOURCE,
  NO_PACKAGE_ROOT,
  NO_PROJECT_CONFIG,
  UNREADABLE_PROJECT_CONFIG,
} from "./owned-sources.js";

export type WideningCast = { file: string; line: number; target: string };

export type CheckResult = { widening: WideningCast[] };

const PROJECTS: readonly string[] = ["tsconfig.json"];

export function check({
  packageRoot,
  projects = PROJECTS,
}: {
  packageRoot: string;
  projects?: readonly string[];
}): CheckResult {
  const widening = ownedFiles(packageRoot, projects).flatMap(({ file, checker }) =>
    wideningCastsIn(file, checker, packageRoot),
  );

  return { widening };
}

function wideningCastsIn(
  file: ts.SourceFile,
  checker: ts.TypeChecker,
  packageRoot: string,
): WideningCast[] {
  if (isParseBoundary(packageRoot, file)) return [];

  const found: WideningCast[] = [];

  eachNode(file, (node) => {
    if (ts.isAsExpression(node) && widensIntoGeneratedUnion(node, checker)) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart());
      found.push({
        file: path.relative(packageRoot, file.fileName),
        line: line + 1,
        target: node.type.getText(),
      });
    }
  });

  return found;
}

/** Cheapest predicate first. */
function widensIntoGeneratedUnion(node: ts.AsExpression, checker: ts.TypeChecker): boolean {
  const target = checker.getTypeFromTypeNode(node.type);
  if (!isStringLiteralUnion(target)) return false;

  const source = checker.getTypeAtLocation(node.expression);
  if ((source.flags & ts.TypeFlags.String) === 0) return false;

  return isGenerated(node.type, checker);
}

function isStringLiteralUnion(type: ts.Type): boolean {
  if (!type.isUnion()) return false;

  return type.types.every((member) => member.isStringLiteral());
}

/**
 * Asked of the type node, not the resolved type's `aliasSymbol`, which TypeScript drops for unions
 * indexed out of a readonly tuple by `number`.
 */
function isGenerated(node: ts.TypeNode, checker: ts.TypeChecker): boolean {
  return declaringFilesOf(node, checker).some((file) =>
    GENERATED_DIRS.some((dir) => file.includes(toPosixPath(dir))),
  );
}

/** An inline union declares nothing; `getAliasedSymbol` follows re-exports to the origin. */
function declaringFilesOf(node: ts.TypeNode, checker: ts.TypeChecker): string[] {
  if (!ts.isTypeReferenceNode(node)) return [];

  const named = checker.getSymbolAtLocation(node.typeName);
  const declared =
    named !== undefined && (named.flags & ts.SymbolFlags.Alias) !== 0
      ? checker.getAliasedSymbol(named)
      : named;

  return (declared?.getDeclarations() ?? []).map(
    (declaration) => declaration.getSourceFile().fileName,
  );
}

function isParseBoundary(packageRoot: string, file: ts.SourceFile): boolean {
  const relative = path.relative(packageRoot, file.fileName);

  return PARSE_BOUNDARIES.some((dir) => relative.startsWith(dir + path.sep));
}
