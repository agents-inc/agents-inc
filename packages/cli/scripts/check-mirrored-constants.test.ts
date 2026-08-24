/**
 * Contract for `scripts/check-mirrored-constants.ts` — the scan that every structural value
 * `e2e/pages/constants.ts` mirrors still reads what the product declares.
 *
 * Two halves, like every check beside it. The first drives the check against fixture packages,
 * because a drifted mirror must not exist in this repository at all — the second half is the
 * assertion that none does.
 *
 * The guards get a test each. A mirror that silently stops being judged — a renamed symbol, a
 * withdrawn key, a value that became a reference — reads exactly like a mirror that agrees, and
 * these values are ones whose drift does not announce itself: a wrong `EXIT_CODES.CANCELLED`
 * fails an assertion against the number it expected, and a wrong `TERMINAL_SIZE.SHORT.rows`
 * does not fail at all — every spec using it hangs on the resize prompt until its budget runs out.
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  check,
  MIRRORS,
  NO_KEY,
  NO_SOURCE_FILE,
  NO_SYMBOL,
  NOT_A_LITERAL,
  type Mirror,
} from "./check-mirrored-constants.js";
import { expectRefusal } from "./refusal-expectations.js";

const MIRROR_FILE = "e2e/pages/constants.ts";
const PRODUCT_FILE = "src/exit-codes.ts";

const SYMBOL = "EXIT_CODES";
const NAME = "EXIT_CODES";

/** A code the product declares and the mirror must match — the one direction that is drift. */
const SHARED_KEY = "CANCELLED";
const SHARED_VALUE = 4;

/** A code the MIRROR adds and the product never emits: the shell's, not the CLI's. */
const MIRROR_ONLY = `  UNKNOWN_COMMAND: 127,`;

const RECORD_MIRROR: Mirror = {
  name: NAME,
  kind: "record",
  e2e: { file: MIRROR_FILE, symbol: SYMBOL },
  product: { file: PRODUCT_FILE, symbol: SYMBOL },
};

const VALUE_MIRROR: Mirror = {
  name: "TERMINAL_SIZE.SHORT.rows",
  kind: "value",
  e2e: { file: MIRROR_FILE, symbol: "TERMINAL_SIZE", path: ["SHORT", "rows"] },
  product: { file: PRODUCT_FILE, symbol: "MIN_TERMINAL_SIZE", path: ["ROWS"] },
};

function record(value: number, extra = ""): string {
  return [`export const ${SYMBOL} = {`, `  ${SHARED_KEY}: ${value},`, extra, `} as const;`]
    .filter((line) => line !== "")
    .join("\n");
}

