/**
 * Every `@link` citation in this package's TypeScript resolves to a symbol the compiler can find.
 *
 * `documentation-bible.md` -> "in a source comment, `@link` is the citation and a backtick is
 * prose" is the rule: a citation asks an editor to jump to a declaration, a backticked name asks
 * for nothing. Nothing enforced it. Verified 2026-08-21 by injecting one unresolvable citation into
 * an e2e spec — `bun run typecheck` and `bun run lint` both passed over it in silence — and nine
 * had accumulated by the time anyone counted.
 *
 * **The instrument is the type checker, not a scanner, and that distinction is the whole ruling.**
 * A text scan over backticked names is the class that provably cannot work here: the house style
 * explains what was REMOVED, so its best prose names symbols nothing declares, and such a scan is
 * permanently red on correct writing. This walks every `JSDocLink` node and asks
 * `checker.getSymbolAtLocation` — the same symbol table an editor answers Go-to-Definition from —
 * so a citation is judged by whether the jump it promises actually lands.
 *
 * The rejected alternative was `jsdoc/no-undefined-types` from `eslint-plugin-jsdoc`. It reads
 * ESLint's scope rather than the type graph, where a class member is not a binding, so it reports a
 * sibling-member citation that `tsc` resolves — and it misses the `import(...)` namepath forms
 * outright.
 *
 * **Backticks around a citation do not make it prose, and this file is where that is easiest to
 * meet.** The JSDoc parser does not read backticks, so a citation written inside them is a citation
 * — which is why nothing below spells one out, and why the census command lives in
 * `documentation-bible.md` rather than here. Writing a citation to illustrate the rule is how a
 * document about the rule fails it.
 *
 * **What it does not reach, stated so a green run is not read as wider than it is.**
 *
 *   - A citation inside a `//` line comment. TypeScript parses JSDoc out of block comments alone,
 *     so a line comment holds no `JSDocLink` node and this walk cannot see one. Neither can an
 *     editor, which is why it is a limit rather than a false negative — but this walk and the
 *     fixed-string census in `documentation-bible.md` will disagree by exactly those, and the grep
 *     is not the one that is wrong.
 *   - Any workspace but this one. {@link PROJECTS} is this package's three tsconfig projects; the
 *     rest of the monorepo holds a handful of citations and none of its programs is built here.
 *     Widen the census in `documentation-bible.md` past `packages/cli` before assuming that is
 *     still a handful.
 *   - `.d.ts` files, which are generated here — `apps/server/worker-configuration.d.ts` alone
 *     carries more citations than this package's whole source does, and none of them is anybody's
 *     to fix.
 *
 * Nothing runs at module scope — the suite beside it is the enforcement, as with
 * `check-screen-sentinels.ts` and `check-finding-citations.ts`, and the package root is a parameter
 * so it can be driven against a fixture tree.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";
import { z } from "zod";

/** Where the check reads from when no other root is given. */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const MANIFEST = "package.json";
const TYPECHECK_SCRIPT = "typecheck";

/** What `tsc` reads when an invocation names no project, and the default this package relies on. */
export const DEFAULT_PROJECT = "tsconfig.json";

export const NO_PACKAGE_ROOT = "names a package root that does not exist";
export const NO_PROJECT_CONFIG = "names a project config that does not exist";
export const UNREADABLE_PROJECT_CONFIG = "names a project config TypeScript will not read";
export const NO_OWN_SOURCE = "names a project holding no source file of this package";
export const NO_MANIFEST = "names a package root holding no package.json";
export const NO_TYPECHECK_SCRIPT = "names a manifest with no typecheck script";
export const NO_TSC_INVOCATION = "names a typecheck script that runs no tsc";
export const NO_PROJECT_AFTER_FLAG = "names a tsc invocation whose -p is followed by nothing";

/** Read at a parse boundary, so a manifest that has stopped holding scripts refuses rather than reads empty. */
const ManifestSchema = z.object({
  scripts: z.record(z.string(), z.string()).exactOptional(),
});

