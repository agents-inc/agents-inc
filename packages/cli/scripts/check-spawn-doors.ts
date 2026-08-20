/**
 * Every site that starts the built binary hands it `NO_BACKGROUND_VERSION_CHECK`.
 *
 * It exists because that variable is spread at three doors — `runCLI` in `e2e/helpers/test-utils.ts`,
 * `CLI.run` in `e2e/fixtures/cli.ts` and `TerminalSession` in `e2e/helpers/terminal-session.ts` —
 * with **no shared seam beneath them**. Nothing makes a fourth door inherit it, and its only
 * detector is a flaky red in one spec: without it, oclif's update plugin spawns a detached child
 * that writes into the fixture's fake HOME after the call has already returned, so the failure lands
 * in whatever spec happens to be reading that directory next.
 *
 * `e2e/vitest.config.ts`'s `test.env` was considered and rejected. It would cover all three by
 * inheritance and miss `e2e/handrun-journeys.ts`, which runs outside vitest — and a fix that covers
 * the doors it happens to know about is the defect restated one level up.
 *
 * **The judgement is per DOOR, not per file, and that costs a variable walk rather than a
 * `String.includes`.** Two of the three doors spread the guard into the call's own `env`; the PTY
 * harness assembles its env into one local, filters it into a second and hands the spawn the
 * second, so nothing about that call names the constant. A reader that looked only inside the call
 * would condemn the door that is correctly guarded, and a check whose hits are wrong is one that
 * gets silenced. A reader that asked only whether the FILE mentions the constant would pass a door
 * spawning bare beneath an unrelated spread. So the env expression is followed through the local
 * declarations it names until the guard is reached or the names run out.
 *
 * **A door is recognised by what it hands the spawn, not by the name it reaches it through.** Most
 * doors here name `BIN_RUN`; one spelling `bin/run.js` inline is the same door, and requiring the
 * constant read it as no door AT ALL rather than as an unguarded one. That is the single answer a
 * scan of this shape must not have — a hit can be argued with, a silence cannot even be seen — so
 * an argument is also judged by the literal pieces of the path it spells.
 *
 * A generated bundle is not judged. `e2e/helpers/handrun.gen.mjs` carries the doors of the sources
 * this scan already reads, so judging it reports each of them twice — and a STALE bundle would red
 * for a defect no edit fixes, sending a reader to rebuild rather than to the door.
 *
 * Nothing runs at module scope here — the suite beside it is the enforcement, as with
 * `check-screen-sentinels.ts` and `check-findings-frontmatter.ts`, and the package root is a
 * parameter so it can be driven against a fixture.
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";

import { bytewise } from "../src/cli/utils/string.ts";

/** Where the check reads from when no other root is given. */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

/** The constant most doors reach the built binary through, and one of the two ways a door reads. */
const BINARY_CONSTANT = "BIN_RUN";

/** The binary's own filename — the cheapest thing every spelling of its path has in common. */
const BINARY_FILE = "run.js";

/** Posix, because this reads a path as SOURCE writes it rather than as a runtime resolves it. */
const PATH_SEPARATOR = "/";

/**
 * The tail of the binary's path, tested against one argument's literal pieces joined back up.
 * `path.join(root, "bin", "run.js")`, `"…/bin/run.js"` and `` `${root}/bin/run.js` `` all reduce to
 * it, so one test covers every way a door spells the path rather than naming the constant.
 */
const BINARY_PATH = `bin${PATH_SEPARATOR}${BINARY_FILE}`;

/** The constant every door must hand the binary. Exported because the suite reports against it. */
export const GUARD_CONSTANT = "NO_BACKGROUND_VERSION_CHECK";

/** The property a spawn call carries the child's environment under. */
const ENV_PROPERTY = "env";

/** A tree holding no door at all has not been scanned, whatever it answers about the doors in it. */
export const NO_DOORS = "names no site that starts the binary";

/** A callee this reader cannot spell — reported rather than dropped, so the door is still named. */
const UNREADABLE_CALLEE = "(a call this scan cannot name)";

/** Extensions this package's modules are written in. */
const MODULE_EXTENSIONS = [".ts", ".tsx", ".mjs"];

/** What a bundler wrote. Its doors are the ones this scan already reads from their sources. */
const GENERATED_MARKER = ".gen.";

/** Directories holding nothing anyone authored, and so no door anyone can fix. */
const UNAUTHORED_DIRECTORIES = ["node_modules", "dist", ".git", ".cache", "coverage", ".turbo"];

/** One site that starts the binary: where it is written, and the call that makes it. */
export type DoorVerdict = {
  file: string;
  spawnedBy: string;
  outcome: "guarded" | "unguarded";
};

export type CheckResult = { clean: boolean; doors: DoorVerdict[] };

export function check({ packageRoot = PACKAGE_ROOT }: { packageRoot?: string } = {}): CheckResult {
  const doors = modulesUnder(packageRoot).flatMap((module) => doorsIn(packageRoot, module));
  if (doors.length === 0) throw new Error(`${packageRoot} ${NO_DOORS}`);

  return { clean: doors.every((door) => door.outcome === "guarded"), doors };
}

