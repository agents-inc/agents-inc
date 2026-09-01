/**
 * Every structural value `e2e/pages/constants.ts` mirrors still reads what the product declares.
 *
 * **The mirroring is deliberate and stays; what was missing is a third party comparing it.** That
 * is `check-screen-sentinels.ts`'s argument for the wizard's screen subtitles, and it holds here
 * for the same reason: a spec that imported the constant under test would move both sides at once
 * and assert nothing. `EXIT_CODES` is the clearest case — an e2e spec asserting
 * `toBe(EXIT_CODES.CANCELLED)` is stating that this command cancels, and if the product renumbered
 * `CANCELLED` the imported form would agree with the new number and stay green.
 *
 * Its sibling registers the wizard's four screen sentinels **and nothing else**, deliberately: a
 * pair is registerable there when both halves are a literal STRING under a key, and its docblock
 * turns away the composed and the numeric. This file is the other half of that boundary — the
 * mirrors whose values are numbers, or nested a level down, which that check refuses by design.
 *
 * **The rule the file header states, enforced here.** `e2e/pages/constants.ts` carried a flat
 * "NO imports from src/cli" for years while 233 imports from `src/` lived across every other
 * directory in the E2E tree — so it read as a rule nobody applied rather than as the one file
 * where duplication buys something. Three of its values named their production original in a
 * comment and asked the reader to keep them in step by hand, and `TERMINAL_SIZE.SHORT`'s said
 * outright that a drift there hangs every spec that uses it rather than failing one.
 *
 * **`EXIT_CODES` is a SUPERSET, not a copy**, and the comparison is one-directional for that
 * reason: every code the product declares must be mirrored with the same value, and the E2E side
 * may hold codes of its own. `UNKNOWN_COMMAND: 127` is the live example — the shell's
 * command-not-found status, which a spec sees when `dist/` is absent and the CLI never emits.
 *
 * Nothing runs at module scope — the suite beside it is the enforcement, as with
 * `check-screen-sentinels.ts` and `check-enumeration-drift.ts`, and the package root is a
 * parameter so it can be driven against a fixture.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";

/** Where the check reads from when no other root is given. */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const E2E_CONSTANTS = "e2e/pages/constants.ts";
const EXIT_CODES_MODULE = "src/cli/lib/exit-codes.ts";
const CONSTS = "src/cli/consts.ts";

export const NO_SOURCE_FILE = "names a source file that does not exist";
export const NO_SYMBOL = "names a symbol its source file does not declare";
export const NO_KEY = "names a key its symbol does not hold";
export const NOT_A_LITERAL = "names a key holding something other than a string or a number";

/** A value's address: the symbol that declares it, and the keys to walk from there. */
export type ValueAddress = {
  file: string;
  symbol: string;
  /** Keys walked from the symbol's initializer. Empty for a bare `const NAME = <literal>`. */
  path: readonly string[];
};

/** A record's address — the symbol alone, whose every member is compared. */
export type RecordAddress = { file: string; symbol: string };

export type Mirror =
  | { name: string; kind: "value"; e2e: ValueAddress; product: ValueAddress }
  | { name: string; kind: "record"; e2e: RecordAddress; product: RecordAddress };

export type MirrorVerdict =
  { name: string; outcome: "agrees" } | { name: string; outcome: "drifted"; detail: string };

export type CheckResult = { clean: boolean; verdicts: MirrorVerdict[] };

/**
 * The registered mirrors.
 *
 * `TERMINAL_SIZE.SHORT` contributes its `rows` and NOT its `cols`: the constant's own docblock
 * says `rows` must track the gate exactly — one lower and every spec using it hangs on the resize
 * prompt, one higher and the specs stop being the tightest geometry the wizard supports — while
 * `cols: 100` sits deliberately above `MIN_TERMINAL_SIZE.COLS: 80`, wide enough to render
 * normally. Registering `cols` would assert an equality the design does not want.
 *
 * `TERMINAL_SIZE.BELOW_MINIMUM` is left out for the opposite reason: what it owes the gate is an
 * inequality (it must sit BELOW it), and this check compares values for equality. Its own docblock
 * carries that requirement.
 */
