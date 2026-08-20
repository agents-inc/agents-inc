/**
 * Every E2E constant a step page object WAITS on still reads the string the product paints.
 *
 * It exists because that pair was guarded in one direction only, and the two directions do not fail
 * alike. `wizard-layout.test.tsx` compares the product to a literal it carries itself, so a subtitle
 * that moves reddens the unit suite in under a second, naming the string — and three comments, on
 * the constant, on the label table and over that spec, say so. None of them covers the other half:
 * nothing in the unit suite reads `e2e/pages/constants.ts` at all, since it is outside the unit
 * `include` and behind its own tsconfig. So the pair was two literals with no comparison between
 * them, and `STEP_TEXT.SOURCES` sat at `"Customize skill origins"` against a product rendering
 * `"Customize skill sources"` — the whole unit suite green, and roughly a dozen wizard specs each
 * burning the 45-second `TIMEOUTS.WIZARD_LOAD` budget before failing.
 *
 * **A drift that times out is a different failure from a drift that asserts.** A wait has no
 * assertion to fail; it has a budget to exhaust. The output names a timeout rather than a string, so
 * the reader is told the wizard did not load, which is not what happened.
 *
 * **The literal duplication is right and stays.** A spec that imported the constant under test would
 * move both sides at once and assert nothing, which is exactly why both mirrors were written as
 * literals. What was missing is a third party comparing them, and this is that: it reads both as
 * SOURCE, so it crosses no tsconfig boundary and needs no build. The alternative — moving the
 * sentinels into `src/` for e2e to import — kills the duplication rather than checking it, and with
 * it the property the duplication exists for.
 *
 * **The four registered pairs are the wizard's screen sentinels and nothing else.** A pair is
 * registerable when both halves are a literal string a symbol holds under a key. The other
 * waited-on constants are not: `STEP_TEXT.BUILD` is a category label the fixture matrix supplies,
 * and `CONFIRM`, `INIT_SUCCESS`, `BUILD_FOOTER` and `RESIZE_PROMPT` are fragments of messages the
 * product composes at runtime — comparing a fragment to a template literal would be a false green.
 * `WIZARD_TAB_LABELS` against `WIZARD_STEP_LABELS` is the same shape one step down and is left out
 * deliberately: a tab label is asserted with `toContain` rather than waited on, so its drift fails
 * fast on its own and the timeout hazard this file exists for does not apply.
 *
 * **The roster is held against the product's own table rather than against a copy of itself.** A
 * row here says which two members must agree, so no row can notice a screen ARRIVING in
 * `STEP_DROPDOWN_LABEL` and being registered by nobody — a fifth one went unnoticed by a suite
 * comparing {@link PAIRS} to a literal list of the same four names. {@link labelledScreens} reads
 * the product's keys, and the suite compares these rows to them.
 *
 * Nothing runs at module scope — the suite beside it is the enforcement, as with
 * `check-enumeration-drift.ts` and `check-findings-frontmatter.ts`, and the package root is a
 * parameter so it can be driven against a fixture.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";

/** Where the check reads from when no other root is given. */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const E2E_CONSTANTS = "e2e/pages/constants.ts";
const WIZARD_LAYOUT = "src/cli/components/wizard/wizard-layout.tsx";

const STEP_TEXT = "STEP_TEXT";
const STEP_DROPDOWN_LABEL = "STEP_DROPDOWN_LABEL";

export const NO_SOURCE_FILE = "names a source file that does not exist";
export const NO_SYMBOL = "names a symbol its source file does not declare";
export const NO_KEY = "names a key its symbol does not hold";
export const NOT_A_STRING = "names a key holding something other than a literal string";
export const UNNAMEABLE_MEMBER =
  "declares a member this scan cannot name, which would drop a screen";

/** Where a table lives: the file that declares it, and the symbol it is declared as. */
export type TableAddress = { file: string; symbol: string };

/** One end of a mirrored pair: the string a symbol holds under a key, in one file. */
export type SentinelAddress = TableAddress & { key: string };

/** A screen sentinel and the product literal it duplicates, which must read the same. */
export type SentinelPair = {
  pair: string;
  sentinel: SentinelAddress;
  product: SentinelAddress;
};

/** One pair's answer: the two literals read the same, or these are the two that differ. */
export type SentinelVerdict =
  | { pair: string; outcome: "agrees"; text: string }
  | { pair: string; outcome: "drifted"; sentinel: string; product: string };

export type CheckResult = { clean: boolean; verdicts: SentinelVerdict[] };

/**
 * Every wizard screen a step page object waits on — the four `STEP_DROPDOWN_LABEL` entries, and
 * `STEP_TEXT.STACK`, `.DOMAINS`, `.SOURCES` and `.AGENTS` are what wait on them.
 *
 * Both keys are written out rather than one derived from the other. A row states which two members
 * must agree, and two lists whose spellings happen to match today is exactly the relationship this
 * file exists to stop anyone assuming.
 */
/** The product's own label table: which screens carry a subtitle at all is what it, alone, says. */
export const PRODUCT_LABELS: TableAddress = { file: WIZARD_LAYOUT, symbol: STEP_DROPDOWN_LABEL };