/** One citation as written, addressed so the failure names the line to repair. */
export type Citation = { file: string; line: number; cited: string };

/**
 * `examined` is how many citations the walk actually judged, resolving or not, and it exists
 * because `unresolved: []` is the same answer whether every citation resolved or the walk read
 * nothing at all. A program built from a config whose `include` has stopped matching, a walk that
 * has stopped recognising a node kind, and a clean tree all report the same empty list; only a
 * count of what was judged tells them apart.
 *
 * `citing` is that question asked per TREE, and it is the one a caller can assert on: a count says
 * something changed, a roster says which tree stopped being read. It holds the first path segment
 * of every file that made at least one citation — so a project silently dropped from the roster, or
 * an `include` that has narrowed, takes its whole tree out of this list rather than shaving a
 * number nobody was watching.
 */
export type CheckResult = {
  clean: boolean;
  examined: number;
  citing: string[];
  unresolved: Citation[];
};

/**
 * The three projects `tsc` is run over, which is what `package.json`'s `typecheck` script names.
 *
 * Written out rather than derived, for the reason {@link check} is held against
 * {@link typecheckedProjects} in its suite: a roster derived from the thing it is meant to check
 * agrees with it for free. A project added to `typecheck` and not here is a tree this walk stops
 * reaching, and the comparison is what says so.
 */
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

/** The distinct top-level directories the citations came from, sorted so the roster is stable. */
function treesCiting(citations: Citation[]): string[] {
  return [...new Set(citations.map((citation) => citation.file.split(path.sep)[0]))]
    .filter(isNamed)
    .sort();
}

/**
 * Every project `package.json`'s `typecheck` script runs `tsc` over, read from the manifest.
 *
 * {@link PROJECTS} is hand-written, so nothing in it can tell that a fourth project has arrived and
 * that this walk now covers three quarters of the tree it claims. This is the independent authority
 * that can, and the suite compares the two.
 */
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

/**
 * The `typecheck` script's text, refused rather than read as absent when the manifest has none — a
 * roster derived from a script nobody runs is a roster with no authority behind it.
 */
function typecheckScript(manifestPath: string): string {
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const script = ManifestSchema.parse(manifest).scripts?.[TYPECHECK_SCRIPT];
  if (script === undefined) throw refusal(NO_TYPECHECK_SCRIPT, manifestPath);

  return script;
}

/**
 * The project one `&&`-separated command reads, or nothing where the command is not `tsc`.
 *
 * A bare `tsc --noEmit` names no project and reads {@link DEFAULT_PROJECT}, which is exactly how
 * this package's own script spells its first invocation — so treating "no `-p`" as "no project"
 * would drop `src/` from the roster while reporting three of the four commands as understood.
 *
 * A `-p` with nothing after it is refused rather than skipped, for the inverse reason: a skip is
 * how a roster narrows without anybody noticing, and a narrower roster reports a cleaner tree.
 */
function projectOf(command: string): string | undefined {
  const words = command.trim().split(/\s+/);
  if (words[0] !== "tsc") return undefined;

  const flag = words.indexOf("-p");
  if (flag === -1) return DEFAULT_PROJECT;

  const named = words[flag + 1];
  if (named === undefined) throw refusal(NO_PROJECT_AFTER_FLAG, command);

  return named;
}

/** Reads a `string | undefined` as present, which both indexed reads above can produce. */
function isNamed(value: string | undefined): value is string {
  return value !== undefined;
}

/** A source file paired with the checker of the project that answers for it. */
type OwnedFile = { file: ts.SourceFile; checker: ts.TypeChecker };

