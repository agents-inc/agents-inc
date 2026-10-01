import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Linter } from "eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../test-fs-utils.js";
import { type LintZone, lintZonesIn } from "./lint-zones.js";

const RULE = "no-restricted-syntax";

/**
 * The tree every case below is read against, small enough to state and to reason about.
 *
 * `dist/bundled.ts` sorts FIRST, so any case that answers with it is a case where an ignore was
 * not applied — which is the whole of what the bare-directory ignore case asserts. `types.d.ts`
 * is the only file its own case selects, so a subject of anything but `null` there is the ambient
 * exclusion having failed.
 */
const TREE = [
  "dist/bundled.ts",
  "src/a.ts",
  "src/spec.test.ts",
  "src/extra/x.ts",
  "types.d.ts",
] as const;

/** A block that declares the rule for the files it names, which is all a zone is. */
function declaring(files: (string | string[])[]): Linter.Config {
  return { files, rules: { [RULE]: "error" } };
}

/** A block that declares something else entirely — it is not a zone and must not become one. */
function silentAbout(files: string[]): Linter.Config {
  return { files, rules: { "no-console": "error" } };
}

let tree = "";

/** The zones the helper derives from `config` over the fixture tree. */
function zonesIn(config: Linter.Config[]): LintZone[] {
  return lintZonesIn(config, RULE, tree);
}

beforeAll(async () => {
  tree = await createTempDir("lint-zones-");
  for (const file of TREE) {
    await mkdir(path.dirname(path.join(tree, file)), { recursive: true });
    await writeFile(path.join(tree, file), "export const x = 1;\n", "utf8");
  }
});

afterAll(async () => {
  await cleanupTempDir(tree);
});

describe("the zones a config splits a rule into are read off the config", () => {
  it("gives a zone to every block that declares the rule, and to no block that does not", () => {
    expect(
      zonesIn([silentAbout(["src/**/*.ts"]), declaring(["src/**/*.ts"]), silentAbout(["**/*.ts"])]),
    ).toStrictEqual([{ patterns: "src/**/*.ts", subject: "src/a.ts" }]);
  });

  it("hands a zone a file its own block owns, not one a later block has taken", () => {
    expect(zonesIn([declaring(["src/**/*.ts"]), declaring(["**/*.test.ts"])])).toStrictEqual([
      { patterns: "src/**/*.ts", subject: "src/a.ts" },
      { patterns: "**/*.test.ts", subject: "src/spec.test.ts" },
    ]);
  });

  /**
   * The property the whole derivation exists for, and the one a hand-written roster could not
   * hold: a new zone is measured because the config declares it, not because anyone
   * remembered to add a row for it.
   */
  it("grows by itself when a block is added, with no roster to extend", () => {
    const before = [declaring(["src/**/*.ts"]), declaring(["**/*.test.ts"])];
    const after = [...before, declaring(["src/extra/**/*.ts"])];

    expect(zonesIn(after)).toStrictEqual([
      ...zonesIn(before),
      { patterns: "src/extra/**/*.ts", subject: "src/extra/x.ts" },
    ]);
  });

  /**
   * A zone nothing can be linted as is reported, never skipped. Skipping is how the roster went
   * short in the first place, and a dropped zone and a passing one read identically.
   */
  it("answers null for a block whose every file a later block owns", () => {
    expect(zonesIn([declaring(["src/spec.test.ts"]), declaring(["**/*.test.ts"])])).toStrictEqual([
      { patterns: "src/spec.test.ts", subject: null },
      { patterns: "**/*.test.ts", subject: "src/spec.test.ts" },
    ]);
  });

  it("answers null for a block selecting only ambient files, which no fixture can be linted as", () => {
    expect(zonesIn([declaring(["**/*.d.ts"])])).toStrictEqual([
      { patterns: "**/*.d.ts", subject: null },
    ]);
  });

  it("applies a global ignore written as a bare directory name", () => {
    expect(zonesIn([{ ignores: ["dist"] }, declaring(["**/*.ts"])])).toStrictEqual([
      { patterns: "**/*.ts", subject: "src/a.ts" },
    ]);
  });

  it("applies a block's own ignores as well as the config's global ones", () => {
    expect(
      zonesIn([{ ignores: ["dist"] }, { ...declaring(["**/*.ts"]), ignores: ["src/a.ts"] }]),
    ).toStrictEqual([{ patterns: "**/*.ts", subject: "src/extra/x.ts" }]);
  });

  it("reads a nested pattern array as ESLint's AND rather than as two selectors", () => {
    expect(zonesIn([declaring([["src/**/*.ts", "**/*.test.ts"]])])).toStrictEqual([
      { patterns: "src/**/*.ts & **/*.test.ts", subject: "src/spec.test.ts" },
    ]);
  });

  it("treats a block with no files as selecting everything the config reaches", () => {
    expect(zonesIn([{ ignores: ["dist"] }, { rules: { [RULE]: "error" } }])).toStrictEqual([
      { patterns: "**/*", subject: "src/a.ts" },
    ]);
  });

  it("refuses a config no block declares the rule in, rather than reporting no zones", () => {
    expect(() => zonesIn([silentAbout(["**/*.ts"])])).toThrow(RULE);
  });
});
