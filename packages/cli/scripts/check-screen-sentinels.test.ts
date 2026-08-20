/**
 * Contract for `scripts/check-screen-sentinels.ts` — the scan that every E2E constant a page object
 * WAITS on still reads the string the product paints.
 *
 * Two halves, like every check beside it. The first drives the check against fixture packages,
 * because a drifted pair must not exist in this repository at all — the second half is the
 * assertion that none does.
 *
 * The guards get a test each. A pair that silently stops being judged — a renamed symbol, a
 * withdrawn key, a label built at runtime instead of declared — reads exactly like a pair that
 * agrees, and the whole reason this file exists is that a drift which fails by TIMING OUT looks
 * nothing like a drift that fails by asserting.
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  check,
  labelledScreens,
  NO_KEY,
  NO_SOURCE_FILE,
  NO_SYMBOL,
  NOT_A_STRING,
  PAIRS,
  type SentinelPair,
  type TableAddress,
  UNNAMEABLE_MEMBER,
} from "./check-screen-sentinels.js";

const SENTINEL_FILE = "e2e/pages/constants.ts";
const PRODUCT_FILE = "src/screen.tsx";

const PAIR = "SOURCES";
const SENTINEL_SYMBOL = "STEP_TEXT";
const PRODUCT_SYMBOL = "STEP_DROPDOWN_LABEL";
const SENTINEL_KEY = "SOURCES";
const PRODUCT_KEY = "sources";

const SUBTITLE = "Customize skill sources";

function sentinelSource(text: string): string {
  return [
    `export const ${SENTINEL_SYMBOL} = {`,
    `  STACK: "Choose a stack",`,
    `  ${SENTINEL_KEY}: ${JSON.stringify(text)},`,
    `} as const;`,
    ``,
  ].join("\n");
}

/** `Partial<Record<...>>` with no `as const`, which is how the product declares its label table. */
function productSource(text: string): string {
  return [
    `type Step = "stack" | "sources";`,
    ``,
    `const ${PRODUCT_SYMBOL}: Partial<Record<Step, string>> = {`,
    `  stack: "Choose a stack",`,
    `  ${PRODUCT_KEY}: ${JSON.stringify(text)},`,
    `};`,
    ``,
    `export const rendered = ${PRODUCT_SYMBOL};`,
    ``,
  ].join("\n");
}

const PRODUCT_LABEL_TABLE: TableAddress = { file: PRODUCT_FILE, symbol: PRODUCT_SYMBOL };

