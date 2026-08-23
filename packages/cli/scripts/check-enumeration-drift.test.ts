/**
 * Contract for `scripts/check-enumeration-drift.ts` — the scan that a document claiming to
 * enumerate a source symbol exhaustively still names what that symbol actually holds.
 *
 * Two halves, like every check beside it. The first drives the check against fixture packages,
 * because the shapes that matter (a document naming a deleted symbol, a source member no document
 * lists, a registry row pointing at a section that has moved) must not exist in this repository at
 * all — the second half is the assertion that none of them does.
 *
 * The guards get a test each, and that is deliberate. Every check in this repository that has
 * failed us failed by declining to judge rather than by judging wrongly, and a row that silently
 * judges nothing reads exactly like a row that passed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  AMBIGUOUS_COLUMN,
  AMBIGUOUS_MEMBER_CELL,
  AMBIGUOUS_SECTION,
  check,
  type DocumentClaim,
  DOCUMENT_ENUMERATES_NOTHING,
  NO_COLUMN,
  NO_DOCUMENT,
  NO_SECTION,
  NO_SOURCE_DIRECTORY,
  NO_SOURCE_FILE,
  NO_SYMBOL,
  REEXPORTS_A_DECLARATION,
  REGISTRY,
  type RegistryEntry,
  SOURCE_ENUMERATES_NOTHING,
  UNNAMEABLE_REEXPORT,
  UNREADABLE_MEMBER,
  UNREADABLE_VALUE,
  WHOLE_MODULE_REEXPORT,
} from "./check-enumeration-drift.js";
import { expectRefusal } from "./refusal-expectations.js";

/** This package's root, so a claim about a file in it is read from the file rather than a fixture. */
const PACKAGE_ROOT = path.resolve(import.meta.dirname, "..");

/**
 * The declarations that state markdown's cell escape, spelt as both files that carry them spell
 * them. `scripts/check-enumeration-drift.ts` copied them verbatim from
 * `src/cli/lib/__tests__/helpers/journey-page.ts`, and until one module can hold the rule for both
 * this is the only thing that makes the pair move together.
 *
 * The rule is a fact about how markdown is rendered rather than about either reader, so the two
 * have the same reason to change and no reason to change apart — which is what separates this from
 * a value each site restates so its own subject stays observable.
 */
const ESCAPE_RULE_DECLARATIONS = [
  "const CELL_SEPARATOR = /(?<!\\\\)\\|/;",
  'const ESCAPED_PIPE = "\\\\|";',
];

const ESCAPE_RULE_ORIGIN = "src/cli/lib/__tests__/helpers/journey-page.ts";
const ESCAPE_RULE_COPY = "scripts/check-enumeration-drift.ts";

const SOURCE_FILE = "src/sentinels.ts";
const DOCUMENT = "docs/reference.md";
const CLAIM = "SENTINELS in docs/reference.md";

const SECTION_OPENS = "enumerated exhaustively:";
const SECTION_CLOSES = "**Everything else**";

const SENTINELS = "SENTINELS";

/** A directory of modules plus the barrel that re-exports them, which is the shape of `factories/`. */
const SOURCE_DIRECTORY = "src/kit";
const KIT_ALPHA = `${SOURCE_DIRECTORY}/alpha-kit.ts`;
const KIT_BRAVO = `${SOURCE_DIRECTORY}/bravo-kit.ts`;
const KIT_BARREL = `${SOURCE_DIRECTORY}/index.ts`;
const KIT_SPEC = `${SOURCE_DIRECTORY}/alpha-kit.test.ts`;

/** A tree of oclif command modules, one per topic level, which is the shape of `commands/`. */
const COMMAND_DIRECTORY = "src/commands";

const OBJECT_SOURCE = [
  `export const ${SENTINELS} = {`,
  `  ALPHA: "alpha",`,
  `  BRAVO: "bravo",`,
  `  CHARLIE: "charlie",`,
  `} as const;`,
  ``,
].join("\n");

const ARRAY_SOURCE = [`export const ${SENTINELS} = ["alpha", "bravo"] as const;`, ``].join("\n");

const UNION_SOURCE = [`export type ${SENTINELS} = "alpha" | "bravo";`, ``].join("\n");

const EMPTY_OBJECT_SOURCE = [`export const ${SENTINELS} = {} as const;`, ``].join("\n");

/** `as const satisfies` — this codebase's house style for a vocabulary array. */
const SATISFIES_ARRAY_SOURCE = [
  `export const ${SENTINELS} = ["alpha", "bravo"] as const satisfies readonly string[];`,
  ``,
].join("\n");

/** A `satisfies` with no `as const` beneath it, which is how the canonical test fixtures declare. */
const SATISFIES_OBJECT_SOURCE = [
  `export const ${SENTINELS} = {`,
  `  ALPHA: "alpha",`,
  `  BRAVO: "bravo",`,
  `} satisfies Record<string, string>;`,
  ``,
].join("\n");

/** A constraint naming a member the literal does not hold, so reading it would over-report by one. */
const WIDER_CONSTRAINT_SOURCE = [
  `export const ${SENTINELS} = {`,
  `  ALPHA: "alpha",`,
  `  BRAVO: "bravo",`,
  `} as const satisfies Partial<Record<"ALPHA" | "BRAVO" | "CHARLIE", string>>;`,
  ``,
].join("\n");

/** Consts and functions in one module, so the two module-level readers can be told apart. */
const MIXED_MODULE_SOURCE = [
  `export const ALPHA = { ONE: "one" } as const;`,
  `export const BRAVO = "bravo";`,
  ``,
  `export function charlie(count: number): string {`,
  `  return String(count);`,
  `}`,
  ``,
  `export function delta(): string {`,
  `  return "delta";`,
  `}`,
  ``,
].join("\n");

/** A sibling of the barrel: its own declarations are what the directory exports through it. */
const KIT_ALPHA_SOURCE = [
  `export const ALPHA_DEFAULT = "alpha";`,
  ``,
  `export function alpha(): string {`,
  `  return ALPHA_DEFAULT;`,
  `}`,
  ``,
  `export type AlphaOptions = { loud: boolean };`,
  ``,
].join("\n");

/** A second sibling, one of whose exports the barrel does NOT re-export — as `helpers/` has. */
const KIT_BRAVO_SOURCE = [
  `export function bravo(): string {`,
  `  return "bravo";`,
  `}`,
  ``,
  `export function bravoUnbarrelled(): string {`,
  `  return "bravo";`,
  `}`,
  ``,
].join("\n");

/** Named re-exports and nothing of its own, which is what makes the barrel enumerate nothing. */
const KIT_BARREL_SOURCE = [
  `export { ALPHA_DEFAULT, alpha } from "./alpha-kit.js";`,
  `export type { AlphaOptions } from "./alpha-kit.js";`,
  `export { bravo } from "./bravo-kit.js";`,
  ``,
].join("\n");

/** A spec beside the modules: it is not part of the directory's export surface. */
const KIT_SPEC_SOURCE = [`export const SPEC_ONLY = "spec";`, ``].join("\n");

