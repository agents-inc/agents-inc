/**
 * How a refusal is asserted so that the assertion can fail for the reason it names, and the scan
 * that says every suite under `scripts/` asserts one that way.
 *
 * Both halves exist for one shape, measured on 2026-08-19 while refusals were being added to
 * `check-enumeration-drift.ts`: four of thirteen new tests read `expect(run).toThrow(UNREADABLE_VALUE)`
 * against a constant that the test file IMPORTED and the module did not yet export. At runtime that
 * name is `undefined`, `toThrow(undefined)` is vitest's "threw anything at all", and the four tests
 * passed against a checker that refused for entirely different reasons. They were run red-first and
 * the red proved nothing, which is the whole defect: a red-first run is evidence only when the red
 * comes from the assertion, and an assertion naming a symbol that does not exist yet cannot supply
 * one. `tsc` catches this — TS2305, module has no exported member — but `tsc` is not what a
 * red-first step runs, and every suite under `scripts/` asserts its refusals in exactly this shape.
 *
 * The pair is deliberate. {@link expectRefusal} makes the vitest run itself sufficient evidence;
 * {@link vacuousThrowAssertions} is what stops the next suite quietly going back to the bare
 * matcher. Neither alone holds: a helper nothing requires is a helper the next author does not
 * know about, and a scan with nothing to point people at only says no.
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

/** Every suite this scan judges: the gates of this package, which is where the shape lives. */
const EVERY_SCRIPTS_SPEC = "scripts/**/*.test.ts";

/** Both spellings vitest gives the same matcher, so a suite cannot escape by choosing one. */
const THROW_MATCHERS = ["toThrow", "toThrowError"];

/** The modifier that turns the matcher into "does not throw", which names the whole of its subject. */
const NEGATION = "not";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * That `run` refuses for the reason `refusal` names — with the message judged before it is used.
 *
 * The `refusal` parameter admits `undefined` ON PURPOSE. Annotating it `string` would make the one
 * value this function exists to refuse unrepresentable in the type system while leaving it
 * perfectly reachable at runtime, which is exactly how the defect got in: every call site believed
 * it was passing a string, and `tsc` was the only thing that disagreed. Here the run disagrees too.
 *
 * `because` is the invariant the assertion carries, handed straight to `expect` so a converted call
 * site keeps the message it already had.
 */
export function expectRefusal(
  run: () => unknown,
  refusal: string | undefined,
  because?: string,
): void {
  if (refusal === undefined) throw new Error(UNSTATED_REFUSAL);
  if (refusal === "") throw new Error(NO_MESSAGE);

  expect(run, because).toThrow(refusal);
}

/** What the scan read, beside what it condemned — a scan of nothing agrees with itself for free. */
export type ThrowAssertionScan = { scanned: string[]; vacuous: string[] };

/**
 * Every assertion under `scripts/` that cannot tell the refusal it names from any other failure.
 *
 * `scanned` is returned rather than counted internally because the caller has to be able to prove
 * the scan had a subject: an empty `vacuous` over an empty `scanned` is the silent pass every check
 * in this package refuses.
 */
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

/**
 * The same judgement over one file's source, which is the half a fixture can drive.
 *
 * Two shapes are condemned and a third deliberately is not. An assertion naming a constant the
 * file IMPORTS is the live defect. An assertion naming no message accepts any failure by
 * construction, which is the same verdict reached without an import. A constant the file DECLARES
 * is left alone: it cannot be the one its module forgot to export, and condemning it would be
 * banning a spelling rather than a hole.
 */
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
 * Whether one argument leaves the matcher with nothing to match on when its export is absent.
 *
 * Two spellings, and the second is the one that reads as the repair for the first. Wrapping the
 * constant in a regular expression was proposed on the reasoning that an absent export would
 * become a `TypeError` rather than a wildcard. It does not: `new RegExp(undefined)` is `/(?:)/`,
 * the empty pattern, which is a substring of every error message — so the wrapped form accepts any
 * throw exactly as the bare one does, while looking like the fix.
 *
 * INTERPOLATING the constant into a pattern is deliberately not condemned. An absent export
 * becomes the literal text `undefined` there, which matches no real message, so such an assertion
 * fails loudly rather than passing on anything — a different spelling, and not a hole.
 */
function statesNoMessage(argument: ts.Expression, imported: Set<string>): boolean {
  if (ts.isIdentifier(argument)) return imported.has(argument.text);

  const pattern = regExpPatternOf(argument);
  return pattern !== undefined && statesNoMessage(pattern, imported);
}

/** The constructor whose empty pattern is what makes the wrapped shape a wildcard. */
const REGEXP = "RegExp";

/**
 * The pattern a `RegExp(...)` construction is built from, in either spelling — the `new` is
 * optional in the language and would otherwise be a one-character escape from this whole scan.
 */
function regExpPatternOf(argument: ts.Expression): ts.Expression | undefined {
  if (!ts.isNewExpression(argument) && !ts.isCallExpression(argument)) return undefined;
  if (!ts.isIdentifier(argument.expression) || argument.expression.text !== REGEXP) {
    return undefined;
  }

  return argument.arguments?.[0];
}

/** Whether `not` stands anywhere in the matcher chain, which makes the subject "throws nothing". */
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

/** Every name the file binds from another module — the names that can be `undefined` at runtime. */
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
