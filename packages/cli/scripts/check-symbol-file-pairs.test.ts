import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  check,
  NO_DOCUMENT,
  NO_PACKAGE_ROOT,
  NO_PAIRINGS,
  NO_SUCH_MODULE,
} from "./check-symbol-file-pairs.js";
import { expectRefusal } from "./refusal-expectations.js";

const DOCUMENT = "doc.md";
const DIR = path.join("src", "helpers");

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await cleanupTempDir(tempDir);
  tempDir = undefined;
});

async function packageHolding({ module, rows }: { module: string; rows: string }): Promise<string> {
  const root = await createTempDir();
  tempDir = root;

  await mkdir(path.join(root, DIR), { recursive: true });
  await writeFile(path.join(root, DIR, "some-module.ts"), module);
  await writeFile(
    path.join(root, DOCUMENT),
    `## Helpers (\`${DIR.split(path.sep).join("/")}/\`)\n\n| Name | File | Purpose |\n| --- | --- | --- |\n${rows}\n`,
  );

  return root;
}

describe("a symbol paired with the module it lives in", () => {
  it("passes when the named module exports it", async () => {
    const root = await packageHolding({
      module: "export function aHelper(): void {}\n",
      rows: "| `aHelper()` | `some-module.ts` | does a thing |",
    });

    expect(check({ packageRoot: root, document: DOCUMENT }).unbacked).toStrictEqual([]);
  });

  it("is reported when the named module does not export it", async () => {
    const root = await packageHolding({
      module: "export function aHelper(): void {}\n",
      rows: "| `movedAway()` | `some-module.ts` | does a thing |",
    });

    const [only] = check({ packageRoot: root, document: DOCUMENT }).unbacked;

    expect(only?.symbol).toBe("movedAway");
    expect(only?.declares).toStrictEqual(["aHelper"]);
  });

  // The discriminating case, and the whole reason this needs the compiler rather than a grep. A
  // module that IMPORTS the symbol contains the identifier, so a text search is satisfied — and
  // importing from where the symbol actually moved to is exactly the state a move leaves behind.
  it("is reported when the module only imports it, rather than declaring it", async () => {
    const root = await createTempDir();
    tempDir = root;

    await mkdir(path.join(root, DIR), { recursive: true });
    await writeFile(path.join(root, DIR, "elsewhere.ts"), "export function movedAway(): void {}\n");
    await writeFile(
      path.join(root, DIR, "some-module.ts"),
      'import { movedAway } from "./elsewhere.js";\n\nexport const uses = (): void => movedAway();\n',
    );
    await writeFile(
      path.join(root, DOCUMENT),
      `## Helpers (\`${DIR.split(path.sep).join("/")}/\`)\n\n| Name | File | Purpose |\n| --- | --- | --- |\n| \`movedAway()\` | \`some-module.ts\` | moved |\n`,
    );

    const [only] = check({ packageRoot: root, document: DOCUMENT }).unbacked;

    expect(only?.symbol).toBe("movedAway");
    expect(only?.declares).toStrictEqual(["uses"]);
  });

  // A bare module name is not an address, and the section heading is what scopes it. Without this
  // the checker would have to guess between the nineteen `index.ts` files this package holds.
  it("resolves the module under the directory its section names", async () => {
    const root = await packageHolding({
      module: "export function aHelper(): void {}\n",
      rows: "| `aHelper()` | `some-module.ts` | does a thing |",
    });

    expect(check({ packageRoot: root, document: DOCUMENT }).unbacked).toStrictEqual([]);
  });
});

