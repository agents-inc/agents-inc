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
 * 3. the union names a declaration under one of {@link GENERATED_DIRS}.
 *
 * **Scoped by DIRECTORY and never by an on-site comment.** A gate a comment can satisfy is one the
 * next author silences instead of answering, and this repository already has that failure on
 * record. {@link PARSE_BOUNDARIES} names the directories where reading an unvalidated string IS the
 * job; everything else must narrow through a guard rather than assert.
 *
 * **Two homes, one union.** `src/cli/types/generated/` is where these are generated;
 * `scripts/generate-matrix-package.ts` copies that file byte-for-byte to
 * `packages/matrix/src/vendor/generated/`, which is the declaration every other workspace resolves
 * to. Same unions, so the same ban — which is why the homes are a LIST rather than a parameter each
 * invocation supplies. Scoping them per package would let a cast into the vendored copy pass inside
 * `packages/cli`, and a cast into the original pass everywhere else.
 */
export const GENERATED_DIRS: readonly string[] = [
  path.join("types", "generated"),
  path.join("vendor", "generated"),
];

/**
 * Directories where a `string` arriving from outside the type system is the whole point.
 *
 * A parse boundary reads bytes nobody typed — JSON, YAML, argv — so the cast there is the moment a
 * value ENTERS the union rather than a claim about one already inside it. Kept as directories
 * because the exemption is a property of what a module is for, and a per-site marker would let any
 * module claim it.
 *
 * Package-RELATIVE, and this list names only the CLI's. A second package earns an entry here by
 * having a directory whose job is reading unvalidated bytes, not by holding a module that does some
 * of that among other work — `@workspace/compile`'s seed decode is the live example, and it sits in
 * a backlog rather than here for exactly that reason.
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

  return isGenerated(node.type, checker);
}

function isStringLiteralUnion(type: ts.Type): boolean {
  if (!type.isUnion()) return false;

  return type.types.every((member) => member.isStringLiteral());
}

/**
 * Where the union was declared, which is what makes it OURS rather than a library's.
 *
 * Asked of the type NODE rather than of the resolved type's `aliasSymbol`, because TypeScript keeps
 * that alias for only some of the shapes `source-types.ts` generates. Every union there is an index
 * into a generated table, and the two index forms do not behave alike: indexing by a union key —
 * `SkillId = (typeof SKILL_MAP)[SkillSlug]` — keeps its `aliasSymbol`, while indexing a `readonly`
 * tuple by `number` — `Category`, `Domain`, `AgentName`, and `SkillSlug` itself — resolves straight
 * to the member union carrying no `aliasSymbol` at all. Asking the type could not tell a union
 * declared somewhere else from a union whose alias the compiler had dropped, so this predicate
 * answered `false` for both and the gate judged `SkillId` and nothing else. The node's own symbol
 * always names the alias the author wrote.
 */
function isGenerated(node: ts.TypeNode, checker: ts.TypeChecker): boolean {
  return declaringFilesOf(node, checker).some((file) =>
    GENERATED_DIRS.some((dir) => file.includes(dir.split(path.sep).join("/"))),
  );
}

/**
 * The files declaring the type this node NAMES, with the import chain followed to the end.
 *
 * An inline union — `as "a" | "b"` — names nothing and so declares nothing, which is the right
 * answer: the ban is about a union this repository generates, and one written at the cast site is
 * not that. `getAliasedSymbol` is what carries a re-export chain to its origin, which is the only
 * reason a cast inside `@workspace/compile` resolves to the vendored copy rather than stopping at
 * the barrel that re-exported it.
 */
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