describe("check-mirrored-constants", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root !== undefined) await cleanupTempDir(root);
    root = undefined;
  });

  async function packageWith(files: Record<string, string>): Promise<string> {
    root = await createTempDir();
    for (const [relative, source] of Object.entries(files)) {
      const full = path.join(root, relative);
      mkdirSync(path.dirname(full), { recursive: true });
      writeFileSync(full, source);
    }
    return root;
  }

  describe("a record mirror", () => {
    it("agrees when every code the product declares is mirrored with the same value", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: record(SHARED_VALUE),
        [PRODUCT_FILE]: record(SHARED_VALUE),
      });

      const result = check({ packageRoot, mirrors: [RECORD_MIRROR] });

      expect(result.clean).toBe(true);
      expect(result.verdicts).toStrictEqual([{ name: NAME, outcome: "agrees" }]);
    });

    it("reports the code and both values when one drifts", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: record(SHARED_VALUE),
        [PRODUCT_FILE]: record(7),
      });

      const result = check({ packageRoot, mirrors: [RECORD_MIRROR] });

      expect(result.clean).toBe(false);
      expect(result.verdicts[0]?.outcome).toBe("drifted");
      expect(result.verdicts[0]).toMatchObject({
        detail: expect.stringContaining(SHARED_KEY),
      });
    });

    /**
     * The direction that is NOT drift, and the reason the comparison walks the product's members
     * rather than comparing the two records outright. Without this the E2E tree could not name a
     * status the CLI never emits, and `UNKNOWN_COMMAND: 127` — what a spec sees when `dist/` is
     * absent and the shell answers instead of the binary — would have to be deleted or faked into
     * production.
     */
    it("permits a code the mirror adds and the product never emits", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: record(SHARED_VALUE, MIRROR_ONLY),
        [PRODUCT_FILE]: record(SHARED_VALUE),
      });

      expect(check({ packageRoot, mirrors: [RECORD_MIRROR] }).clean).toBe(true);
    });

    /** The other direction: a code the product GAINS and the mirror lacks is drift. */
    it("reports a code the product declares and the mirror lacks", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: record(SHARED_VALUE),
        [PRODUCT_FILE]: record(SHARED_VALUE, `  RATE_LIMITED: 9,`),
      });

      const result = check({ packageRoot, mirrors: [RECORD_MIRROR] });

      expect(result.clean).toBe(false);
      expect(result.verdicts[0]).toMatchObject({
        detail: expect.stringContaining("RATE_LIMITED"),
      });
    });
  });

  describe("a nested value mirror", () => {
    const mirrorSource = (rows: number): string =>
      `export const TERMINAL_SIZE = { SHORT: { rows: ${rows}, cols: 100 } } as const;`;
    const productSource = (rows: number): string =>
      `export const MIN_TERMINAL_SIZE = { COLS: 80, ROWS: ${rows} } as const;`;

    it("agrees when the mirrored row count is the gate", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: mirrorSource(20),
        [PRODUCT_FILE]: productSource(20),
      });

      expect(check({ packageRoot, mirrors: [VALUE_MIRROR] }).clean).toBe(true);
    });

    it("reports a mirrored row count that no longer tracks the gate", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: mirrorSource(20),
        [PRODUCT_FILE]: productSource(22),
      });

      const result = check({ packageRoot, mirrors: [VALUE_MIRROR] });

      expect(result.clean).toBe(false);
      expect(result.verdicts[0]).toMatchObject({
        detail: expect.stringContaining("22"),
      });
    });

    it("reads a bare const with no path to walk", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: `export const SOURCE_PATHS = { PLUGINS_DIST: "dist/plugins" } as const;`,
        [PRODUCT_FILE]: `export const PLUGINS_DIST_PATH = "dist/plugins";`,
      });

      const mirror: Mirror = {
        name: "SOURCE_PATHS.PLUGINS_DIST",
        kind: "value",
        e2e: { file: MIRROR_FILE, symbol: "SOURCE_PATHS", path: ["PLUGINS_DIST"] },
        product: { file: PRODUCT_FILE, symbol: "PLUGINS_DIST_PATH", path: [] },
      };

      expect(check({ packageRoot, mirrors: [mirror] }).clean).toBe(true);
    });
  });

  describe("guards, so a mirror cannot stop being judged in silence", () => {
    it("refuses a mirror naming a source file that is not there", async () => {
      const packageRoot = await packageWith({ [PRODUCT_FILE]: record(SHARED_VALUE) });

      expectRefusal(() => check({ packageRoot, mirrors: [RECORD_MIRROR] }), NO_SOURCE_FILE);
    });

    it("refuses a mirror naming a symbol its file does not declare", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: `export const SOMETHING_ELSE = { ${SHARED_KEY}: ${SHARED_VALUE} } as const;`,
        [PRODUCT_FILE]: record(SHARED_VALUE),
      });

      expectRefusal(() => check({ packageRoot, mirrors: [RECORD_MIRROR] }), NO_SYMBOL);
    });

    it("refuses a value mirror naming a key its symbol does not hold", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: `export const TERMINAL_SIZE = { TALL: { rows: 60 } } as const;`,
        [PRODUCT_FILE]: `export const MIN_TERMINAL_SIZE = { ROWS: 20 } as const;`,
      });

      expectRefusal(() => check({ packageRoot, mirrors: [VALUE_MIRROR] }), NO_KEY);
    });

    /**
     * A computed value is a claim about how the value is BUILT rather than what it is. Comparing
     * one to a literal would pass while the two differ, so it is refused rather than read.
     */
    it("refuses a value that is a reference rather than a literal", async () => {
      const packageRoot = await packageWith({
        [MIRROR_FILE]: `const GATE = 20;\nexport const TERMINAL_SIZE = { SHORT: { rows: GATE, cols: 100 } } as const;`,
        [PRODUCT_FILE]: `export const MIN_TERMINAL_SIZE = { ROWS: 20 } as const;`,
      });

      expectRefusal(() => check({ packageRoot, mirrors: [VALUE_MIRROR] }), NOT_A_LITERAL);
    });
  });

  describe("this repository", () => {
    it("registers the mirrors that name a production original", () => {
      expect(MIRRORS.length).toBeGreaterThan(0);
    });

    it("mirrors every structural constant without drift", () => {
      const result = check();

      const drifted = result.verdicts.filter((verdict) => verdict.outcome === "drifted");

      expect(
        drifted,
        "e2e/pages/constants.ts mirrors these deliberately, so a drift here is a value the E2E suite asserts against and the product no longer declares",
      ).toStrictEqual([]);
    });
  });
});
