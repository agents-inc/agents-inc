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
 * **The same read answers a second question, and `clearances()` is where it comes out.** The
 * environment roster in `src/cli/lib/__tests__/e2e-runner-environment.test.ts` requires every door
 * to hand the child `<NAME>: undefined` for each variable the product reads. That used to be
 * checked by looking for the string in the runner's SOURCE TEXT, which a comment satisfies —
 * measured, by replacing `runCLI`'s clearing line with a comment saying it: the roster stayed green
 * while that door leaked the harness's `VITEST` into every binary it spawned, and the only thing
 * that noticed was an e2e spec covering one of the five variables. A property set to `undefined`
 * and a sentence describing one are the same substring and different syntax trees.
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

/** One site that starts the binary, and the variables it takes away from the child. */
export type DoorClearance = {
  file: string;
  spawnedBy: string;
  clears: string[];
};

export type CheckResult = { clean: boolean; doors: DoorVerdict[] };

/** One door, read once for every question asked of it. */
type Door = DoorClearance & { guarded: boolean };

export function check({ packageRoot = PACKAGE_ROOT }: { packageRoot?: string } = {}): CheckResult {
  const doors = doorsUnder(packageRoot).map(verdictOf);

  return { clean: doors.every((door) => door.outcome === "guarded"), doors };
}

/** How one door reads to the guard question, which is the only one `check` asks of it. */
function verdictOf({ file, spawnedBy, guarded }: Door): DoorVerdict {
  return { file, spawnedBy, outcome: guarded ? "guarded" : "unguarded" };
}

/**
 * Every door paired with the variables it sets to `undefined` in the environment it hands over.
 *
 * The environment roster in `src/cli/lib/__tests__/e2e-runner-environment.test.ts` is the caller.
 * It used to ask whether a runner's SOURCE TEXT contained `<NAME>: undefined` anywhere, which a
 * comment satisfies — and this codebase writes that exact sentence in prose, `src/cli/utils/
 * logger.ts` among them. Measured: replacing `runCLI`'s clearing line with a comment saying it
 * left the roster green while every binary that door spawned inherited the harness's `VITEST`.
 */
export function clearances({
  packageRoot = PACKAGE_ROOT,
}: { packageRoot?: string } = {}): DoorClearance[] {
  return doorsUnder(packageRoot).map(clearanceOf);
}

/** How one door reads to the environment question, which is the only one `clearances` asks. */
function clearanceOf({ file, spawnedBy, clears }: Door): DoorClearance {
  return { file, spawnedBy, clears };
}

/** Every door in the tree. A tree holding none has not been scanned, whatever it answers. */
function doorsUnder(packageRoot: string): Door[] {
  const doors = modulesUnder(packageRoot).flatMap((module) => doorsIn(packageRoot, module));
  if (doors.length === 0) throw new Error(`${packageRoot} ${NO_DOORS}`);

  return doors;
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

/** Every call in one module that starts the binary, read for everything asked of a door. */
function doorsIn(packageRoot: string, module: string): Door[] {
  const filePath = path.join(packageRoot, module);
  const source = readFileSync(filePath, "utf-8");
  if (!source.includes(BINARY_CONSTANT) && !source.includes(BINARY_FILE)) return [];

  const file = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest);

  return spawnCallsIn(file).map((call) => {
    const env = envHandedBy(call);

    return {
      file: module.split(path.sep).join("/"),
      spawnedBy: calleeNameOf(call.expression),
      guarded: reachesGuard(env, file),
      clears: clearedIn(env, file),
    };
  });
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
 * Every expression a door's environment is built out of: the one handed to the spawn, and the
 * initializer of every local reachable from it.
 *
 * The hops are what make this usable, and both questions below need them: the PTY harness's env is
 * a local built from another local, so a reader stopping at the call would report the one door
 * that has been guarded since the fix landed, and would report it as clearing nothing.
 */
function envSourcesOf(env: ts.Expression, file: ts.SourceFile): ts.Expression[] {
  const sources = [env];
  const seen = new Set<string>();
  const pending = valueIdentifiersIn(env);

  for (let name = pending.pop(); name !== undefined; name = pending.pop()) {
    if (seen.has(name)) continue;

    seen.add(name);
    const initializer = initializerOf(file, name);
    if (initializer === undefined) continue;

    sources.push(initializer);
    pending.push(...valueIdentifiersIn(initializer));
  }

  return sources;
}

/** Whether the guard is reachable from the expression a door hands over. */
function reachesGuard(env: ts.Expression | undefined, file: ts.SourceFile): boolean {
  if (env === undefined) return false;

  return envSourcesOf(env, file).some(namesTheGuard);
}

function namesTheGuard(source: ts.Expression): boolean {
  return valueIdentifiersIn(source).includes(GUARD_CONSTANT);
}

/**
 * Every variable a door takes away from the child — the properties its environment assigns
 * `undefined`, which is the shape all three runners clear one in.
 *
 * Read from the syntax tree rather than from the source text, because that is the whole
 * difference: a comment naming the variable and the line that removes it are the same substring.
 */
function clearedIn(env: ts.Expression | undefined, file: ts.SourceFile): string[] {
  if (env === undefined) return [];

  return envSourcesOf(env, file).flatMap(clearedPropertiesIn);
}

function clearedPropertiesIn(source: ts.Expression): string[] {
  const cleared: string[] = [];

  const collect = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && isUndefined(node.initializer)) {
      cleared.push(nameOf(node.name));
    }
    node.forEachChild(collect);
  };
  collect(source);

  return cleared;
}

function isUndefined(node: ts.Expression): boolean {
  return ts.isIdentifier(node) && node.text === "undefined";
}

/**
 * Every identifier standing for a VALUE, which is every one except those written as property KEYS.
 *
 * The distinction is the whole of one verdict. `NO_BACKGROUND_VERSION_CHECK` is an object whose
 * single key is the variable oclif reads, so spreading it and naming it are opposites: a door
 * writing `NO_BACKGROUND_VERSION_CHECK: "1"` sets a variable nothing reads and suppresses nothing.
 * A reader counting every identifier calls that door guarded — measured on a real one, an ad-hoc
 * hand-run script in the package root, which this scan reported guarded while oclif's update
 * plugin detached a child from it on every run.
 */
function valueIdentifiersIn(node: ts.Node): string[] {
  const names: string[] = [];

  const collect = (child: ts.Node): void => {
    if (ts.isIdentifier(child)) names.push(child.text);
    child.forEachChild((grandchild) => {
      if (ts.isPropertyAssignment(child) && grandchild === child.name) return;
      collect(grandchild);
    });
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