/** A whole-module re-export, whose members the reader cannot name without resolving the module. */
const KIT_STAR_BARREL_SOURCE = [`export * from "./alpha-kit.js";`, ``].join("\n");

/**
 * A helper module written the way `e2e/helpers/test-utils.ts` is, which is the shape the re-export
 * reader exists for: names imported from elsewhere and handed on through a BARE block, names
 * re-exported straight from their origin, types among both, and the module's own declarations
 * beside all of it. One of the bare names is aliased, because the export clause's spelling is what
 * a consumer imports and the origin's is not.
 */
const HELPER_MODULE_SOURCE = [
  `import { alpha, ALPHA_DEFAULT } from "./alpha-kit.js";`,
  `import type { AlphaOptions } from "./alpha-kit.js";`,
  ``,
  `export const OWN_CONSTANT = "own";`,
  ``,
  `export function own(): string {`,
  `  return OWN_CONSTANT;`,
  `}`,
  ``,
  `export { alpha, ALPHA_DEFAULT as ALPHA_FALLBACK };`,
  `export type { AlphaOptions };`,
  `export { bravo } from "./bravo-kit.js";`,
  `export type { BravoOptions } from "./bravo-kit.js";`,
  ``,
].join("\n");

/** The same module handing on a name it DECLARED, which neither reader answers for. */
const HELPER_EXPORTING_ITS_OWN_DECLARATION = [
  `import { alpha } from "./alpha-kit.js";`,
  ``,
  `function own(): string {`,
  `  return "own";`,
  `}`,
  ``,
  `export { alpha, own };`,
  ``,
].join("\n");

/**
 * An object whose VALUES are what a document's second column states, which is `E2E_SKILL_TITLES`'s
 * shape: a key nothing renders and a title everything does.
 */
const TITLED_OBJECT_SOURCE = [
  `export const ${SENTINELS} = {`,
  `  alpha: "First Sentinel",`,
  `  bravo: "Second Sentinel",`,
  `  charlie: "Third Sentinel",`,
  `} as const satisfies Record<string, string>;`,
  ``,
].join("\n");

/** A value spelt as a template with a substitution, which is how `SCHEMA_PATHS` writes all seven. */
const TEMPLATE_VALUE_SOURCE = [
  `const PREFIX = "First";`,
  `export const ${SENTINELS} = {`,
  `  alpha: \`\${PREFIX} Sentinel\`,`,
  `} as const;`,
  ``,
].join("\n");

/** A value spelt as a name declared elsewhere, which is how `STANDARD_FILES.METADATA_YAML` is. */
const IDENTIFIER_VALUE_SOURCE = [
  `const SECOND_SENTINEL = "Second Sentinel";`,
  `export const ${SENTINELS} = {`,
  `  alpha: "First Sentinel",`,
  `  bravo: SECOND_SENTINEL,`,
  `} as const;`,
  ``,
].join("\n");

/** A value holding a pipe, which no document can write in a table cell except as the escape `\|`. */
const PIPED_VALUE_SOURCE = [
  `export const ${SENTINELS} = {`,
  `  alpha: "First | Sentinel",`,
  `  bravo: "Second Sentinel",`,
  `} as const satisfies Record<string, string>;`,
  ``,
].join("\n");

/** A spread, which carries no name in this literal for either half of a pair to be read from. */
const SPREAD_VALUE_SOURCE = [
  `const OTHERS = { charlie: "Third Sentinel" } as const;`,
  `export const ${SENTINELS} = {`,
  `  alpha: "First Sentinel",`,
  `  ...OTHERS,`,
  `} as const;`,
  ``,
].join("\n");

const COMMAND_SOURCE = [`export default class Command {}`, ``].join("\n");

const CODE_SPANS_CLAIM = {
  document: DOCUMENT,
  from: SECTION_OPENS,
  to: SECTION_CLOSES,
  states: "code-spans",
} as const satisfies DocumentClaim;

const TABLE_ROWS_CLAIM = {
  document: DOCUMENT,
  from: SECTION_OPENS,
  to: SECTION_CLOSES,
  states: "table-rows",
} as const satisfies DocumentClaim;

/** The heading the tables of a partitioned enumeration share, and the one a bystander uses. */
const PARTITION_COLUMN = "Export";
const BYSTANDER_COLUMN = "Union";

const PARTITIONED_TABLES_CLAIM = {
  document: DOCUMENT,
  from: SECTION_OPENS,
  to: SECTION_CLOSES,
  states: "partitioned-tables",
  column: PARTITION_COLUMN,
} as const satisfies DocumentClaim;

/**
 * The two headings a pairs row names and the one standing between them, which is the shape of the
 * table this was written for: a slug, an id the row binds nothing to, and a display title.
 */
const KEY_COLUMN = "Key";
const MIDDLE_COLUMN = "Id";
const VALUE_COLUMN = "Title";

/** A pipe in the column standing between the two a row names, escaped as markdown requires. */
const PIPED_MIDDLE_CELL = "alpha-id \\| bravo-id";

const TABLE_PAIRS_CLAIM = {
  document: DOCUMENT,
  from: SECTION_OPENS,
  to: SECTION_CLOSES,
  states: "table-pairs",
  keyColumn: KEY_COLUMN,
  valueColumn: VALUE_COLUMN,
} as const satisfies DocumentClaim;

/** A prose run of backticked names, which is how both `STEP_TEXT` documents state their list. */
function documentNaming(names: string[]): string {
  return [
    `## A Section`,
    ``,
    `The sentinels, ${SECTION_OPENS} ${names.map((name) => `\`${name}\``).join(", ")}.`,
    ``,
    `${SECTION_CLOSES} is another document's business.`,
    ``,
  ].join("\n");
}

/** A table keyed by its first column, which is how `reference/commands/index.md` states its lists. */
function documentTabulating(keys: string[]): string {
  return [
    `## A Section`,
    ``,
    `Everything below, ${SECTION_OPENS}`,
    ``,
    `| Export | Purpose |`,
    `| ------ | ------- |`,
    ...keys.map((key) => `| \`${key}\` | what it does |`),
    ``,
    `${SECTION_CLOSES} is another document's business.`,
    ``,
  ].join("\n");
}

/**
 * A table stating one member per row, with a column between the two the row names.
 *
 * `middleCell` is what that column carries when a test cares — nothing reads it, so what a row
 * writes there can only matter by changing where the cells around it end.
 */
function documentPairing(rows: [key: string, value: string][], middleCell?: string): string {
  return [
    `## A Section`,
    ``,
    `Everything below, ${SECTION_OPENS}`,
    ``,
    `| ${KEY_COLUMN} | ${MIDDLE_COLUMN} | ${VALUE_COLUMN} |`,
    `| ---- | ---- | ---- |`,
    ...rows.map(([key, value]) => {
      const id = middleCell ?? `${key}-id`;

      return `| \`${key}\` | \`${id}\` | \`${value}\` |`;
    }),
    ``,
    `${SECTION_CLOSES} is another document's business.`,
    ``,
  ].join("\n");
}