export const PAIRS: SentinelPair[] = [
  { pair: "STACK", sentinelKey: "STACK", productKey: "stack" },
  { pair: "DOMAINS", sentinelKey: "DOMAINS", productKey: "domains" },
  { pair: "SOURCES", sentinelKey: "SOURCES", productKey: "sources" },
  { pair: "AGENTS", sentinelKey: "AGENTS", productKey: "agents" },
].map(({ pair, sentinelKey, productKey }) => ({
  pair,
  sentinel: { file: E2E_CONSTANTS, symbol: STEP_TEXT, key: sentinelKey },
  product: { ...PRODUCT_LABELS, key: productKey },
}));

export function check({
  packageRoot = PACKAGE_ROOT,
  pairs = PAIRS,
}: { packageRoot?: string | undefined; pairs?: SentinelPair[] | undefined } = {}): CheckResult {
  const verdicts = pairs.map((entry) => judgePair(packageRoot, entry));

  return { clean: verdicts.every((verdict) => verdict.outcome !== "drifted"), verdicts };
}

/**
 * Every screen the product gives a dropdown subtitle, read from the table that declares them.
 *
 * {@link PAIRS} is hand-written, so nothing in it can tell that a screen has arrived in the product
 * and been registered by nobody. This is the independent authority that can, and it is the same
 * file this check already parses.
 */
export function labelledScreens({
  packageRoot = PACKAGE_ROOT,
  labels = PRODUCT_LABELS,
}: { packageRoot?: string | undefined; labels?: TableAddress | undefined } = {}): string[] {
  const screens = tableIn(packageRoot, labels, labels.symbol).properties.map(nameOf);
  if (screens.some((screen) => screen === undefined)) {
    throw refusal(labels.symbol, UNNAMEABLE_MEMBER, tableOf(labels));
  }

  return screens.filter((screen) => screen !== undefined);
}

function judgePair(packageRoot: string, entry: SentinelPair): SentinelVerdict {
  const sentinel = readString(packageRoot, entry.sentinel, entry.pair);
  const product = readString(packageRoot, entry.product, entry.pair);

  if (sentinel === product) return { pair: entry.pair, outcome: "agrees", text: sentinel };

  return { pair: entry.pair, outcome: "drifted", sentinel, product };
}

function readString(packageRoot: string, address: SentinelAddress, subject: string): string {
  return stringUnder(tableIn(packageRoot, address, subject), address, subject);
}

/** The object literal one address points at, refused rather than read as empty when it is not there. */
function tableIn(
  packageRoot: string,
  address: TableAddress,
  subject: string,
): ts.ObjectLiteralExpression {
  const filePath = path.join(packageRoot, address.file);
  if (!existsSync(filePath)) throw refusal(subject, NO_SOURCE_FILE, address.file);

  const file = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf-8"),
    ts.ScriptTarget.Latest,
  );

  const literal = declarationOf(file, address.symbol);
  if (literal === undefined) throw refusal(subject, NO_SYMBOL, tableOf(address));

  return literal;
}

/**
 * What a key holds, refused unless it is a literal string.
 *
 * A composed label — a template literal, a call, a reference — is a claim about how the string is
 * built rather than what it reads, and comparing a sentinel to a fragment of one would pass while
 * the screen paints something else.
 */
function stringUnder(
  literal: ts.ObjectLiteralExpression,
  address: SentinelAddress,
  subject: string,
): string {
  const property = literal.properties.find((candidate) => nameOf(candidate) === address.key);
  if (property === undefined) throw refusal(subject, NO_KEY, memberOf(address));

  if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) {
    throw refusal(subject, NOT_A_STRING, memberOf(address));
  }

  return property.initializer.text;
}

function nameOf(property: ts.ObjectLiteralElementLike): string | undefined {
  const { name } = property;
  if (name === undefined) return undefined;

  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined;
}

/**
 * The object literal a symbol is declared as, with any `as const`, `satisfies`, type annotation and
 * parentheses read through. Both tables are module-private, so an export modifier is not required.
 */
function declarationOf(
  file: ts.SourceFile,
  symbol: string,
): ts.ObjectLiteralExpression | undefined {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    const declaration = statement.declarationList.declarations.find(
      (candidate) => ts.isIdentifier(candidate.name) && candidate.name.text === symbol,
    );
    if (declaration?.initializer === undefined) continue;

    const initializer = unwrap(declaration.initializer);

    return ts.isObjectLiteralExpression(initializer) ? initializer : undefined;
  }

  return undefined;
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return unwrap(expression.expression);
  }

  return expression;
}

/** Which table a refusal is about, for the problems that are about the whole of one. */
function tableOf(address: TableAddress): string {
  return `${address.symbol} in ${address.file}`;
}

/** Which member, for the problems that are about one key rather than the table holding it. */
function memberOf(address: SentinelAddress): string {
  return `${address.symbol}.${address.key} in ${address.file}`;
}

/** Named so the row to repair is the one the failure prints, rather than a fault with no address. */
function refusal(subject: string, problem: string, address: string): Error {
  return new Error(`${subject}: ${problem} — ${address}`);
}