/**
 * Every file of this package the projects hold, each judged once.
 *
 * The projects overlap on purpose — `e2e/tsconfig.json` includes `../src/**` so a spec and the
 * product it drives share one program — so a file two of them hold would otherwise be reported
 * twice for one repair. The first project to hold it answers for it, and all three carry the same
 * options, so which one that is cannot change a verdict.
 *
 * The emptiness guard is per PROJECT and asks what a program holds rather than what it contributes
 * new, deliberately: a guard on the new files would make the roster's ORDER decide whether the tree
 * passes, since whichever project came second would contribute nothing over `src/`.
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

/**
 * The program one project describes, with its `extends` chain resolved.
 *
 * `ts.getParsedCommandLineOfConfigFile` rather than `readConfigFile` + `parseJsonConfigFileContent`
 * because it is the entry point that takes a diagnostics reporter: a config TypeScript cannot read
 * comes back as a refusal naming it, where the pair returns a `ParsedCommandLine` full of errors
 * that a caller has to remember to look at.
 */
function programFor(packageRoot: string, project: string): ts.Program {
  const configPath = path.join(packageRoot, project);
  if (!existsSync(configPath)) throw refusal(NO_PROJECT_CONFIG, project);

  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, parseHost(project));
  if (parsed === undefined) throw refusal(UNREADABLE_PROJECT_CONFIG, project);

  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

/** Named so a config TypeScript rejects fails as this project's refusal rather than as a silence. */
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

/**
 * Whether a file is this package's to answer for.
 *
 * A program reaches far past its own root: every `.d.ts` of every dependency, and `lib.es2023.d.ts`
 * itself. Declaration files are excluded whether they are ours or not — the ones in this tree are
 * generated, and `worker-configuration.d.ts` in the worker carries more citations than this
 * package's whole source does.
 */
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

/** A citation with the verdict on it, which judging needs and reporting does not. */
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

/** Where a citation is, and what it says — everything a repair needs and nothing a verdict does. */
function addressOf(link: Link, file: ts.SourceFile, packageRoot: string): Citation {
  return {
    file: path.relative(packageRoot, path.resolve(file.fileName)),
    line: file.getLineAndCharacterOfPosition(link.getStart(file)).line + 1,
    cited: citedText(link, file),
  };
}

/** Every spelling of the citation, so a comment cannot escape the rule by choosing one. */
type Link = ts.JSDocLink | ts.JSDocLinkCode | ts.JSDocLinkPlain;

function isLink(node: ts.Node): node is Link {
  return ts.isJSDocLink(node) || ts.isJSDocLinkCode(node) || ts.isJSDocLinkPlain(node);
}

/**
 * Every citation one file makes.
 *
 * `getChildren` and not `ts.forEachChild`, which descends into none of a node's `jsDoc`, `comment`
 * or `tags` — a walk built on it reads every statement in the package and finds no citation at all,
 * and reports a clean tree for it. `ts.getJSDocCommentsAndTags` is the other public route and was
 * measured one citation short of this one over the same tree.
 */
function linksIn(file: ts.SourceFile): Link[] {
  const collect = (node: ts.Node): Link[] =>
    isLink(node) ? [node] : node.getChildren(file).flatMap(collect);

  return collect(file);
}

/**
 * Whether the jump this citation promises lands anywhere.
 *
 * Two ways it does not, and the first is the one no scanner sees: a citation whose contents are not
 * an entity name at all — a bare module path, an `import(...)` namepath — parses to NO name, so
 * there is nothing to look up and nothing for a name-based instrument to report on either.
 */
function resolvesToASymbol(link: Link, checker: ts.TypeChecker): boolean {
  return link.name !== undefined && checker.getSymbolAtLocation(link.name) !== undefined;
}

/** What the comment actually says, so a reader is shown the citation rather than told a line number. */
function citedText(link: Link, file: ts.SourceFile): string {
  const name = link.name === undefined ? "" : link.name.getText(file);

  return `${name}${link.text}`.trim();
}

/** Named so the site to repair is the one the failure prints, rather than a fault with no address. */
function refusal(problem: string, subject: string): Error {
  return new Error(`${problem}: ${subject}`);
}