/** One markdown table, keyed by the heading its first column carries. */
function tableKeyedBy(column: string, keys: string[]): string[] {
  return [
    `| ${column} | Purpose |`,
    `| ------ | ------- |`,
    ...keys.map((key) => `| \`${key}\` | what it does |`),
    ``,
  ];
}

/**
 * An enumeration a document splits across several tables, with a table on another subject standing
 * between them — which is `zod-schemas.md`'s shape, four `Schema` tables around one keyed `Union`.
 */
function documentPartitioning(groups: string[][], bystanders: string[]): string {
  return [
    `## A Section`,
    ``,
    `Everything below, ${SECTION_OPENS}`,
    ``,
    ...groups.flatMap((keys, index) => [
      `### Group ${index}`,
      ``,
      ...tableKeyedBy(PARTITION_COLUMN, keys),
      ...(index === 0 ? tableKeyedBy(BYSTANDER_COLUMN, bystanders) : []),
    ]),
    `${SECTION_CLOSES} is another document's business.`,
    ``,
  ].join("\n");
}

/** The three lists whose declarations were unreadable until `unwrap` read through `satisfies`. */
const SATISFIES_BOUND_CLAIMS = [
  "SKILLS in reference/testing/mock-data.md",
  "E2E_SKILL_TITLES in reference/testing/e2e-infrastructure.md",
  "WIZARD_STEP_ORDER in reference/wizard/state-transitions.md",
];

/** The claims that read a whole directory, which no row could express before. */
const DIRECTORY_BOUND_CLAIMS = [
  "the exported values of __tests__/factories/ in reference/testing/factories.md",
  "the exported values of __tests__/helpers/ in reference/testing/factories.md",
  "the exported values of __tests__/assertions/ in reference/testing/factories.md",
  "the command roster of src/cli/commands/ in reference/commands/index.md",
];

/**
 * Every claim read as `key = value` rather than as keys alone.
 *
 * The first is the row the shape was written for: bound as `table-rows` it reported `agrees` while
 * five of the document's value cells were wrong, because the keys — all either half could reach —
 * were right. The other two are the survey that followed (2026-08-19), and each was measured
 * against the real repository rather than inferred. Every further table the survey looked at was
 * refused, each for a reason in the SOURCE rather than in the document:
 *
 * - `STANDARD_FILES` binds `METADATA_YAML`, `AGENT_METADATA_YAML` and `PLUGIN_JSON` to identifiers
 *   (`METADATA_YAML_FILE`, `PLUGIN_MANIFEST_FILE`) rather than to string literals, and `DIRS` binds
 *   `skills` to `SKILLS_DIR_PATH` — a value `valueOf` refuses rather than guess at.
 * - `SCHEMA_PATHS` writes every value as a template with a substitution, and its document's
 *   value column states the suffix rather than the value — so resolving the templates would still
 *   not agree.
 * - `EXIT_CODES` is numeric, and reading it as pairs needs a deliberate widening of `valueOf`.
 * - `UI_SYMBOLS` is refused twice over: the members bound to the module-private `CHECK_GLYPH` /
 *   `EN_DASH_GLYPH` are identifiers too, and its documents' value column is prose — `unicode
 *   chevron`, `space` — rather than the glyph, which is a correct choice for a table a human reads.
 *
 * Converting any of those is a scope call rather than a mechanical sweep.
 */
const PAIR_BOUND_CLAIMS = [
  "E2E_SKILL_TITLES in reference/testing/e2e-infrastructure.md",
  "STANDARD_DIRS in reference/utilities.md",
  "CLI_COLORS in reference/component-patterns.md",
];

/** The claim that reads a module's RE-EXPORT surface, which neither file reader answers. */
const REEXPORT_BOUND_CLAIMS = [
  "the re-exports of e2e/helpers/test-utils.ts in reference/testing/e2e-infrastructure.md",
];

/**
 * The two documents that each tabulate the whole export list of `configuration/scope-predicates.ts`.
 *
 * Duplication across documents is allowed (owner ruling 2026-08-20) and the checker watches both,
 * which is what a row per document is for: one of them was bound and one was not, so the ninth
 * export would have reddened the owner's table and left the copy in `scope-system.md` reading as
 * authoritative and short by one.
 */
const SCOPE_PREDICATE_CLAIMS = [
  "the exported functions of configuration/scope-predicates.ts in reference/features/configuration.md",
  "the exported functions of configuration/scope-predicates.ts in reference/concepts/scope-system.md",
];

function symbolEntry(claim: DocumentClaim): RegistryEntry {
  return { claim: CLAIM, source: { file: SOURCE_FILE, symbol: SENTINELS }, document: claim };
}

function pairsEntry(claim: DocumentClaim): RegistryEntry {
  return { claim: CLAIM, source: { file: SOURCE_FILE, entries: SENTINELS }, document: claim };
}

function moduleEntry(exports: "const" | "function", claim: DocumentClaim): RegistryEntry {
  return { claim: CLAIM, source: { file: SOURCE_FILE, exports }, document: claim };
}

function barrelEntry(claim: DocumentClaim): RegistryEntry {
  return { claim: CLAIM, source: { file: KIT_BARREL, exports: "function" }, document: claim };
}

function reexportEntry(file: string, claim: DocumentClaim): RegistryEntry {
  return { claim: CLAIM, source: { file, reexports: "every-name" }, document: claim };
}

function directoryEntry(
  directory: string,
  enumerates: "exported-values" | "command-ids",
  claim: DocumentClaim,
): RegistryEntry {
  return { claim: CLAIM, source: { directory, enumerates }, document: claim };
}

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixturePackage(files: Record<string, string>): Promise<string> {
  const root = await createTempDir("enumeration-drift-");
  roots.push(root);

  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(root, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  return root;
}

describe("membership, judged in both directions", () => {
  it("is clean when the document names exactly what the symbol holds", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "CHARLIE"]),
    });

    expect(check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toStrictEqual({
      clean: true,
      verdicts: [{ claim: CLAIM, outcome: "agrees", members: 3 }],
    });
  });

  it("is clean when the document names them in another order", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["CHARLIE", "ALPHA", "BRAVO"]),
    });

    expect(check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }).clean).toBe(true);
  });

  it("reports a name the document has and the source does not, which is the worse direction", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "CHARLIE", "DELTA"]),
    });

    const { clean, verdicts } = check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] });

    expect(clean).toBe(false);
    expect(verdicts).toStrictEqual([
      { claim: CLAIM, outcome: "drifted", namedButAbsent: ["DELTA"], presentButUnnamed: [] },
    ]);
  });

  it("reports a member the source has and the document does not", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO"]),
    });

    expect(
      check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }).verdicts,
    ).toStrictEqual([
      { claim: CLAIM, outcome: "drifted", namedButAbsent: [], presentButUnnamed: ["CHARLIE"] },
    ]);
  });

  it("reports both directions when the totals agree and the membership does not", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "DELTA"]),
    });

    const { clean, verdicts } = check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] });

    expect(
      clean,
      "a check that compares totals passes this, and the document still names a symbol that does not exist",
    ).toBe(false);
    expect(verdicts).toStrictEqual([
      {
        claim: CLAIM,
        outcome: "drifted",
        namedButAbsent: ["DELTA"],
        presentButUnnamed: ["CHARLIE"],
      },
    ]);
  });

  it("judges every registered entry rather than stopping at the first that drifts", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO"]),
    });
    const entry = symbolEntry(CODE_SPANS_CLAIM);

    const { verdicts } = check({ packageRoot, registry: [entry, { ...entry, claim: "second" }] });

    expect(verdicts.map((verdict) => verdict.outcome)).toStrictEqual(["drifted", "drifted"]);
  });
});