describe("the checker reads what a table CLAIMS, not just its cells", () => {
  // A Consumer column pairs the same two cells to state a different relation — which module USES
  // the symbol — and is true of a module that does not declare it. Judging it condemns a correct
  // row, which is what a first pass over `wizard-flow.md` did.
  it("leaves a table whose second column names a consumer alone", async () => {
    const root = await createTempDir();
    tempDir = root;

    await mkdir(path.join(root, DIR), { recursive: true });
    await writeFile(path.join(root, DIR, "some-module.ts"), "export const uses = 1;\n");
    await writeFile(
      path.join(root, DOCUMENT),
      `## Helpers (\`${DIR.split(path.sep).join("/")}/\`)\n\n| Export | Consumer | Use |\n| --- | --- | --- |\n| \`elsewhere()\` | \`some-module.ts\` | uses it |\n`,
    );

    expectRefusal(() => check({ packageRoot: root, document: DOCUMENT }), NO_PAIRINGS);
  });

  // A module-private helper documented at its own module is CORRECT, so the predicate is
  // "declares" and not "exports". An exports-only version reported three `exec.ts` validators as
  // stale on the first run over the real tree.
  it("accepts a symbol the module declares without exporting", async () => {
    const root = await packageHolding({
      module:
        "function privateHelper(): void {}\n\nexport const used = (): void => privateHelper();\n",
      rows: "| `privateHelper()` | `some-module.ts` | module-private |",
    });

    expect(check({ packageRoot: root, document: DOCUMENT }).unbacked).toStrictEqual([]);
  });

  // A constants table pairs a NAME with a filename it HOLDS, not with a module it lives in — and
  // the file it names is often not in this package at all.
  it("leaves a constants table alone", async () => {
    const root = await packageHolding({
      module: "export const SOME_FILE = 1;\n",
      rows: "| `SKILL_CATEGORIES_TS` | `some-module.ts` | a filename value |",
    });

    expectRefusal(() => check({ packageRoot: root, document: DOCUMENT }), NO_PAIRINGS);
  });
});

describe("the checker refuses a subject it cannot judge", () => {
  it("refuses a package root that is not there", () => {
    expectRefusal(
      () => check({ packageRoot: "/nowhere/at/all", document: DOCUMENT }),
      NO_PACKAGE_ROOT,
    );
  });

  it("refuses a document that is not there", async () => {
    const root = await packageHolding({ module: "export const a = 1;\n", rows: "" });

    expectRefusal(() => check({ packageRoot: root, document: "absent.md" }), NO_DOCUMENT);
  });

  it("refuses a row whose section directory does not hold the module it names", async () => {
    const root = await packageHolding({
      module: "export const a = 1;\n",
      rows: "| `a()` | `not-here.ts` | absent |",
    });

    expectRefusal(() => check({ packageRoot: root, document: DOCUMENT }), NO_SUCH_MODULE);
  });
});

/**
 * Every document stating a symbol's ADDRESS in a table, which is the honest scope of this gate.
 *
 * Not "every document naming a symbol": a naive rule over backticked identifiers in `.ai-docs/`
 * fires on every dependency type, every illustrative name and every historical reference, and that
 * version was measured into the ground before this one was built. A stated position is what makes
 * the claim falsifiable. `agent-findings/` is excluded by construction — findings are dated
 * records, not live claims — and so is any table whose second column names a Consumer or Caller,
 * which states a different relation entirely.
 */
const DOCUMENTS_STATING_AN_ADDRESS: readonly string[] = [
  ".ai-docs/reference/testing/factories.md",
  ".ai-docs/reference/boundary-map.md",
  ".ai-docs/reference/skills/skill-primitives.md",
];

describe("this repository", () => {
  // Arrives GREEN, which is the point of landing it now: a gate that opens with nothing to report
  // is evidence the documents are right, where one opening with a backlog is a repair wearing a
  // gate's clothes. It found one stale row on the way in — `readPluginManifest()` filed under
  // `marketplace-generator.ts` when it lives in `plugins/plugin-finder.ts`, in a document naming
  // the right module fifty lines earlier — fixed before this landed.
  it.each(DOCUMENTS_STATING_AN_ADDRESS)(
    "has no row in %s naming a module that does not declare the symbol",
    (document) => {
      const { unbacked } = check({
        packageRoot: path.resolve(import.meta.dirname, ".."),
        document,
      });

      expect(
        unbacked.map((row) => `${row.dir ?? ""}${row.module}:${row.symbol}`),
        "a row names a module that does not declare the symbol — the helper moved, or the row did",
      ).toStrictEqual([]);
    },
  );
});
