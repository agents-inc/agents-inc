/**
 * Refuses an `@link` citation in this package's TypeScript that the type checker cannot resolve.
 * Line comments and generated `.d.ts` files are out of reach; {@link PROJECTS} bounds the walk.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";
import { z } from "zod";

import { type OwnedFile, ownedFiles, refusal } from "./owned-sources.js";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const MANIFEST = "package.json";
const TYPECHECK_SCRIPT = "typecheck";

/** What `tsc` reads when no `-p` is given. */
export const DEFAULT_PROJECT = "tsconfig.json";

export {
  NO_OWN_SOURCE,
  NO_PACKAGE_ROOT,
  NO_PROJECT_CONFIG,
  UNREADABLE_PROJECT_CONFIG,
} from "./owned-sources.js";
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