const PAIR_ENTRY: SentinelPair = {
  pair: PAIR,
  sentinel: { file: SENTINEL_FILE, symbol: SENTINEL_SYMBOL, key: SENTINEL_KEY },
  product: { file: PRODUCT_FILE, symbol: PRODUCT_SYMBOL, key: PRODUCT_KEY },
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixturePackage(files: Record<string, string>): Promise<string> {
  const root = await createTempDir("screen-sentinels-");
  roots.push(root);

  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(root, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  return root;
}

describe("a sentinel and the product string it duplicates", () => {
  it("agrees when the two literals read the same", async () => {
    const packageRoot = await writeFixturePackage({
      [SENTINEL_FILE]: sentinelSource(SUBTITLE),
      [PRODUCT_FILE]: productSource(SUBTITLE),
    });

    expect(check({ packageRoot, pairs: [PAIR_ENTRY] })).toStrictEqual({
      clean: true,
      verdicts: [{ pair: PAIR, outcome: "agrees", text: SUBTITLE }],
    });
  });

  it("reports the mirror moving alone, which is the direction that only times out", async () => {
    const packageRoot = await writeFixturePackage({
      [SENTINEL_FILE]: sentinelSource("Customize skill origins"),
      [PRODUCT_FILE]: productSource(SUBTITLE),
    });

    const { clean, verdicts } = check({ packageRoot, pairs: [PAIR_ENTRY] });

    expect(
      clean,
      "the unit suite is green on this and a dozen wizard specs each burn the full wizard-load budget",
    ).toBe(false);
    expect(verdicts).toStrictEqual([
      {
        pair: PAIR,
        outcome: "drifted",
        sentinel: "Customize skill origins",
        product: SUBTITLE,
      },
    ]);
  });

  it("reports the product moving alone, the direction a unit spec already covers", async () => {
    const packageRoot = await writeFixturePackage({
      [SENTINEL_FILE]: sentinelSource(SUBTITLE),
      [PRODUCT_FILE]: productSource("Pick your sources"),
    });

    expect(check({ packageRoot, pairs: [PAIR_ENTRY] }).verdicts).toStrictEqual([
      { pair: PAIR, outcome: "drifted", sentinel: SUBTITLE, product: "Pick your sources" },
    ]);
  });

  it("judges every pair rather than stopping at the first that drifts", async () => {
    const packageRoot = await writeFixturePackage({
      [SENTINEL_FILE]: sentinelSource("moved"),
      [PRODUCT_FILE]: productSource(SUBTITLE),
    });

    const { verdicts } = check({
      packageRoot,
      pairs: [PAIR_ENTRY, { ...PAIR_ENTRY, pair: "second" }],
    });

    expect(verdicts.map((verdict) => verdict.outcome)).toStrictEqual(["drifted", "drifted"]);
  });
});

describe("a pair that would judge nothing", () => {
  it("throws when a file does not exist", async () => {
    const packageRoot = await writeFixturePackage({ [SENTINEL_FILE]: sentinelSource(SUBTITLE) });

    expect(() => check({ packageRoot, pairs: [PAIR_ENTRY] })).toThrow(NO_SOURCE_FILE);
  });

  it("throws when a file no longer declares the symbol", async () => {
    const packageRoot = await writeFixturePackage({
      [SENTINEL_FILE]: sentinelSource(SUBTITLE),
      [PRODUCT_FILE]: productSource(SUBTITLE).replace(PRODUCT_SYMBOL, "RENAMED_LABELS"),
    });

    expect(() => check({ packageRoot, pairs: [PAIR_ENTRY] })).toThrow(NO_SYMBOL);
  });

  it("throws when the symbol no longer holds the key", async () => {
    const packageRoot = await writeFixturePackage({
      [SENTINEL_FILE]: sentinelSource(SUBTITLE),
      [PRODUCT_FILE]: productSource(SUBTITLE).replace(`${PRODUCT_KEY}:`, "origins:"),
    });

    expect(() => check({ packageRoot, pairs: [PAIR_ENTRY] })).toThrow(NO_KEY);
  });

  it("throws when the key holds something other than a literal string", async () => {
    const packageRoot = await writeFixturePackage({
      [SENTINEL_FILE]: sentinelSource(SUBTITLE),
      [PRODUCT_FILE]: productSource(SUBTITLE).replace(
        JSON.stringify(SUBTITLE),
        "`Customize ${noun}`",
      ),
    });

    expect(
      () => check({ packageRoot, pairs: [PAIR_ENTRY] }),
      "a composed label is a different claim, and comparing it to a fragment would be a false green",
    ).toThrow(NOT_A_STRING);
  });

  it("names the pair in every refusal, so the row to repair is the one it prints", async () => {
    const packageRoot = await writeFixturePackage({ [SENTINEL_FILE]: sentinelSource(SUBTITLE) });

    expect(() => check({ packageRoot, pairs: [PAIR_ENTRY] })).toThrow(PAIR);
  });
});

describe("the product's own label table", () => {
  it("names the screens the product gives a subtitle, which a hand-written roster cannot supply", async () => {
    const packageRoot = await writeFixturePackage({ [PRODUCT_FILE]: productSource(SUBTITLE) });

    expect(labelledScreens({ packageRoot, labels: PRODUCT_LABEL_TABLE })).toStrictEqual([
      "stack",
      PRODUCT_KEY,
    ]);
  });

  it("refuses a table holding a member it cannot name, rather than reading a shorter roster", async () => {
    const packageRoot = await writeFixturePackage({
      [PRODUCT_FILE]: productSource(SUBTITLE).replace(
        `  stack: "Choose a stack",`,
        "  ...OTHER_LABELS,",
      ),
    });

    expect(
      () => labelledScreens({ packageRoot, labels: PRODUCT_LABEL_TABLE }),
      "a spread would drop every screen behind it, which is the roster silently shrinking",
    ).toThrow(UNNAMEABLE_MEMBER);
  });
});

/**
 * A screen the product gives a subtitle that deliberately carries no sentinel. Empty today, and a
 * list rather than nothing on purpose: a screen leaves the roster by being named here with a
 * reason, never by being absent from it.
 */
const SCREENS_WITHOUT_A_SENTINEL: string[] = [];

describe("this repository", () => {
  it("registers every wizard screen the product gives a subtitle", () => {
    const registered = PAIRS.map((entry) => entry.product.key).sort();
    const labelled = labelledScreens()
      .filter((screen) => !SCREENS_WITHOUT_A_SENTINEL.includes(screen))
      .sort();

    expect(
      registered,
      "a screen arriving in the product's table with no row here waits on nothing, and a roster compared to a copy of itself missed a fifth one",
    ).toStrictEqual(labelled);
  });

  it("has no sentinel whose string the product no longer paints", () => {
    const { clean, verdicts } = check();

    expect(
      verdicts.filter((verdict) => verdict.outcome === "drifted"),
      "drift here does not fail an assertion — it hangs every spec that reaches the screen for the full wizard-load budget",
    ).toStrictEqual([]);
    expect(clean).toBe(true);
  });
});