export const MIRRORS: Mirror[] = [
  {
    name: "EXIT_CODES",
    kind: "record",
    e2e: { file: E2E_CONSTANTS, symbol: "EXIT_CODES" },
    product: { file: EXIT_CODES_MODULE, symbol: "EXIT_CODES" },
  },
  {
    name: "TERMINAL_SIZE.SHORT.rows",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "TERMINAL_SIZE", path: ["SHORT", "rows"] },
    product: { file: CONSTS, symbol: "MIN_TERMINAL_SIZE", path: ["ROWS"] },
  },
  {
    name: "SOURCE_PATHS.PLUGINS_DIST",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "SOURCE_PATHS", path: ["PLUGINS_DIST"] },
    product: { file: CONSTS, symbol: "PLUGINS_DIST_PATH", path: [] },
  },
  /**
   * Added 2026-09-01, after this exact pair drifted through a whole apex migration unnoticed.
   *
   * The editor moved from `agentsinc.sh` to `agentsinc.sh/editor` and the mirror kept the old
   * value. Nothing failed, because the spec that reads it asserted `toContain("agentsinc.sh")` —
   * a substring of BOTH the right address and the wrong one — so `init --ui` printing a link to
   * the marketing page was green. That spec now reads `STEP_TEXT.EDITOR_URL`, which is what makes
   * this row worth having: the assertion is only as true as the mirror, and nothing else checks
   * the mirror.
   */
  {
    name: "STEP_TEXT.EDITOR_URL",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "STEP_TEXT", path: ["EDITOR_URL"] },
    product: { file: CONSTS, symbol: "EDITOR_URL", path: [] },
  },
];

export function check({
  packageRoot = PACKAGE_ROOT,
  mirrors = MIRRORS,
}: { packageRoot?: string | undefined; mirrors?: Mirror[] | undefined } = {}): CheckResult {
  const verdicts = mirrors.map((mirror) => judge(packageRoot, mirror));

  return { clean: verdicts.every((verdict) => verdict.outcome !== "drifted"), verdicts };
}

function judge(packageRoot: string, mirror: Mirror): MirrorVerdict {
  if (mirror.kind === "value") return judgeValue(packageRoot, mirror);
  return judgeRecord(packageRoot, mirror);
}

function judgeValue(
  packageRoot: string,
  mirror: Extract<Mirror, { kind: "value" }>,
): MirrorVerdict {
  const e2e = literalAt(packageRoot, mirror.e2e, mirror.name);
  const product = literalAt(packageRoot, mirror.product, mirror.name);

  if (e2e === product) return { name: mirror.name, outcome: "agrees" };

  return {
    name: mirror.name,
    outcome: "drifted",
    detail: `mirror holds ${JSON.stringify(e2e)}, product holds ${JSON.stringify(product)}`,
  };
}

/**
 * Every member the product declares, against the mirror's.
 *
 * One-directional: a member the MIRROR adds is not drift, because the E2E tree legitimately names
 * statuses the CLI never emits. A member the PRODUCT adds and the mirror lacks is, because a spec
 * reaching for it finds nothing.
 */
function judgeRecord(
  packageRoot: string,
  mirror: Extract<Mirror, { kind: "record" }>,
): MirrorVerdict {
  const e2e = recordAt(packageRoot, mirror.e2e, mirror.name);
  const product = recordAt(packageRoot, mirror.product, mirror.name);

  const disagreements = Object.entries(product).flatMap(([key, value]) =>
    e2e[key] === value
      ? []
      : [
          `${key}: mirror holds ${JSON.stringify(e2e[key])}, product holds ${JSON.stringify(value)}`,
        ],
  );

  if (disagreements.length === 0) return { name: mirror.name, outcome: "agrees" };

  return { name: mirror.name, outcome: "drifted", detail: disagreements.join("; ") };
}

