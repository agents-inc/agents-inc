/**
 * Refuses an `@link` citation in this package's TypeScript that the type checker cannot resolve.
 * Line comments and generated `.d.ts` files are out of reach; {@link PROJECTS} bounds the walk.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";
import { z } from "zod";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const MANIFEST = "package.json";
const TYPECHECK_SCRIPT = "typecheck";

/** What `tsc` reads when no `-p` is given. */
export const DEFAULT_PROJECT = "tsconfig.json";

export const NO_PACKAGE_ROOT = "names a package root that does not exist";
export const NO_PROJECT_CONFIG = "names a project config that does not exist";
export const UNREADABLE_PROJECT_CONFIG = "names a project config TypeScript will not read";
export const NO_OWN_SOURCE = "names a project holding no source file of this package";
export const NO_MANIFEST = "names a package root holding no package.json";
export const NO_TYPECHECK_SCRIPT = "names a manifest with no typecheck script";
export const NO_TSC_INVOCATION = "names a typecheck script that runs no tsc";
export const NO_PROJECT_AFTER_FLAG = "names a tsc invocation whose -p is followed by nothing";

const ManifestSchema = z.object({
  scripts: z.record(z.string(), z.string()).exactOptional(),
});

export type Citation = { file: string; line: number; cited: string };

/**
 * `examined` and `citing` tell a clean tree from an unread one; `citing` holds the top-level
 * directory of every file that made a citation.
 */
export type CheckResult = {
  clean: boolean;
  examined: number;
  citing: string[];
  unresolved: Citation[];
};

/** Written out, not derived, so the suite can hold it against {@link typecheckedProjects}. */
export const PROJECTS: readonly string[] = [
  DEFAULT_PROJECT,
  "tsconfig.scripts.json",
  "e2e/tsconfig.json",
];

export function check({
  packageRoot = PACKAGE_ROOT,
  projects = PROJECTS,
}: {
  packageRoot?: string | undefined;
  projects?: readonly string[] | undefined;
} = {}): CheckResult {
  if (!existsSync(packageRoot)) throw refusal(NO_PACKAGE_ROOT, packageRoot);

  const judged = ownedFiles(packageRoot, projects).flatMap((owned) =>
    citationsIn(owned, packageRoot),
  );
  const unresolved = judged.filter(landsNowhere).map(citationOf);

  return {
    clean: unresolved.length === 0,
    examined: judged.length,
    citing: treesCiting(judged.map(citationOf)),
    unresolved,
  };
}

function treesCiting(citations: Citation[]): string[] {
  return [...new Set(citations.map((citation) => citation.file.split(path.sep)[0]))]
    .filter(isNamed)
    .sort();
}

export function typecheckedProjects({
  packageRoot = PACKAGE_ROOT,
}: { packageRoot?: string | undefined } = {}): string[] {
  const manifestPath = path.join(packageRoot, MANIFEST);
  if (!existsSync(manifestPath)) throw refusal(NO_MANIFEST, packageRoot);

  const script = typecheckScript(manifestPath);
  const projects = script.split("&&").map(projectOf).filter(isNamed);
  if (projects.length === 0) throw refusal(NO_TSC_INVOCATION, script);

  return projects;
}

function typecheckScript(manifestPath: string): string {
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const script = ManifestSchema.parse(manifest).scripts?.[TYPECHECK_SCRIPT];
  if (script === undefined) throw refusal(NO_TYPECHECK_SCRIPT, manifestPath);

  return script;
}

/** A bare `tsc` reads {@link DEFAULT_PROJECT}; a `-p` with nothing after it is refused. */
function projectOf(command: string): string | undefined {
  const words = command.trim().split(/\s+/);
  if (words[0] !== "tsc") return undefined;

  const flag = words.indexOf("-p");
  if (flag === -1) return DEFAULT_PROJECT;

  const named = words[flag + 1];
  if (named === undefined) throw refusal(NO_PROJECT_AFTER_FLAG, command);

  return named;
}

function isNamed(value: string | undefined): value is string {
  return value !== undefined;
}

type OwnedFile = { file: ts.SourceFile; checker: ts.TypeChecker };

/**
 * Each file is judged once, since the projects overlap. The emptiness guard is per project so the
 * roster's order cannot decide a pass.
 */
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

/** `getParsedCommandLineOfConfigFile` takes a diagnostics reporter, so a bad config refuses. */
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
  const filePath = path.resolve(file.fileName);
  if (seen.has(filePath)) return false;
  seen.add(filePath);

  return true;
}

type JudgedCitation = { citation: Citation; resolves: boolean };

function citationsIn({ file, checker }: OwnedFile, packageRoot: string): JudgedCitation[] {
  return linksIn(file).map((link) => ({
    citation: addressOf(link, file, packageRoot),
    resolves: resolvesToASymbol(link, checker),
  }));
}

function landsNowhere(judged: JudgedCitation): boolean {
  return !judged.resolves;
}

function citationOf(judged: JudgedCitation): Citation {
  return judged.citation;
}

function addressOf(link: Link, file: ts.SourceFile, packageRoot: string): Citation {
  return {
    file: path.relative(packageRoot, path.resolve(file.fileName)),
    line: file.getLineAndCharacterOfPosition(link.getStart(file)).line + 1,
    cited: citedText(link, file),
  };
}

/** Every spelling, so a comment cannot escape the rule by choosing one. */
type Link = ts.JSDocLink | ts.JSDocLinkCode | ts.JSDocLinkPlain;

function isLink(node: ts.Node): node is Link {
  return ts.isJSDocLink(node) || ts.isJSDocLinkCode(node) || ts.isJSDocLinkPlain(node);
}

/** `getChildren`, not `ts.forEachChild`, which never descends into JSDoc. */
function linksIn(file: ts.SourceFile): Link[] {
  const collect = (node: ts.Node): Link[] =>
    isLink(node) ? [node] : node.getChildren(file).flatMap(collect);

  return collect(file);
}

/** A module path or `import(...)` namepath parses to no name, so it resolves to nothing. */
function resolvesToASymbol(link: Link, checker: ts.TypeChecker): boolean {
  return link.name !== undefined && checker.getSymbolAtLocation(link.name) !== undefined;
}

function citedText(link: Link, file: ts.SourceFile): string {
  const name = link.name === undefined ? "" : link.name.getText(file);

  return `${name}${link.text}`.trim();
}

function refusal(problem: string, subject: string): Error {
  return new Error(`${problem}: ${subject}`);
}
