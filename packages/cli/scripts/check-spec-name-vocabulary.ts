/**
 * Refuses a spec name stating a SCREAMING_SNAKE token that no non-spec module holds in code.
 * Comments are not vocabulary, or a withdrawn name in any docblock would vouch for every spec.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import fg from "fast-glob";
import ts from "typescript";

export const NO_SPECS = "read no spec at all";
export const NO_MODULES = "resolved its names against no module at all";

const EVERY_SPEC = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "e2e/**/*.test.ts",
  "scripts/**/*.test.ts",
];

const EVERY_MODULE = ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts", "scripts/**/*.ts"];
const SPEC_SUFFIXES = ["**/*.test.ts", "**/*.test.tsx"];

const NAMING_CALLS = ["it", "test", "describe"];

/** At least one underscore, so `CLI`, `YAML` and prose never match. */
const CONSTANT_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type UnresolvedName = { spec: string; test: string; token: string };

export type VocabularyResult = { specs: string[]; modules: string[]; unresolved: UnresolvedName[] };

/** Both rosters are returned and refused when empty, so an unread tree cannot pass as clean. */
export function check(options?: { packageRoot?: string }): VocabularyResult {
  const packageRoot = options?.packageRoot ?? PACKAGE_ROOT;
  const specs = fg.sync(EVERY_SPEC, { cwd: packageRoot }).sort();
  const modules = fg.sync(EVERY_MODULE, { cwd: packageRoot, ignore: SPEC_SUFFIXES }).sort();

  if (specs.length === 0) throw refusal(packageRoot, NO_SPECS);
  if (modules.length === 0) throw refusal(packageRoot, NO_MODULES);

  const held = tokensHeldBy(packageRoot, modules);

  return {
    specs,
    modules,
    unresolved: specs.flatMap((spec) => unresolvedNamesIn(packageRoot, spec, held)),
  };
}

function tokensHeldBy(packageRoot: string, modules: string[]): Set<string> {
  return new Set(
    modules.flatMap((module) =>
      codeTokensIn(readFileSync(path.join(packageRoot, module), "utf-8")),
    ),
  );
}

/** A lexical scan rather than a parse: the whole non-spec tree is read on every run. */
function codeTokensIn(source: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  const tokens: string[] = [];

  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (!isComment(kind)) tokens.push(...tokensIn(scanner.getTokenText()));
  }

  return tokens;
}

function isComment(kind: ts.SyntaxKind): boolean {
  return (
    kind === ts.SyntaxKind.SingleLineCommentTrivia || kind === ts.SyntaxKind.MultiLineCommentTrivia
  );
}

function unresolvedNamesIn(packageRoot: string, spec: string, held: Set<string>): UnresolvedName[] {
  const source = readFileSync(path.join(packageRoot, spec), "utf-8");

  return specNamesIn(source, spec).flatMap((test) =>
    tokensIn(test)
      .filter((token) => !held.has(token))
      .map((token) => ({ spec, test, token })),
  );
}

function tokensIn(text: string): string[] {
  return [...text.matchAll(CONSTANT_TOKEN)].map((match) => match[0]);
}

/** A template contributes only its literal parts; substitutions are run-time values. */
export function specNamesIn(source: string, file: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false);
  const names: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isNamingCall(node.expression)) {
      names.push(...literalPartsOf(node.arguments[0]));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(parsed, visit);

  return names;
}

function isNamingCall(callee: ts.Expression): boolean {
  if (ts.isIdentifier(callee)) return NAMING_CALLS.includes(callee.text);
  if (ts.isPropertyAccessExpression(callee)) return isNamingCall(callee.expression);
  if (ts.isCallExpression(callee)) return isNamingCall(callee.expression);

  return false;
}

function literalPartsOf(argument: ts.Expression | undefined): string[] {
  if (argument === undefined) return [];
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return [argument.text];
  }
  if (!ts.isTemplateExpression(argument)) return [];

  return [argument.head.text, ...argument.templateSpans.map((span) => span.literal.text)];
}

function refusal(packageRoot: string, problem: string): Error {
  return new Error(`${packageRoot} ${problem}`);
}
