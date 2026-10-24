/**
 * Refuses a value `e2e/pages/constants.ts` mirrors that no longer equals the product's. Mirrored
 * rather than imported, so an assertion cannot move with the value it checks. `EXIT_CODES` is a
 * superset: the E2E side may add codes of its own.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

import ts from "typescript";

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

const E2E_CONSTANTS = "e2e/pages/constants.ts";
const EXIT_CODES_MODULE = "src/cli/lib/exit-codes.ts";
const CONSTS = "src/cli/consts.ts";
const DOCTOR_COMMAND = "src/cli/commands/doctor.ts";
const INSTALL_LAYOUT = "src/cli/lib/installation/install-layout.ts";
/** consts.ts only re-exports the path names; this declares them. */
const COMPILE_PATHS = "../compile/src/paths.ts";

export const NO_SOURCE_FILE = "names a source file that does not exist";
export const NO_SYMBOL = "names a symbol its source file does not declare";
export const NO_KEY = "names a key its symbol does not hold";
export const NOT_A_LITERAL = "names a key holding something other than a string or a number";

type ValueAddress = {
  file: string;
  symbol: string;
  /** Empty for a bare `const NAME = <literal>`. */
  path: readonly string[];
};

type RecordAddress = { file: string; symbol: string };

export type Mirror =
  | { name: string; kind: "value"; e2e: ValueAddress; product: ValueAddress }
  | { name: string; kind: "record"; e2e: RecordAddress; product: RecordAddress };

type MirrorVerdict =
  { name: string; outcome: "agrees" } | { name: string; outcome: "drifted"; detail: string };

export type CheckResult = { clean: boolean; verdicts: MirrorVerdict[] };

/** `TERMINAL_SIZE.SHORT.cols` is deliberately wider than the gate, so only `rows` is mirrored. */
const MIRRORS: Mirror[] = [
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
    name: "TERMINAL_SIZE.NARROWEST.cols",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "TERMINAL_SIZE", path: ["NARROWEST", "cols"] },
    product: { file: CONSTS, symbol: "MIN_TERMINAL_SIZE", path: ["COLS"] },
  },
  {
    name: "SOURCE_PATHS.PLUGINS_DIST",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "SOURCE_PATHS", path: ["PLUGINS_DIST"] },
    product: { file: CONSTS, symbol: "PLUGINS_DIST_PATH", path: [] },
  },
  // DIRS.SOURCE_CLAUDE is unregistered: its product counterpart is a function, not a literal.
  {
    name: "DIRS.SOURCE_ROOT",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "DIRS", path: ["SOURCE_ROOT"] },
    product: { file: COMPILE_PATHS, symbol: "SOURCE_ROOT_DIR", path: [] },
  },
  {
    name: "STEP_TEXT.EDITOR_URL",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "STEP_TEXT", path: ["EDITOR_URL"] },
    product: { file: CONSTS, symbol: "LOCAL_EDITOR_URL", path: [] },
  },
  {
    name: "STEP_TEXT.LIVE_EDITOR_URL",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "STEP_TEXT", path: ["LIVE_EDITOR_URL"] },
    product: { file: CONSTS, symbol: "DEFAULT_EDITOR_URL", path: [] },
  },
  {
    name: "STEP_TEXT.DOCTOR_STATUS_FAIL",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "STEP_TEXT", path: ["DOCTOR_STATUS_FAIL"] },
    product: { file: CONSTS, symbol: "UI_SYMBOLS", path: ["CROSS"] },
  },
  // `UI_SYMBOLS.CHECK` and `.SKIPPED` hold these glyph constants by name, so the glyphs are read here.
  {
    name: "STEP_TEXT.DOCTOR_STATUS_PASS",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "STEP_TEXT", path: ["DOCTOR_STATUS_PASS"] },
    product: { file: CONSTS, symbol: "CHECK_GLYPH", path: [] },
  },
  {
    name: "STEP_TEXT.DOCTOR_STATUS_SKIP",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "STEP_TEXT", path: ["DOCTOR_STATUS_SKIP"] },
    product: { file: CONSTS, symbol: "EN_DASH_GLYPH", path: [] },
  },
  {
    name: "STEP_TEXT.DOCTOR_ROW_INSTALLATIONS",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "STEP_TEXT", path: ["DOCTOR_ROW_INSTALLATIONS"] },
    product: { file: DOCTOR_COMMAND, symbol: "INSTALLATIONS_ROW_NAME", path: [] },
  },
  {
    name: "STEP_TEXT.DOCTOR_ROW_MARKETPLACE_REPOSITORY",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "STEP_TEXT", path: ["DOCTOR_ROW_MARKETPLACE_REPOSITORY"] },
    product: { file: DOCTOR_COMMAND, symbol: "SOURCE_REPO_ROW_NAME", path: [] },
  },
  {
    name: "DIRS.RETIRED_SOURCE",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "DIRS", path: ["RETIRED_SOURCE"] },
    product: { file: INSTALL_LAYOUT, symbol: "RETIRED_SOURCE_FOLDER", path: [] },
  },
  {
    name: "PUBLIC_MARKETPLACE_NAME",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "PUBLIC_MARKETPLACE_NAME", path: [] },
    product: { file: COMPILE_PATHS, symbol: "DEFAULT_PUBLIC_SOURCE_NAME", path: [] },
  },
  {
    name: "DIRS.EXAMPLES",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "DIRS", path: ["EXAMPLES"] },
    product: { file: COMPILE_PATHS, symbol: "STANDARD_DIRS", path: ["EXAMPLES"] },
  },
  {
    name: "FILES.REFERENCE_MD",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "FILES", path: ["REFERENCE_MD"] },
    product: { file: COMPILE_PATHS, symbol: "STANDARD_FILES", path: ["REFERENCE_MD"] },
  },
  {
    name: "SOURCE_PATHS.AGENTS_DIR",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "SOURCE_PATHS", path: ["AGENTS_DIR"] },
    product: { file: COMPILE_PATHS, symbol: "DIRS", path: ["agents"] },
  },
  {
    name: "EJECT_SOURCE_NAME",
    kind: "value",
    e2e: { file: E2E_CONSTANTS, symbol: "EJECT_SOURCE_NAME", path: [] },
    product: { file: COMPILE_PATHS, symbol: "EJECT_SOURCE", path: [] },
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

/** One-directional: a member only the mirror holds is not drift. */
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

/** A computed value is refused: comparing it to a literal could pass while the two differ. */
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