describe("what the source is read from", () => {
  it("reads the keys of an exported const object", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentTabulating(["ALPHA", "BRAVO", "CHARLIE"]),
    });

    expect(check({ packageRoot, registry: [symbolEntry(TABLE_ROWS_CLAIM)] }).clean).toBe(true);
  });

  it("reads the string elements of an exported const array", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: ARRAY_SOURCE,
      [DOCUMENT]: documentTabulating(["alpha", "bravo"]),
    });

    expect(check({ packageRoot, registry: [symbolEntry(TABLE_ROWS_CLAIM)] }).clean).toBe(true);
  });

  it("reads the literal members of an exported union type", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: UNION_SOURCE,
      [DOCUMENT]: documentTabulating(["alpha", "bravo"]),
    });

    expect(check({ packageRoot, registry: [symbolEntry(TABLE_ROWS_CLAIM)] }).clean).toBe(true);
  });

  it("reads through a `satisfies` annotation, as it reads through `as`", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: SATISFIES_ARRAY_SOURCE,
      [DOCUMENT]: documentTabulating(["alpha", "bravo"]),
    });

    expect(check({ packageRoot, registry: [symbolEntry(TABLE_ROWS_CLAIM)] }).clean).toBe(true);
  });

  it("reads a `satisfies`-annotated object that carries no `as const`", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: SATISFIES_OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO"]),
    });

    expect(check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }).clean).toBe(true);
  });

  it("reads the literal's members when the `satisfies` constraint names more than it holds", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: WIDER_CONSTRAINT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO"]),
    });

    expect(
      check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }).verdicts,
      "the annotation constrains what the literal may hold, and is not itself a membership list",
    ).toStrictEqual([{ claim: CLAIM, outcome: "agrees", members: 2 }]);
  });

  it("reads a module's exported const names, and none of its functions", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: MIXED_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating(["ALPHA", "BRAVO"]),
    });

    expect(check({ packageRoot, registry: [moduleEntry("const", TABLE_ROWS_CLAIM)] }).clean).toBe(
      true,
    );
  });

  it("reads a module's exported function names, and none of its consts", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: MIXED_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating(["charlie", "delta"]),
    });

    expect(
      check({ packageRoot, registry: [moduleEntry("function", TABLE_ROWS_CLAIM)] }).clean,
    ).toBe(true);
  });
});

/**
 * A directory's own export surface, which is what the three test-utility tables in
 * `reference/testing/factories.md` and the command roster in `reference/commands/index.md` state.
 * None of the four could be expressed while a row named one file: a barrel declares nothing of its
 * own, and there is no file whose members are "the commands under this tree".
 */
