import { existsSync, readFileSync } from "fs";
import path from "path";

import fg from "fast-glob";
import ts from "typescript";

/**
 * Holds a document's `symbol | file` table to what the named file actually DECLARES.
 *
 * `reference/testing/factories.md` pairs a helper with the module it lives in, one row each, and
 * nothing checked the pairing: a helper that moved to a sibling module left the row reading as a
 * correct address, and a reader following it finds a file that does not export the name.
 *
 * **The predicate is DECLARES, not mentions, and that is the whole reason this needs the compiler.**
 * A grep for the identifier in the named file is satisfied by the file merely USING it — importing
 * it from the module it actually moved to, or naming it in a comment — which is exactly the state a
 * moved symbol leaves behind. Asking the program for the file's export surface cannot be fooled
 * that way. This is CLI-635's parked subset: that row's universal resolver over every backticked
 * name was refuted by measurement (2707 names, 2634 resolving, and it missed its own founding
 * defect); the predicate that survives is existence AT THE NAMED LOCATION.
 */
export const NO_PACKAGE_ROOT = "names a package root that does not exist";
export const NO_DOCUMENT = "names a document that does not exist";
export const NO_SUCH_MODULE = "names a module no file in this package answers to";
export const AMBIGUOUS_MODULE = "names a module more than one file answers to";
export const NO_PAIRINGS = "names a document stating no symbol/file pairing this checker can read";

/** One row the document states, at the line a reader would go and fix. */
export type Pairing = { line: number; symbol: string; module: string; dir?: string };

/** A pairing whose named module does not export the named symbol. */
export type Unbacked = Pairing & { declares: string[] };

export type CheckResult = { unbacked: Unbacked[] };

/** Where a bare module name in a table may resolve to, so the search cannot wander. */
export const SEARCHED_DIRS: readonly string[] = ["src", "e2e", "scripts"];

/** `| \`someSymbol()\` | \`some-module.ts\` |` — the shape the table states a pairing in. */
const PAIR_ROW = /^\|\s*`([A-Za-z_][A-Za-z0-9_]*)\(?\)?`\s*\|\s*`([a-z0-9-]+\.tsx?)`\s*\|/;

/**
 * A CONSTANT's name, which pairs with a filename as a VALUE rather than as an address.
 *
 * `| \`SKILL_CATEGORIES_TS\` | \`skill-categories.ts\` |` states what the constant HOLDS — a
 * filename a marketplace's own config directory carries — and the file it names is not in this
 * package at all. Read as an address it is a false positive, and one that would refuse the whole
 * document. SCREAMING_SNAKE is what separates the two tables; a function or helper row is
 * camelCase.
 */
const STATES_A_VALUE = /^[A-Z][A-Z0-9_]*$/;

/**
 * A table header whose second column states WHERE THE SYMBOL LIVES.
 *
 * Read because the same `\`symbol\` | \`module.ts\`` shape states more than one relation. A
 * **Consumer** or **Caller** column says which module USES the symbol, which is a different claim
 * and true of a module that does not declare it — `computeScopeDiff | skill-agent-summary.tsx` is
 * correct under that header and would be condemned by a checker that read only the cells. Judge
 * the tables that claim an address, and leave the rest to whatever checks callers.
 */
const ADDRESS_HEADER = /^\|\s*[^|]*\|\s*(File|Module|Defined in|Source|Location)\b/i;

/** Any table header, so entering a table with a different second column stops judging. */
const TABLE_HEADER = /^\|[^|]*\|[^|]*\|/;

/** The separator under a header — `| --- | --- |` — which is not a pairing. */
const TABLE_RULE = /^\|[\s:-]+\|/;

/**
 * A heading naming the directory its rows address — `## Helper Functions (\`src/.../helpers/\`)`.
 *
 * The File column states a BARE module name, which is not an address on its own: `index.ts`
 * answers to nineteen files in this package and `config-assertions.ts` to two. What disambiguates
 * a row is the section it sits under, so that is what this reads. Resolving by filename alone and
 * picking the first match would make the verdict depend on directory order — the failure mode a
 * checker exists to rule out.
 */
const SECTION_DIR = /^#{2,4} .*\(`([^`]+\/)`\)\s*$/;

export function check({
  packageRoot,
  document,
}: {
  packageRoot: string;
  document: string;
}): CheckResult {
  if (!existsSync(packageRoot)) throw refusal(NO_PACKAGE_ROOT, packageRoot);

  const documentPath = path.join(packageRoot, document);
  if (!existsSync(documentPath)) throw refusal(NO_DOCUMENT, document);

  const pairings = pairingsIn(readFileSync(documentPath, "utf-8"));

  // A checker that reads nothing reports nothing, and the two are indistinguishable from the
  // outside — the silent-zero shape this repository has on record. A document handed to this
  // check must state at least one pairing it can resolve, or the call is a mistake rather than a
  // pass. Four documents carrying 70 rows read as clean this way before 2026-08-23, because their
  // headings name no directory and every row was being skipped.
  if (pairings.length === 0) throw refusal(NO_PAIRINGS, document);

  const addresses = new Set(pairings.map(addressOf));
  const exportsByAddress = exportSurfaces(packageRoot, addresses);

  return {
    unbacked: pairings.flatMap((pairing) => {
      const declares = exportsByAddress.get(addressOf(pairing)) ?? [];
      if (declares.includes(pairing.symbol)) return [];

      return [{ ...pairing, declares }];
    }),
  };
}

