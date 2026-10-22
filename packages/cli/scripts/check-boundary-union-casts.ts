import { existsSync } from "fs";
import path from "path";

import ts from "typescript";

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

export const NO_PACKAGE_ROOT = "names a package root that does not exist";
export const NO_PROJECT_CONFIG = "names a project config that does not exist";
export const UNREADABLE_PROJECT_CONFIG = "names a project config TypeScript will not read";
export const NO_OWN_SOURCE = "names a project holding no source file of this package";

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
  if (!existsSync(packageRoot)) throw refusal(NO_PACKAGE_ROOT, packageRoot);

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

  const visit = (node: ts.Node): void => {
    if (ts.isAsExpression(node) && widensIntoGeneratedUnion(node, checker)) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart());
      found.push({
        file: path.relative(packageRoot, file.fileName),
        line: line + 1,
        target: node.type.getText(),
      });
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(file, visit);

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
    GENERATED_DIRS.some((dir) => file.includes(dir.split(path.sep).join("/"))),
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

type OwnedFile = { file: ts.SourceFile; checker: ts.TypeChecker };

function ownedFiles(packageRoot: string, projects: readonly string[]): OwnedFile[] {
  const seen = new Set<string>();

  return projects.flatMap((project) => {
    const program = programFor(packageRoot, project);
    const held = program.getSourceFiles().filter((file) => isOwnSource(packageRoot, file));
    if (held.length === 0) throw refusal(NO_OWN_SOURCE, project);

    const checker = program.getTypeChecker();

    return held.filter((file) => isFirstSighting(file, seen)).map((file) => ({ file, checker }));
  });
}

function programFor(packageRoot: string, project: string): ts.Program {
  const configPath = path.join(packageRoot, project);
  if (!existsSync(configPath)) throw refusal(NO_PROJECT_CONFIG, project);

  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, parseHost(project));
  if (parsed === undefined) throw refusal(UNREADABLE_PROJECT_CONFIG, project);

  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

function parseHost(project: string): ts.ParseConfigFileHost {
  return {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw refusal(
        UNREADABLE_PROJECT_CONFIG,
        `${project} — ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      );
    },
  };
}

function isOwnSource(packageRoot: string, file: ts.SourceFile): boolean {
  if (file.isDeclarationFile) return false;

  const filePath = path.resolve(file.fileName);

  return filePath.startsWith(packageRoot + path.sep) && !filePath.includes("node_modules");
}

function isFirstSighting(file: ts.SourceFile, seen: Set<string>): boolean {
  const key = path.resolve(file.fileName);
  if (seen.has(key)) return false;

  seen.add(key);

  return true;
}

function refusal(problem: string, subject: string): Error {
  return new Error(`${problem}: ${subject}`);
}