describe("a source enumeration that is a directory", () => {
  const KIT_FILES = {
    [KIT_ALPHA]: KIT_ALPHA_SOURCE,
    [KIT_BRAVO]: KIT_BRAVO_SOURCE,
    [KIT_BARREL]: KIT_BARREL_SOURCE,
    [KIT_SPEC]: KIT_SPEC_SOURCE,
  };

  it("refuses a barrel read as a file, because its re-exports declare nothing", async () => {
    const packageRoot = await writeFixturePackage({
      ...KIT_FILES,
      [DOCUMENT]: documentTabulating(["alpha", "bravo"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [barrelEntry(TABLE_ROWS_CLAIM)] }),
      SOURCE_ENUMERATES_NOTHING,
      "the refusal that made these tables unregisterable, and the reason the directory shape exists",
    );
  });

  it("reads every const and function the directory's modules export", async () => {
    const packageRoot = await writeFixturePackage({
      ...KIT_FILES,
      [DOCUMENT]: documentTabulating(["ALPHA_DEFAULT", "alpha", "bravo", "bravoUnbarrelled"]),
    });

    expect(
      check({
        packageRoot,
        registry: [directoryEntry(SOURCE_DIRECTORY, "exported-values", TABLE_ROWS_CLAIM)],
      }).verdicts,
      "the claim is what the directory exports, so a sibling's export the barrel omits is still a member",
    ).toStrictEqual([{ claim: CLAIM, outcome: "agrees", members: 4 }]);
  });

  it("reports an export the directory has and the table does not", async () => {
    const packageRoot = await writeFixturePackage({
      ...KIT_FILES,
      [DOCUMENT]: documentTabulating(["ALPHA_DEFAULT", "alpha", "bravo"]),
    });

    expect(
      check({
        packageRoot,
        registry: [directoryEntry(SOURCE_DIRECTORY, "exported-values", TABLE_ROWS_CLAIM)],
      }).verdicts,
    ).toStrictEqual([
      {
        claim: CLAIM,
        outcome: "drifted",
        namedButAbsent: [],
        presentButUnnamed: ["bravoUnbarrelled"],
      },
    ]);
  });

  it("counts a re-exported name once, and no type-only export at all", async () => {
    const packageRoot = await writeFixturePackage({
      ...KIT_FILES,
      [DOCUMENT]: documentTabulating([
        "ALPHA_DEFAULT",
        "alpha",
        "bravo",
        "bravoUnbarrelled",
        "AlphaOptions",
      ]),
    });

    expect(
      check({
        packageRoot,
        registry: [directoryEntry(SOURCE_DIRECTORY, "exported-values", TABLE_ROWS_CLAIM)],
      }).verdicts,
      "`AlphaOptions` is a type, and the tables that state these directories name values only",
    ).toStrictEqual([
      { claim: CLAIM, outcome: "drifted", namedButAbsent: ["AlphaOptions"], presentButUnnamed: [] },
    ]);
  });

  it("refuses a module that re-exports a whole module, rather than under-reporting it", async () => {
    const packageRoot = await writeFixturePackage({
      [KIT_ALPHA]: KIT_ALPHA_SOURCE,
      [KIT_BARREL]: KIT_STAR_BARREL_SOURCE,
      [DOCUMENT]: documentTabulating(["ALPHA_DEFAULT", "alpha"]),
    });

    expectRefusal(
      () =>
        check({
          packageRoot,
          registry: [directoryEntry(SOURCE_DIRECTORY, "exported-values", TABLE_ROWS_CLAIM)],
        }),
      UNNAMEABLE_REEXPORT,
    );
  });

  it("reads the command id of every module under the tree, topics included", async () => {
    const packageRoot = await writeFixturePackage({
      [`${COMMAND_DIRECTORY}/init.tsx`]: COMMAND_SOURCE,
      [`${COMMAND_DIRECTORY}/list.ts`]: COMMAND_SOURCE,
      [`${COMMAND_DIRECTORY}/build/marketplace.ts`]: COMMAND_SOURCE,
      [`${COMMAND_DIRECTORY}/build/plugins.ts`]: COMMAND_SOURCE,
      [`${COMMAND_DIRECTORY}/init.test.ts`]: COMMAND_SOURCE,
      [DOCUMENT]: documentTabulating(["init", "list", "build marketplace", "build plugins"]),
    });

    expect(
      check({
        packageRoot,
        registry: [directoryEntry(COMMAND_DIRECTORY, "command-ids", TABLE_ROWS_CLAIM)],
      }).verdicts,
    ).toStrictEqual([{ claim: CLAIM, outcome: "agrees", members: 4 }]);
  });

  it("reports a command the tree holds and the roster does not, which is the case that occurred", async () => {
    const packageRoot = await writeFixturePackage({
      [`${COMMAND_DIRECTORY}/init.tsx`]: COMMAND_SOURCE,
      [`${COMMAND_DIRECTORY}/new/marketplace.ts`]: COMMAND_SOURCE,
      [DOCUMENT]: documentTabulating(["init"]),
    });

    expect(
      check({
        packageRoot,
        registry: [directoryEntry(COMMAND_DIRECTORY, "command-ids", TABLE_ROWS_CLAIM)],
      }).verdicts,
      "a live command documented as deleted sends the reader to the editor for something the CLI does",
    ).toStrictEqual([
      {
        claim: CLAIM,
        outcome: "drifted",
        namedButAbsent: [],
        presentButUnnamed: ["new marketplace"],
      },
    ]);
  });

  it("throws when the directory does not exist", async () => {
    const packageRoot = await writeFixturePackage({ [DOCUMENT]: documentTabulating(["alpha"]) });

    expectRefusal(
      () =>
        check({
          packageRoot,
          registry: [directoryEntry(SOURCE_DIRECTORY, "exported-values", TABLE_ROWS_CLAIM)],
        }),
      NO_SOURCE_DIRECTORY,
    );
  });

  it("throws when the directory holds no module, rather than reading it as an empty roster", async () => {
    const packageRoot = await writeFixturePackage({
      [KIT_SPEC]: KIT_SPEC_SOURCE,
      [DOCUMENT]: documentTabulating(["alpha"]),
    });

    expectRefusal(
      () =>
        check({
          packageRoot,
          registry: [directoryEntry(SOURCE_DIRECTORY, "exported-values", TABLE_ROWS_CLAIM)],
        }),
      SOURCE_ENUMERATES_NOTHING,
    );
  });
});

/**
 * A file's RE-EXPORT surface — what a consumer imports from a module that did not write it. The
 * fourth shape, and the one `reference/testing/e2e-infrastructure.md`'s 31-row table needs: the
 * two file readers answer what a module DECLARES, and the directory reader answers a different and
 * larger set from a subject no row naming a file can name.
 *
 * **The design question it turns on: what does a locally-imported-then-re-exported name resolve
 * to?** To the export clause's own spelling, and nothing is followed to say so. The table is a list
 * of what a spec writes in its import statement, and the origin module is prose in the row beside
 * it — so `export { a as b }` answers `b`, and thirteen of the thirty-one names, which reach the
 * block through a local import, answer exactly as they are written there.
 *
 * The imports are read for ONE purpose, and it is the refusal below: a bare block can hand on a
 * name the module DECLARED, and such a declaration carries no export modifier, so `exports:
 * "function"` cannot see it either. The name would fall through both readers and be reported by
 * neither, which is the silent under-report this file refuses everywhere else.
 */
describe("a source enumeration that is a file's re-exports", () => {
  it("reads the names of a bare export block, which no reader could reach from a row naming a file", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: HELPER_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating([
        "alpha",
        "ALPHA_FALLBACK",
        "AlphaOptions",
        "bravo",
        "BravoOptions",
      ]),
    });

    expect(
      check({ packageRoot, registry: [reexportEntry(SOURCE_FILE, TABLE_ROWS_CLAIM)] }).clean,
      "the bare block carries no moduleSpecifier, and it is how thirteen of the thirty-one are written",
    ).toBe(true);
  });

  it("answers the exported spelling of an aliased name, never the origin's", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: HELPER_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating([
        "alpha",
        "ALPHA_DEFAULT",
        "AlphaOptions",
        "bravo",
        "BravoOptions",
      ]),
    });

    const [verdict] = check({
      packageRoot,
      registry: [reexportEntry(SOURCE_FILE, TABLE_ROWS_CLAIM)],
    }).verdicts;

    expect(
      verdict,
      "a document naming the origin's spelling names something no consumer can import",
    ).toStrictEqual({
      claim: CLAIM,
      outcome: "drifted",
      namedButAbsent: ["ALPHA_DEFAULT"],
      presentButUnnamed: ["ALPHA_FALLBACK"],
    });
  });

  it("counts a type-only re-export, unlike the directory reader whose subject is values", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: HELPER_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating(["alpha", "ALPHA_FALLBACK", "bravo"]),
    });

    const [verdict] = check({
      packageRoot,
      registry: [reexportEntry(SOURCE_FILE, TABLE_ROWS_CLAIM)],
    }).verdicts;

    expect(
      verdict?.outcome === "drifted" ? verdict.presentButUnnamed : [],
      "seven of the thirty-one rows this shape was written for are types, in the same table as the values",
    ).toStrictEqual(["AlphaOptions", "BravoOptions"]);
  });

  it("answers nothing for what the module declares, which the two readers beside it already state", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: HELPER_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating([
        "alpha",
        "ALPHA_FALLBACK",
        "AlphaOptions",
        "bravo",
        "BravoOptions",
        "OWN_CONSTANT",
        "own",
      ]),
    });

    const [verdict] = check({
      packageRoot,
      registry: [reexportEntry(SOURCE_FILE, TABLE_ROWS_CLAIM)],
    }).verdicts;

    expect(verdict?.outcome === "drifted" ? verdict.namedButAbsent : []).toStrictEqual([
      "OWN_CONSTANT",
      "own",
    ]);
  });

  it("refuses a bare block handing on a name the module declared, rather than reading it as a re-export", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: HELPER_EXPORTING_ITS_OWN_DECLARATION,
      [DOCUMENT]: documentTabulating(["alpha", "own"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [reexportEntry(SOURCE_FILE, TABLE_ROWS_CLAIM)] }),
      REEXPORTS_A_DECLARATION,
    );
  });

  it("refuses a file re-exporting a whole module, rather than under-reporting it as nothing", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: KIT_STAR_BARREL_SOURCE,
      [DOCUMENT]: documentTabulating(["alpha"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [reexportEntry(SOURCE_FILE, TABLE_ROWS_CLAIM)] }),
      WHOLE_MODULE_REEXPORT,
    );
  });

  it("throws when the file re-exports nothing, rather than reading it as an empty surface", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: MIXED_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating(["ALPHA"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [reexportEntry(SOURCE_FILE, TABLE_ROWS_CLAIM)] }),
      SOURCE_ENUMERATES_NOTHING,
    );
  });

  it("throws when the file does not exist, naming the file rather than the shape", async () => {
    const packageRoot = await writeFixturePackage({ [DOCUMENT]: documentTabulating(["alpha"]) });

    expectRefusal(
      () => check({ packageRoot, registry: [reexportEntry(SOURCE_FILE, TABLE_ROWS_CLAIM)] }),
      NO_SOURCE_FILE,
    );
  });
});