function pairingsIn(source: string): Pairing[] {
  const pairings: Pairing[] = [];
  let dir: string | undefined;
  let statesAnAddress = false;

  source.split("\n").forEach((text, index) => {
    const heading = SECTION_DIR.exec(text);
    if (heading?.[1] !== undefined) {
      dir = heading[1];

      return;
    }

    if (TABLE_RULE.test(text)) return;
    if (TABLE_HEADER.test(text) && !PAIR_ROW.test(text)) {
      statesAnAddress = ADDRESS_HEADER.test(text);

      return;
    }
    if (!statesAnAddress) return;

    const match = PAIR_ROW.exec(text);
    if (match?.[1] === undefined || match[2] === undefined) return;
    if (STATES_A_VALUE.test(match[1])) return;

    // A row under a directory-naming heading is scoped by it; one without is resolved by a unique
    // filename search instead, and an ambiguous name is refused rather than guessed.
    pairings.push({ line: index + 1, symbol: match[1], module: match[2], ...(dir && { dir }) });
  });

  return pairings;
}

/**
 * What each named module exports, read from the program rather than from its text.
 *
 * One program over every module the document names, so the cost is a single parse pass rather than
 * one per row — 118 rows over a dozen modules otherwise reparses each of them ten times.
 */
function exportSurfaces(
  packageRoot: string,
  addresses: ReadonlySet<string>,
): Map<string, string[]> {
  const resolved = new Map<string, string>();
  for (const address of addresses) resolved.set(address, resolveModule(packageRoot, address));

  const program = ts.createProgram({
    rootNames: [...resolved.values()],
    options: { allowJs: false, noEmit: true, target: ts.ScriptTarget.ES2022 },
  });

  return new Map(
    [...resolved].map(([module, filePath]) => [module, declaredNames(program, filePath)]),
  );
}

/**
 * Every top-level binding the file DECLARES, exported or not.
 *
 * Deliberately not the export surface. A row saying a helper lives in a module is a claim about
 * where it is WRITTEN, and a file-local function documented at its own module is correct — three
 * `exec.ts` validators are exactly that shape and an exports-only predicate reported all three as
 * stale. Reading declarations is also what separates this from a grep, which a module's IMPORT of
 * a symbol it no longer declares would satisfy.
 */
function declaredNames(program: ts.Program, filePath: string): string[] {
  const file = program.getSourceFile(filePath);
  if (file === undefined) return [];

  return file.statements.flatMap(declaredBy);
}

function declaredBy(statement: ts.Statement): string[] {
  if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
    return statement.name === undefined ? [] : [statement.name.text];
  }
  if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
    return [statement.name.text];
  }
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
    );
  }

  return [];
}

/**
 * The one file in this package answering to a bare module name.
 *
 * Refuses ambiguity rather than picking: two modules of the same name mean the document's address
 * is not an address, and choosing one would make the verdict depend on directory order.
 */
/**
 * The one file answering to a row's address.
 *
 * Two shapes, because documents state addresses two ways. A section heading naming a directory
 * — `## Helpers (\`src/.../helpers/\`)` — scopes its rows exactly, and that is the strong form. A
 * document without one states a bare module name, which is resolved by searching this package and
 * **refused when more than one file answers**: `index.ts` matches nineteen and
 * `config-assertions.ts` two, and picking the first would make the verdict depend on directory
 * order. An ambiguous row is a document defect — the address is not an address — and says so.
 */
function resolveModule(packageRoot: string, address: string): string {
  if (address.includes("/") || address.includes(path.sep)) {
    const full = path.join(packageRoot, address);
    if (!existsSync(full)) throw refusal(NO_SUCH_MODULE, address);

    return full;
  }

  const matches = fg.sync(
    SEARCHED_DIRS.map((dir) => `${dir}/**/${address}`),
    { cwd: packageRoot, absolute: true, ignore: ["**/node_modules/**"] },
  );

  if (matches.length === 0) throw refusal(NO_SUCH_MODULE, address);
  if (matches.length > 1) throw refusal(AMBIGUOUS_MODULE, `${address} — ${matches.length} files`);

  return matches[0] as string;
}

/** A row's address: the directory its section names if it named one, plus the module it states. */
function addressOf(pairing: Pairing): string {
  return pairing.dir === undefined ? pairing.module : path.join(pairing.dir, pairing.module);
}

function refusal(problem: string, subject: string): Error {
  return new Error(`${problem}: ${subject}`);
}
