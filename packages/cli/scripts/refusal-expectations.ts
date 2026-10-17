/**
 * {@link expectRefusal} asserts a refusal so it can only pass for the reason it names;
 * {@link vacuousThrowAssertions} refuses scripts/ suites asserting one with an imported constant
 * that may be `undefined` at runtime, which `toThrow` reads as "threw anything".
 */
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import fg from "fast-glob";
import ts from "typescript";
import { expect } from "vitest";

export const UNSTATED_REFUSAL =
  "asserts a refusal whose message is not stated — an imported constant its module does not export is `undefined` here, and matches every error";

export const NO_MESSAGE =
  "asserts a refusal whose message is empty — the empty string is a substring of every error";

const EVERY_SCRIPTS_SPEC = "scripts/**/*.test.ts";

const THROW_MATCHERS = ["toThrow", "toThrowError"];

const NEGATION = "not";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** `refusal` admits `undefined` on purpose, so a missing export fails here at runtime. */
export function expectRefusal(
  run: () => unknown,
  refusal: string | undefined,
  because?: string,
): void {
  if (refusal === undefined) throw new Error(UNSTATED_REFUSAL);
  if (refusal === "") throw new Error(NO_MESSAGE);

  expect(run, because).toThrow(refusal);
}

/** `scanned` lets a caller prove the scan had a subject. */
export type ThrowAssertionScan = { scanned: string[]; vacuous: string[] };

export function vacuousThrowAssertions(options?: { packageRoot?: string }): ThrowAssertionScan {
  const packageRoot = options?.packageRoot ?? PACKAGE_ROOT;
  const scanned = fg.sync(EVERY_SCRIPTS_SPEC, { cwd: packageRoot }).sort();

  return {
    scanned,
    vacuous: scanned.flatMap((file) => vacuousThrowAssertionsInFile(packageRoot, file)),
  };
}

function vacuousThrowAssertionsInFile(packageRoot: string, file: string): string[] {
  return vacuousThrowAssertionsIn(readFileSync(path.join(packageRoot, file), "utf-8"), file);
}

/** Condemns imported constants and empty matchers; a locally declared constant cannot be a missing export. */
export function vacuousThrowAssertionsIn(source: string, file: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const imported = importedNamesIn(parsed);

  return throwAssertionsIn(parsed)
    .filter((call) => isVacuous(call, imported))
    .map((call) => `${file}: ${call.getText()}`);
}

function isVacuous(call: ts.CallExpression, imported: Set<string>): boolean {
  if (isNegated(call.expression)) return false;
  if (call.arguments.length === 0) return true;

  return call.arguments.some((argument) => statesNoMessage(argument, imported));
}

/**
 * `new RegExp(undefined)` is the empty pattern, so wrapping is no fix. Interpolating is not
 * condemned: an absent export becomes the text `undefined`, which matches nothing.
 */
function statesNoMessage(argument: ts.Expression, imported: Set<string>): boolean {
  if (ts.isIdentifier(argument)) return imported.has(argument.text);

  const pattern = regExpPatternOf(argument);
  return pattern !== undefined && statesNoMessage(pattern, imported);
}

const REGEXP = "RegExp";

/** With or without `new`. */
function regExpPatternOf(argument: ts.Expression): ts.Expression | undefined {
  if (!ts.isNewExpression(argument) && !ts.isCallExpression(argument)) return undefined;
  if (!ts.isIdentifier(argument.expression) || argument.expression.text !== REGEXP) {
    return undefined;
  }

  return argument.arguments?.[0];
}

function isNegated(expression: ts.Expression): boolean {
  if (!ts.isPropertyAccessExpression(expression)) return false;

  return expression.name.text === NEGATION || isNegated(expression.expression);
}

function throwAssertionsIn(file: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (isThrowAssertion(node)) calls.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(file, visit);

  return calls;
}

function isThrowAssertion(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    THROW_MATCHERS.includes(node.expression.name.text)
  );
}

function importedNamesIn(file: ts.SourceFile): Set<string> {
  return new Set(file.statements.flatMap(importedNamesOf));
}

function importedNamesOf(statement: ts.Statement): string[] {
  if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) return [];

  const { name, namedBindings } = statement.importClause;
  const defaults = name === undefined ? [] : [name.text];
  if (namedBindings === undefined) return defaults;

  return [
    ...defaults,
    ...(ts.isNamedImports(namedBindings)
      ? namedBindings.elements.map((element) => element.name.text)
      : [namedBindings.name.text]),
  ];
}