/**
 * A member bound together with its VALUE, which is the half a key-only reading can never judge.
 *
 * The defect was proved on 2026-08-19: `E2E_SKILL_TITLES` was registered, `check()` answered
 * `agrees` over ten members and reported the run clean, and five of the document's Display-title
 * cells were wrong. Neither half of the check could see them — the source side read
 * `property.name.text` and never reached an initializer, and the document side read the first cell
 * of a row and could not reach a second column. A fixture-title rename passed it untouched, and the
 * two halves went on agreeing about the only thing either of them read.
 *
 * **Pairs rather than values, and the reason is the SWAP.** Two rows exchanging their titles leave
 * a values-only set identical and every count intact, so a check reading values alone is blind to
 * the one edit most likely to be made by hand; the set of pairs moves by four members. Pairs also
 * leave the verdict's shape alone — a `string[]` compared in both directions — so nothing
 * downstream of `judgeEntry` learns a second vocabulary to say what a value is.
 */
describe("an enumeration bound as key-value pairs rather than keys alone", () => {
  it("is clean when the two named columns state what the members hold", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TITLED_OBJECT_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First Sentinel"],
        ["bravo", "Second Sentinel"],
        ["charlie", "Third Sentinel"],
      ]),
    });

    expect(
      check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }),
      "an id column stands between the two, and a reader taking the first two columns answers `alpha = alpha-id`",
    ).toStrictEqual({
      clean: true,
      verdicts: [{ claim: CLAIM, outcome: "agrees", members: 3 }],
    });
  });

  it("reports a value cell the source contradicts", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TITLED_OBJECT_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First Sentinel"],
        ["bravo", "Wrong Sentinel"],
        ["charlie", "Third Sentinel"],
      ]),
    });

    expect(
      check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }).verdicts,
    ).toStrictEqual([
      {
        claim: CLAIM,
        outcome: "drifted",
        namedButAbsent: ["bravo = Wrong Sentinel"],
        presentButUnnamed: ["bravo = Second Sentinel"],
      },
    ]);
  });

  it("is the same document the key reader calls clean, which is the defect this closes", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TITLED_OBJECT_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First Sentinel"],
        ["bravo", "Wrong Sentinel"],
        ["charlie", "Third Sentinel"],
      ]),
    });

    expect(
      check({ packageRoot, registry: [symbolEntry(TABLE_ROWS_CLAIM)] }),
      "keys agree in both directions while a value cell is wrong, which is what `agrees, members: 10` meant",
    ).toStrictEqual({ clean: true, verdicts: [{ claim: CLAIM, outcome: "agrees", members: 3 }] });
  });

  it("reports two rows that have exchanged their values, which no reading of values alone can", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TITLED_OBJECT_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First Sentinel"],
        ["bravo", "Third Sentinel"],
        ["charlie", "Second Sentinel"],
      ]),
    });

    expect(
      check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }).verdicts,
      "the set of values is identical across a swap, and so is every count either side could take",
    ).toStrictEqual([
      {
        claim: CLAIM,
        outcome: "drifted",
        namedButAbsent: ["bravo = Third Sentinel", "charlie = Second Sentinel"],
        presentButUnnamed: ["bravo = Second Sentinel", "charlie = Third Sentinel"],
      },
    ]);
  });

  it("refuses a value spelt as a template with a substitution, rather than reading part of it", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TEMPLATE_VALUE_SOURCE,
      [DOCUMENT]: documentPairing([["alpha", "First Sentinel"]]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }),
      UNREADABLE_VALUE,
      "`SCHEMA_PATHS` writes all seven of its values this way, and the text under the substitution is not the value",
    );
  });

  it("refuses a value spelt as a name declared elsewhere, rather than answering the name", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: IDENTIFIER_VALUE_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First Sentinel"],
        ["bravo", "Second Sentinel"],
      ]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }),
      UNREADABLE_VALUE,
      "`STANDARD_FILES.METADATA_YAML` is written this way, and a reader skipping it under-reports by one",
    );
  });

  it("names the member whose value it refused, so the repair is one row and not the symbol", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: IDENTIFIER_VALUE_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First Sentinel"],
        ["bravo", "Second Sentinel"],
      ]),
    });

    expect(() => check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] })).toThrow(
      `bravo in ${SENTINELS}`,
    );
  });

  it("refuses a spread, whose members this literal names on neither side of a pair", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: SPREAD_VALUE_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First Sentinel"],
        ["charlie", "Third Sentinel"],
      ]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }),
      UNREADABLE_MEMBER,
    );
  });

  it("refuses a document whose table carries no column of that name", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TITLED_OBJECT_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First Sentinel"],
        ["bravo", "Second Sentinel"],
        ["charlie", "Third Sentinel"],
      ]).replace(VALUE_COLUMN, "Display title"),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }),
      NO_COLUMN,
      "a renamed heading is a document change the row must be re-pointed at, not a column to guess at",
    );
  });

  it("names the heading it could not find, so a renamed column is repaired where it moved", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TITLED_OBJECT_SOURCE,
      [DOCUMENT]: documentPairing([["alpha", "First Sentinel"]]).replace(
        VALUE_COLUMN,
        "Display title",
      ),
    });

    expect(() => check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] })).toThrow(
      VALUE_COLUMN,
    );
  });

  it("refuses a document whose table carries that heading twice, rather than reading whichever comes first", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TITLED_OBJECT_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First Sentinel"],
        ["bravo", "Second Sentinel"],
        ["charlie", "Third Sentinel"],
      ]).replace(MIDDLE_COLUMN, VALUE_COLUMN),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }),
      AMBIGUOUS_COLUMN,
    );
  });

  it("refuses a key cell naming two members, as the reader beside it does", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TITLED_OBJECT_SOURCE,
      [DOCUMENT]: documentPairing([["alpha` / `bravo", "First Sentinel"]]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }),
      AMBIGUOUS_MEMBER_CELL,
      "one member per row is the contract both readers hold, and it is stated in one place",
    );
  });
});