/** Every module under the root, in path order, as paths relative to it. */
function modulesUnder(root: string, prefix = ""): string[] {
  return readdirSync(path.join(root, prefix), { withFileTypes: true })
    .sort((one, other) => bytewise(one.name, other.name))
    .flatMap((entry) => {
      const relativePath = path.join(prefix, entry.name);
      if (entry.isDirectory()) {
        return UNAUTHORED_DIRECTORIES.includes(entry.name) ? [] : modulesUnder(root, relativePath);
      }

      return isJudgedModule(entry.name) ? [relativePath] : [];
    });
}

function isJudgedModule(name: string): boolean {
  if (name.includes(GENERATED_MARKER)) return false;

  return MODULE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

/** Every call in one module that starts the binary, and whether the env it hands over is guarded. */
function doorsIn(packageRoot: string, module: string): DoorVerdict[] {
  const filePath = path.join(packageRoot, module);
  const source = readFileSync(filePath, "utf-8");
  if (!source.includes(BINARY_CONSTANT) && !source.includes(BINARY_FILE)) return [];

  const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest);

  return spawnCallsIn(file).map((call) => ({
    file: module.split(path.sep).join("/"),
    spawnedBy: calleeNameOf(call.expression),
    outcome: reachesGuard(envHandedBy(call), file) ? "guarded" : "unguarded",
  }));
}

/** Every call whose arguments carry the binary inside an array, which is how each door writes it. */
function spawnCallsIn(file: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  const collect = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.arguments.some(namesTheBinary)) calls.push(node);
    node.forEachChild(collect);
  };
  file.forEachChild(collect);

  return calls;
}

function namesTheBinary(argument: ts.Expression): boolean {
  if (!ts.isArrayLiteralExpression(argument)) return false;

  return argument.elements.some(isTheBinary);
}

/** Whether one element IS the binary: the constant, or a path that spells its own way there. */
function isTheBinary(element: ts.Expression): boolean {
  if (ts.isIdentifier(element)) return element.text === BINARY_CONSTANT;

  return literalPiecesIn(element).join(PATH_SEPARATOR).endsWith(BINARY_PATH);
}

/**
 * Every literal string inside an expression, in source order — as much of a path as a reader can
 * spell without running it. `path.join` writes its segments as separate literals and a template
 * writes them around its substitutions, so joining the pieces back up is what makes one test cover
 * both, and an unresolvable head (`CLI_ROOT`, `import.meta.dirname`) drops out of the join without
 * taking the tail with it.
 */
function literalPiecesIn(node: ts.Node): string[] {
  const pieces: string[] = [];

  const collect = (child: ts.Node): void => {
    if (ts.isStringLiteralLike(child) || isTemplatePiece(child)) pieces.push(child.text);
    child.forEachChild(collect);
  };
  collect(node);

  return pieces;
}

function isTemplatePiece(
  node: ts.Node,
): node is ts.TemplateHead | ts.TemplateMiddle | ts.TemplateTail {
  return ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node);
}

/** How the call reads, so a report names the door rather than only the file holding it. */
function calleeNameOf(callee: ts.Expression): string {
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) {
    return `${calleeNameOf(callee.expression)}.${callee.name.text}`;
  }

  return UNREADABLE_CALLEE;
}

/** The environment expression a spawn call hands its child, if it hands one at all. */
function envHandedBy(call: ts.CallExpression): ts.Expression | undefined {
  const options = call.arguments.find(ts.isObjectLiteralExpression);
  const env = options?.properties.find(
    (property) => property.name !== undefined && nameOf(property.name) === ENV_PROPERTY,
  );

  return env !== undefined && ts.isPropertyAssignment(env) ? env.initializer : undefined;
}

function nameOf(name: ts.PropertyName): string {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : "";
}

/**
 * Whether the guard is reachable from the expression a door hands over, following every local
 * declaration the expression names.
 *
 * The hops are what make this usable: the PTY harness's env is a local built from another local,
 * and stopping at the call would report the one door that has been guarded since the fix landed.
 */
function reachesGuard(env: ts.Expression | undefined, file: ts.SourceFile): boolean {
  if (env === undefined) return false;

  const seen = new Set<string>();
  const pending = identifiersIn(env);

  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (name === GUARD_CONSTANT) return true;
    if (seen.has(name)) continue;

    seen.add(name);
    const initializer = initializerOf(file, name);
    if (initializer !== undefined) pending.push(...identifiersIn(initializer));
  }

  return false;
}

function identifiersIn(node: ts.Node): string[] {
  const names: string[] = [];

  const collect = (child: ts.Node): void => {
    if (ts.isIdentifier(child)) names.push(child.text);
    child.forEachChild(collect);
  };
  collect(node);

  return names;
}

/** What a name is declared as anywhere in the module — the next hop toward the guard, or nothing. */
function initializerOf(file: ts.SourceFile, name: string): ts.Expression | undefined {
  let found: ts.Expression | undefined;

  const search = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer !== undefined
    ) {
      found ??= node.initializer;
    }
    node.forEachChild(search);
  };
  file.forEachChild(search);

  return found;
}
