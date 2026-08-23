/**
 * The scan that a name a spec calls itself still names something this package holds.
 *
 * `clean-code-standards.md` § 17.4 puts five surfaces on any rename and says tooling covers two.
 * A test NAME is one of the three it does not cover, and it is the worst of them, because it cannot
 * ever go red. Three `it` names in `user-journeys/config-precedence.test.ts` named the withdrawn
 * environment variable over bodies setting `process.env[SOURCE_ENV_VAR]` — whose value had become
 * `"CC_MARKETPLACE"` — and survived a rename pass, a green suite and two agent sweeps. The
 * old-value grep DOES return a name like that; what was missing was anything that had to account
 * for the hit.
 *
 * The subject is deliberately narrow. Only a SCREAMING_SNAKE token is read — a name with an
 * underscore in it, which is how this codebase spells a constant and an environment variable and is
 * not how it writes prose. So prose is left alone, and so are `CLI`, `YAML` and `JSON`.
 *
 * **A token resolves against a module's CODE and never against its comments**, and that is the half
 * that makes the scan work at all. Prose is the surface § 17.4 says nothing ever catches, so a
 * withdrawn name mentioned in any docblock anywhere would vouch for every spec still naming it —
 * this file's own docblock did exactly that in its first draft, and the scan reported clean.
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import fg from "fast-glob";
import ts from "typescript";

export const NO_SPECS = "read no spec at all";
export const NO_MODULES = "resolved its names against no module at all";

/** Every spec whose names are read. All three trees, because a rename crosses all three. */
const EVERY_SPEC = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "e2e/**/*.test.ts",
  "scripts/**/*.test.ts",
];

/** Everything that is not a spec — the vocabulary a spec's name is allowed to draw on. */
const EVERY_MODULE = ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts", "scripts/**/*.ts"];
const SPEC_SUFFIXES = ["**/*.test.ts", "**/*.test.tsx"];

/** The functions that give a spec its name, however they are qualified (`it.skip`, `it.each(…)`). */
const NAMING_CALLS = ["it", "test", "describe"];

/**
 * A constant-shaped name: at least one underscore, so it cannot be an ordinary capitalised word.
 * `CC_SOURCE` is one; `CLI`, `YAML` and `TODO` are not, and neither is any English sentence.
 */
const CONSTANT_TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** One spec name stating a token no module of this package holds. */
export type UnresolvedName = { spec: string; test: string; token: string };

export type VocabularyResult = { specs: string[]; modules: string[]; unresolved: UnresolvedName[] };

/**
 * Every spec name stating a constant this package no longer holds, with what it read to decide.
 *
 * Both rosters come back for the same reason `vacuousThrowAssertions` returns what it scanned: an
 * empty `unresolved` over an empty roster is the silent pass every check here refuses — and this
 * one has two ways to be empty, so both are refused by name rather than reported as clean.
 */
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

/** Every constant-shaped token the non-spec modules hold in code, read once for the whole scan. */
function tokensHeldBy(packageRoot: string, modules: string[]): Set<string> {
  return new Set(
    modules.flatMap((module) =>
      codeTokensIn(readFileSync(path.join(packageRoot, module), "utf-8")),
    ),
  );
}

/**
 * One module's constant-shaped tokens, with everything it says in a comment left out.
 *
 * A scanner rather than a parse: the question is which tokens the file holds and where each stands,
 * which is lexical, and the whole non-spec tree is read on every run.
 */
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

/**
 * The name every `it`, `test` and `describe` in one file gives itself.
 *
 * Read from the AST rather than by scanning for `it("`, because the shapes a name is written in
 * are what a scan would have to enumerate and a missed shape is a name nobody judges — which is
 * the silence this whole file exists to close. A template with a substitution contributes its
 * literal parts: the substitution is a value the run supplies and is nobody's vocabulary.
 */
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

/** Whether a callee is `it`, `test` or `describe`, however it has been qualified or called. */
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

/** Named so the failure prints the tree it read, rather than a fault with no address. */
function refusal(packageRoot: string, problem: string): Error {
  return new Error(`${packageRoot} ${problem}`);
}
