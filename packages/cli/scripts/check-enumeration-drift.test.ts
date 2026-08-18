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
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  AMBIGUOUS_SECTION,
  check,
  type DocumentClaim,
  DOCUMENT_ENUMERATES_NOTHING,
  NO_DOCUMENT,
  NO_SECTION,
  NO_SOURCE_FILE,
  NO_SYMBOL,
  REGISTRY,
  type RegistryEntry,
  SOURCE_ENUMERATES_NOTHING,
  UNREADABLE_MEMBER,
} from "./check-enumeration-drift.js";

const SOURCE_FILE = "src/sentinels.ts";
const DOCUMENT = "docs/reference.md";
const CLAIM = "SENTINELS in docs/reference.md";

const SECTION_OPENS = "enumerated exhaustively:";
const SECTION_CLOSES = "**Everything else**";

const SENTINELS = "SENTINELS";

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

function symbolEntry(claim: DocumentClaim): RegistryEntry {
  return { claim: CLAIM, source: { file: SOURCE_FILE, symbol: SENTINELS }, document: claim };
}

function moduleEntry(exports: "const" | "function", claim: DocumentClaim): RegistryEntry {
  return { claim: CLAIM, source: { file: SOURCE_FILE, exports }, document: claim };
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
});

describe("a registry row that would judge nothing", () => {
  it("throws when the source file does not exist", async () => {
    const packageRoot = await writeFixturePackage({
      [DOCUMENT]: documentNaming(["ALPHA"]),
    });

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(
      NO_SOURCE_FILE,
    );
  });

  it("throws when the source file does not export the symbol", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: `export const OTHER = { ALPHA: "alpha" } as const;\n`,
      [DOCUMENT]: documentNaming(["ALPHA"]),
    });

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(
      NO_SYMBOL,
    );
  });

  it("throws when the symbol holds no members", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: EMPTY_OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA"]),
    });

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(
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

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(
      UNREADABLE_MEMBER,
    );
  });

  it("throws when the document does not exist", async () => {
    const packageRoot = await writeFixturePackage({ [SOURCE_FILE]: OBJECT_SOURCE });

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(
      NO_DOCUMENT,
    );
  });

  it("throws when the text that opens the section is not in the document", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "CHARLIE"]).replace(SECTION_OPENS, "reworded:"),
    });

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(
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

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(
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

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(
      AMBIGUOUS_SECTION,
    );
  });

  it("throws when the section names nothing, rather than reporting the whole symbol as missing", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming([]),
    });

    expect(() => check({ packageRoot, registry: [symbolEntry(CODE_SPANS_CLAIM)] })).toThrow(
      DOCUMENT_ENUMERATES_NOTHING,
    );
  });

  it("throws when the section holds no table the row reader can key on", async () => {
    const packageRoot = await writeFixturePackage({
      [SOURCE_FILE]: OBJECT_SOURCE,
      [DOCUMENT]: documentNaming(["ALPHA", "BRAVO", "CHARLIE"]),
    });

    expect(() => check({ packageRoot, registry: [symbolEntry(TABLE_ROWS_CLAIM)] })).toThrow(
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

  it("has no document whose exhaustive list disagrees with the source it enumerates", () => {
    const { clean, verdicts } = check();

    expect(
      verdicts.filter((verdict) => verdict.outcome === "drifted"),
      "a list naming a symbol that no longer exists sends the reader grepping for nothing, after which the document is not trusted at all",
    ).toStrictEqual([]);
    expect(clean).toBe(true);
  });
});