/** One literal, refused rather than read as absent when the address does not resolve. */
function literalAt(packageRoot: string, address: ValueAddress, subject: string): string | number {
  const initializer = initializerOf(packageRoot, address, subject);
  const target = address.path.reduce<ts.Expression>(
    (node, key) => memberOf(node, key, address, subject),
    initializer,
  );

  return literalValue(target, address, subject);
}

/** Every member of one object literal, as a flat map. */
function recordAt(
  packageRoot: string,
  address: RecordAddress,
  subject: string,
): Record<string, string | number> {
  const initializer = initializerOf(packageRoot, { ...address, path: [] }, subject);
  if (!ts.isObjectLiteralExpression(initializer)) {
    throw refusal(subject, NOT_A_LITERAL, `${address.file} -> ${address.symbol}`);
  }

  return Object.fromEntries(
    initializer.properties.flatMap((property) => {
      if (!ts.isPropertyAssignment(property)) return [];
      const name = nameOf(property);
      if (name === undefined) return [];
      return [[name, literalValue(property.initializer, { ...address, path: [name] }, subject)]];
    }),
  );
}

/** What a symbol is declared as, with `as const` and parentheses stripped. */
function initializerOf(packageRoot: string, address: ValueAddress, subject: string): ts.Expression {
  const filePath = path.join(packageRoot, address.file);
  if (!existsSync(filePath)) throw refusal(subject, NO_SOURCE_FILE, address.file);

  const file = ts.createSourceFile(
    filePath,
    readFileSync(filePath, "utf-8"),
    ts.ScriptTarget.Latest,
  );

  const declared = declarationOf(file, address.symbol);
  if (declared === undefined) {
    throw refusal(subject, NO_SYMBOL, `${address.file} -> ${address.symbol}`);
  }

  return unwrap(declared);
}

/** The initializer of the first top-level `const <symbol> = ...` in a file. */
function declarationOf(file: ts.SourceFile, symbol: string): ts.Expression | undefined {
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === symbol) {
        return declaration.initializer;
      }
    }
  }

  return undefined;
}

function memberOf(
  node: ts.Expression,
  key: string,
  address: ValueAddress,
  subject: string,
): ts.Expression {
  if (!ts.isObjectLiteralExpression(node)) {
    throw refusal(subject, NOT_A_LITERAL, addressOf(address));
  }

  for (const property of node.properties) {
    if (ts.isPropertyAssignment(property) && nameOf(property) === key) {
      return unwrap(property.initializer);
    }
  }

  throw refusal(subject, NO_KEY, addressOf(address));
}

/**
 * A literal's value, refused unless it is a plain string or number.
 *
 * A computed value — a reference, a call, a template literal — is a claim about how the value is
 * built rather than what it is, and comparing one to a literal would pass while the two differ.
 */
function literalValue(
  node: ts.Expression,
  address: ValueAddress,
  subject: string,
): string | number {
  const value = unwrap(node);
  if (ts.isStringLiteral(value)) return value.text;
  if (ts.isNumericLiteral(value)) return Number(value.text);

  throw refusal(subject, NOT_A_LITERAL, addressOf(address));
}

/** `as const` assertions and parentheses, which carry no value of their own. */
function unwrap(node: ts.Expression): ts.Expression {
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node)) return unwrap(node.expression);
  return node;
}

function nameOf(property: ts.PropertyAssignment): string | undefined {
  if (ts.isIdentifier(property.name)) return property.name.text;
  if (ts.isStringLiteral(property.name)) return property.name.text;
  return undefined;
}

function addressOf(address: ValueAddress): string {
  return [address.file, address.symbol, ...address.path].join(" -> ");
}

function refusal(subject: string, reason: string, detail: string): Error {
  return new Error(`${subject} ${reason} — ${detail}`);
}
