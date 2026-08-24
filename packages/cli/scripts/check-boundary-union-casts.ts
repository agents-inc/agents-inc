import { existsSync } from "fs";
import path from "path";

import ts from "typescript";

/**
 * Refuses a cast that widens a boundary `string` straight into a generated union.
 *
 * `packages/cli/CLAUDE.md` bans casting a valid union member (`as SkillId`) and permits a cast
 * only at a parse boundary. A grep cannot tell the two apart — `as SkillId` reads identically
 * whether the subject is a literal the type system already knows or a `path.basename(...)` the
 * filesystem just handed us, and the second is the shape the rule names outright. A previous lane
 * judged this ungreppable and was right about a grep; it is three exact predicates to the compiler.
 *
 * **The predicates, all three required:**
 *
 * 1. the SOURCE type is `string` itself — `TypeFlags.String`, not a literal, so a cast between two
 *    known members is not the subject here;
 * 2. the TARGET is a union whose every member is a string literal;
 * 3. the target's declaration lives under {@link GENERATED_DIR}.
 *
 * **Scoped by DIRECTORY and never by an on-site comment.** A gate a comment can satisfy is one the
 * next author silences instead of answering, and this repository already has that failure on
 * record. {@link PARSE_BOUNDARIES} names the directories where reading an unvalidated string IS the
 * job; everything else must narrow through a guard rather than assert.
 */
export const GENERATED_DIR = path.join("types", "generated");

/**
 * Directories where a `string` arriving from outside the type system is the whole point.
 *
 * A parse boundary reads bytes nobody typed — JSON, YAML, argv — so the cast there is the moment a
 * value ENTERS the union rather than a claim about one already inside it. Kept as directories
 * because the exemption is a property of what a module is for, and a per-site marker would let any
 * module claim it.
 */
export const PARSE_BOUNDARIES: readonly string[] = [path.join("src", "cli", "lib", "loading")];

export const NO_PACKAGE_ROOT = "names a package root that does not exist";
export const NO_PROJECT_CONFIG = "names a project config that does not exist";
export const UNREADABLE_PROJECT_CONFIG = "names a project config TypeScript will not read";
export const NO_OWN_SOURCE = "names a project holding no source file of this package";

/** One cast the rule refuses, at the place a reader has to go and change. */
export type WideningCast = { file: string; line: number; target: string };

export type CheckResult = { widening: WideningCast[] };

export const PROJECTS: readonly string[] = ["tsconfig.json"];

/** Every widening cast the given projects hold, outside the parse boundaries. */
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

/** All three predicates, in the order that costs least to answer. */
function widensIntoGeneratedUnion(node: ts.AsExpression, checker: ts.TypeChecker): boolean {
  const target = checker.getTypeFromTypeNode(node.type);
  if (!isStringLiteralUnion(target)) return false;

  const source = checker.getTypeAtLocation(node.expression);
  if ((source.flags & ts.TypeFlags.String) === 0) return false;

  return isGenerated(target);
}

function isStringLiteralUnion(type: ts.Type): boolean {
  if (!type.isUnion()) return false;

  return type.types.every((member) => member.isStringLiteral());
}

/** Where the union was declared, which is what makes it OURS rather than a library's. */
function isGenerated(type: ts.Type): boolean {
  const declarations = type.aliasSymbol?.getDeclarations() ?? [];

  return declarations.some((declaration) =>
    declaration.getSourceFile().fileName.includes(GENERATED_DIR.split(path.sep).join("/")),
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