/**
 * Markdown gives a table cell one escape and no other way to hold a pipe — `\|`, resolved before
 * the cell's inline markup is parsed, which is why it works inside a code span where no other
 * backslash escape does. A reader splitting on a bare `|` therefore disagrees with every renderer
 * of the same page about where a correctly-written cell ends: the row comes out one cell too wide
 * and every column after the escape shifts by one.
 *
 * The two readers that resolve a column POSITIONALLY answer from the shifted row rather than
 * refusing, so the failure is a confident wrong answer — the checker reports a correct document as
 * drifted, and the repair it invites is to edit the document. The key readers beside them take the
 * first cell and are shifted only by a pipe in the member name itself.
 *
 * The separator is spelt exactly as `__tests__/helpers/journey-page.ts` spells it, which reads the
 * journey tables the same way. Two escape-aware readers that disagreed about where a cell ends
 * would be worse than one naive one.
 */
describe("a table cell that holds a pipe", () => {
  it("reads the value column through an escaped pipe standing in the column before it", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: TITLED_OBJECT_SOURCE,
      [DOCUMENT]: documentPairing(
        [
          ["alpha", "First Sentinel"],
          ["bravo", "Second Sentinel"],
          ["charlie", "Third Sentinel"],
        ],
        PIPED_MIDDLE_CELL,
      ),
    });

    expect(
      check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }),
      "a bare split makes this row one cell wider than it renders, and the Title column answers whatever the escape pushed into its place",
    ).toStrictEqual({
      clean: true,
      verdicts: [{ claim: CLAIM, outcome: "agrees", members: 3 }],
    });
  });

  it("reads a value cell holding an escaped pipe as one cell, with the escape resolved", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: PIPED_VALUE_SOURCE,
      [DOCUMENT]: documentPairing([
        ["alpha", "First \\| Sentinel"],
        ["bravo", "Second Sentinel"],
      ]),
    });

    expect(
      check({ packageRoot, registry: [pairsEntry(TABLE_PAIRS_CLAIM)] }),
      "the value the source holds carries the pipe, so a cell read up to the escape states a value nothing holds",
    ).toStrictEqual({
      clean: true,
      verdicts: [{ claim: CLAIM, outcome: "agrees", members: 2 }],
    });
  });
});

describe("what the document is read from", () => {
  it("reads only what lies between the two markers", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: [
        `\`DELTA\` is named before the section opens.`,
        documentNaming(["ALPHA", "BRAVO", "CHARLIE"]),
        `\`ECHO\` is named after it closes.`,
      ].join("\n"),
    });

    expect(check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }).clean).toBe(true);
  });

  it("ignores code spans that are not constant-shaped, which is what a group label is", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "CHARLIE", "init --from", "doctor"]),
    });

    expect(check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }).clean).toBe(true);
  });

  it("reads a table's first column and neither its heading nor its rule", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentTabulating(["ALPHA", "BRAVO", "CHARLIE"]),
    });

    expect(check({ packageRoot, registry: [symbolEntry(TABLE_ROWS_CLAIM)] }).clean).toBe(true);
  });

  it("reads a table row key through the call signature written beside it", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: MIXED_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating(["charlie(count)", "delta(...)"]),
    });

    expect(
      check({ packageRoot, registry: [moduleEntry("function", TABLE_ROWS_CLAIM)] }).clean,
    ).toBe(true);
  });

  it("refuses a cell naming two exports rather than reporting the second as unnamed", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: MIXED_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating(["charlie(count)` / `delta(...)"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [moduleEntry("function", TABLE_ROWS_CLAIM)] }),
      AMBIGUOUS_MEMBER_CELL,
      "the call-signature strip is greedy and end-anchored, so this cell survived as the single valid name `charlie` and the checker reported `delta` — which the document plainly carries — as unnamed",
    );
  });

  it("names the cell it refused, so the row to repair is the one the failure prints", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: MIXED_MODULE_SOURCE,
      [DOCUMENT]: documentTabulating(["charlie(count)` / `delta(...)"]),
    });

    expect(() =>
      check({ packageRoot, registry: [moduleEntry("function", TABLE_ROWS_CLAIM)] }),
    ).toThrow("`charlie(count)` / `delta(...)`");
  });
});

/**
 * An enumeration a document states as several tables rather than one. `zod-schemas.md` partitions
 * its 34 schemas across four, and `table-rows` reads the first and stops — so the row could not be
 * written at all, and the four sub-lists went unbound while the total beside them was maintained.
 */
describe("a document that partitions one enumeration across several tables", () => {
  it("reads every table the section keys the same way", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentPartitioning([["ALPHA"], ["BRAVO"], ["CHARLIE"]], []),
    });

    expect(
      check({ packageRoot, registry: [symbolEntry(PARTITIONED_TABLES_CLAIM)] }).verdicts,
    ).toStrictEqual([{ claim: CLAIM, outcome: "agrees", members: 3 }]);
  });

  it("reads only the first of them under the single-table reader, which is why the row needed a second", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentPartitioning([["ALPHA"], ["BRAVO"], ["CHARLIE"]], []),
    });

    expect(
      check({ packageRoot, registry: [symbolEntry(TABLE_ROWS_CLAIM)] }).verdicts,
    ).toStrictEqual([
      {
        claim: CLAIM,
        outcome: "drifted",
        namedButAbsent: [],
        presentButUnnamed: ["BRAVO", "CHARLIE"],
      },
    ]);
  });

  it("ignores a table on another subject standing between them", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentPartitioning([["ALPHA"], ["BRAVO", "CHARLIE"]], ["SkillId", "Domain"]),
    });

    expect(
      check({ packageRoot, registry: [symbolEntry(PARTITIONED_TABLES_CLAIM)] }).verdicts,
      "the tables of one enumeration share a first-column heading; a table keyed otherwise is a different subject",
    ).toStrictEqual([{ claim: CLAIM, outcome: "agrees", members: 3 }]);
  });

  it("reports a member every one of the tables leaves out", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentPartitioning([["ALPHA"], ["BRAVO"]], []),
    });

    expect(
      check({ packageRoot, registry: [symbolEntry(PARTITIONED_TABLES_CLAIM)] }).verdicts,
    ).toStrictEqual([
      { claim: CLAIM, outcome: "drifted", namedButAbsent: [], presentButUnnamed: ["CHARLIE"] },
    ]);
  });

  it("throws when the column the row names keys no table in the section", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentPartitioning([[]], ["ALPHA", "BRAVO", "CHARLIE"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(PARTITIONED_TABLES_CLAIM)] }),
      DOCUMENT_ENUMERATES_NOTHING,
      "a renamed heading silently drops a whole partition, so it refuses rather than judging the rest",
    );
  });
});

