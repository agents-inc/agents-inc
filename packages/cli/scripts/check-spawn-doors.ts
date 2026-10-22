/**
 * Refuses a site that starts the built binary without handing it every {@link GUARD_CONSTANTS}
 * entry. Judged per door: the env expression is followed through local declarations, and a door is
 * recognised by the binary path it spells as well as by `BIN_RUN`. Generated bundles are skipped.
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";

import { bytewise } from "../src/cli/utils/string.ts";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const BINARY_CONSTANT = "BIN_RUN";

const BINARY_FILE = "run.js";

/** Posix: paths are read as source writes them. */
const PATH_SEPARATOR = "/";

const BINARY_PATH = `bin${PATH_SEPARATOR}${BINARY_FILE}`;

export const GUARD_CONSTANTS = ["NO_BACKGROUND_VERSION_CHECK", "NO_LIVE_SEED_API"] as const;

const ENV_PROPERTY = "env";

export const NO_DOORS = "names no site that starts the binary";

const UNREADABLE_CALLEE = "(a call this scan cannot name)";

const MODULE_EXTENSIONS = [".ts", ".tsx", ".mjs"];

/** Bundled output, whose doors are already read from their sources. */
const GENERATED_MARKER = ".gen.";

const UNAUTHORED_DIRECTORIES = ["node_modules", "dist", ".git", ".cache", "coverage", ".turbo"];

export type DoorVerdict = {
  file: string;
  spawnedBy: string;
  outcome: "guarded" | "unguarded";
};

export type CheckResult = { clean: boolean; doors: DoorVerdict[] };

type Door = { file: string; spawnedBy: string; guarded: boolean };

export function check({ packageRoot = PACKAGE_ROOT }: { packageRoot?: string } = {}): CheckResult {
  const doors = doorsUnder(packageRoot).map(verdictOf);

  return { clean: doors.every((door) => door.outcome === "guarded"), doors };
}

function verdictOf({ file, spawnedBy, guarded }: Door): DoorVerdict {
  return { file, spawnedBy, outcome: guarded ? "guarded" : "unguarded" };
}

/** A tree holding no door has not been scanned. */
function doorsUnder(packageRoot: string): Door[] {
  const doors = modulesUnder(packageRoot).flatMap((module) => doorsIn(packageRoot, module));
  if (doors.length === 0) throw new Error(`${packageRoot} ${NO_DOORS}`);

  return doors;
}

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
    };
  });
}

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

function isTheBinary(element: ts.Expression): boolean {
  if (ts.isIdentifier(element)) return element.text === BINARY_CONSTANT;

  return literalPiecesIn(element).join(PATH_SEPARATOR).endsWith(BINARY_PATH);
}

/**
 * Every literal string inside an expression, in source order. Joined, they cover `path.join` and
 * templates alike, and an unresolvable head drops out without taking the tail.
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

function calleeNameOf(callee: ts.Expression): string {
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) {
    return `${calleeNameOf(callee.expression)}.${callee.name.text}`;
  }

  return UNREADABLE_CALLEE;
}

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

/** The env handed to the spawn plus the initializer of every local reachable from it. */
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

function reachesGuard(env: ts.Expression | undefined, file: ts.SourceFile): boolean {
  if (env === undefined) return false;

  const named = envSourcesOf(env, file).flatMap(valueIdentifiersIn);

  return GUARD_CONSTANTS.every((guard) => named.includes(guard));
}

/**
 * Identifiers standing for values, not property keys: `NO_BACKGROUND_VERSION_CHECK: "1"` sets a
 * variable nothing reads, while spreading the constant guards the door.
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