describe("a registry row that would judge nothing", () => {
  it("throws when the source file does not exist", async () => {
    const packageRoot = await writeFixturePackage({
      [DOCUMENT]: documentNaming(["ALPHA"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }),
      NO_SOURCE_FILE,
    );
  });

  it("throws when the source file does not export the symbol", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: `export const OTHER = { ALPHA: "alpha" } as const;\n`,
      [DOCUMENT]: documentNaming(["ALPHA"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }),
      NO_SYMBOL,
    );
  });

  it("throws when the symbol holds no members", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: EMPTY_OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }),
      SOURCE_ENUMERATES_NOTHING,
    );
  });

  it("throws when the symbol holds a member it cannot name, rather than under-reporting by one", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: [
        `const OTHER = { CHARLIE: "charlie" } as const;`,
        `export const ${SENTINELS} = { ALPHA: "alpha", BRAVO: "bravo", ...OTHER } as const;`,
        ``,
      ].join("\n"),
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "CHARLIE"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }),
      UNREADABLE_MEMBER,
    );
  });

  it("throws when the document does not exist", async () => {
    const packageRoot = await writeFixturePackage({ [SOURCE_FILE]: OBJECT_SOURCE });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }),
      NO_DOCUMENT,
    );
  });

  it("throws when the text that opens the section is not in the document", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "CHARLIE"]).replace(SECTION_OPENS, "reworded:"),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }),
      NO_SECTION,
    );
  });

  it("throws when the text that closes the section is not after it", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "CHARLIE"]).replace(
        SECTION_CLOSES,
        "**Moved**",
      ),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }),
      NO_SECTION,
    );
  });

  it("throws when the text that opens the section appears twice, rather than judging one half", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: [
        `An earlier list, ${SECTION_OPENS} \`DELTA\`.`,
        documentNaming(["ALPHA", "BRAVO", "CHARLIE"]),
      ].join("\n"),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }),
      AMBIGUOUS_SECTION,
    );
  });

  it("throws when the section names nothing, rather than reporting the whole symbol as missing", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming([]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] }),
      DOCUMENT_ENUMERATES_NOTHING,
    );
  });

  it("throws when the section holds no table the row reader can key on", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "CHARLIE"]),
    });

    expectRefusal(
      () => check({ packageRoot, registry: [symbolEntry(TABLE_ROWS_CLAIM)] }),
      DOCUMENT_ENUMERATES_NOTHING,
    );
  });

  it("names the claim in every refusal, so the row to repair is the one it prints", async () => {
    const packageRoot = await writeFixturePackage({ [SOURCE_FILE]: OBJECT_SOURCE });

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(CLAIM);
  });
});

describe("this repository", () => {
  it("registers more than one document family, since a single-family check caught one of five", () => {
    expect(REGISTRY.length, "the scan must have something to scan").toBeGreaterThan(0);
    expect(new Set(REGISTRY.map((entry) => entry.document.document)).size).toBeGreaterThan(1);
  });

  it("binds every enumeration whose source is a directory rather than one file", () => {
    const rows = REGISTRY.filter((entry) => DIRECTORY_BOUND_CLAIMS.includes(entry.claim));

    expect(
      rows.map((entry) => entry.claim).sort(),
      "a barrel declares nothing and a command tree is no symbol, so each of these was unregisterable",
    ).toStrictEqual([...DIRECTORY_BOUND_CLAIMS].sort());
    expect(
      check({ registry: rows }).verdicts.filter((verdict) => verdict.outcome === "drifted"),
    ).toStrictEqual([]);
  });

  it("binds the one enumeration whose source is a module's re-exports rather than its declarations", () => {
    const rows = REGISTRY.filter((entry) => "reexports" in entry.source);

    expect(
      rows.map((entry) => entry.claim).sort(),
      "`exports` skips every `export { … }` and the directory reader answers a larger set, so this table was bindable by neither",
    ).toStrictEqual([...REEXPORT_BOUND_CLAIMS].sort());
    expect(
      check({ registry: rows }).verdicts.filter((verdict) => verdict.outcome === "drifted"),
    ).toStrictEqual([]);
  });

  it("binds the one enumeration a document states as four tables rather than one", () => {
    const rows = REGISTRY.filter((entry) => entry.document.states === "partitioned-tables");

    expect(rows.map((entry) => entry.claim)).toStrictEqual([
      "the exported schemas of lib/schemas.ts in reference/types/zod-schemas.md",
    ]);
    expect(
      check({ registry: rows }).verdicts.filter((verdict) => verdict.outcome === "drifted"),
    ).toStrictEqual([]);
  });

  it("binds every list a `satisfies` annotation used to hide from the source reader", () => {
    const rows = REGISTRY.filter((entry) => SATISFIES_BOUND_CLAIMS.includes(entry.claim));

    expect(
      rows.map((entry) => entry.claim).sort(),
      "a list left unregistered is one nothing re-derives, which is what the widening was for",
    ).toStrictEqual([...SATISFIES_BOUND_CLAIMS].sort());
    expect(
      check({ registry: rows }).verdicts.filter((verdict) => verdict.outcome === "drifted"),
    ).toStrictEqual([]);
  });

  it("binds one enumeration duplicated across two documents to both of them", () => {
    const rows = REGISTRY.filter((entry) => SCOPE_PREDICATE_CLAIMS.includes(entry.claim));

    expect(
      rows.map((entry) => entry.claim).sort(),
      "a second copy nothing reads is the one a reader trusts and the ninth export leaves behind",
    ).toStrictEqual([...SCOPE_PREDICATE_CLAIMS].sort());
    const distinctSources = new Set(rows.map((entry) => JSON.stringify(entry.source)));

    expect(
      distinctSources.size,
      "one source read twice — two rows over two sources would not be this claim at all",
    ).toBe(1);
    expect(
      check({ registry: rows }).verdicts.filter((verdict) => verdict.outcome === "drifted"),
    ).toStrictEqual([]);
  });

  it("binds every enumeration read as key-value pairs rather than keys alone", () => {
    const rows = REGISTRY.filter((entry) => entry.document.states === "table-pairs");

    expect(
      rows.map((entry) => entry.claim).sort(),
      "a keys-only binding covers the half of a two-column table that cannot break, and reports agrees while every value cell is wrong",
    ).toStrictEqual([...PAIR_BOUND_CLAIMS].sort());
    expect(
      check({ registry: rows }).verdicts.filter((verdict) => verdict.outcome === "drifted"),
    ).toStrictEqual([]);
  });

  it("states markdown's cell escape identically in both files that carry it", () => {
    const origin = readFileSync(path.join(PACKAGE_ROOT, ESCAPE_RULE_ORIGIN), "utf-8");
    const copy = readFileSync(path.join(PACKAGE_ROOT, ESCAPE_RULE_COPY), "utf-8");

    expect(
      ESCAPE_RULE_DECLARATIONS.filter((declaration) => origin.includes(declaration)),
      "a rule the origin no longer states is one its copy is agreeing with nothing about",
    ).toStrictEqual(ESCAPE_RULE_DECLARATIONS);
    expect(
      ESCAPE_RULE_DECLARATIONS.filter((declaration) => copy.includes(declaration)),
      "two escape-aware readers disagreeing about where a cell ends read a whole column from the wrong place",
    ).toStrictEqual(ESCAPE_RULE_DECLARATIONS);
  });

  it("has no document whose exhaustive list disagrees with the source it enumerates", () => {
    const { clean, verdicts } = check();

    expect(
      verdicts.filter((verdict) => verdict.outcome === "drifted"),
      "a list naming a symbol that no longer exists sends the reader grepping for nothing, after which the document is not trusted at all",
    ).toStrictEqual([]);
    expect(clean).toBe(true);
  });
});
