import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { frozenHomeConstantsIn } from "./helpers/frozen-home-declarations.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const EVERY_CLI_MODULE = "src/cli/**/*.{ts,tsx}";

/** A floor, not a census: a glob matching nothing would report a clean roster. */
const MODULES_THE_TREE_HOLDS = 200;

/**
 * `runCliCommand` drives a second module graph through `dist/`, so a home-derived constant frozen
 * at import settles on the first spec's fake home. `home-dir-read-at-call-time.test.ts` holds the
 * functions that replaced such constants to the home in force.
 */
describe("no constant in the CLI's source freezes the home directory at import", () => {
  it("names no exported constant derived from os.homedir(), across every module", async () => {
    const files = await fg(EVERY_CLI_MODULE, { cwd: CLI_ROOT });
    expect(
      files.length,
      "a glob matching nothing would report a clean tree without reading one",
    ).toBeGreaterThan(MODULES_THE_TREE_HOLDS);

    const frozen = (
      await Promise.all(
        files.sort().map(async (file) => {
          const source = await readFile(path.join(CLI_ROOT, file), "utf8");
          return frozenHomeConstantsIn(source).map((name) => `${file}:${name}`);
        }),
      )
    ).flat();

    expect(
      frozen,
      "a constant derived from os.homedir() freezes whichever home its module was first imported under — export a function instead, as globalInstallRoot() and cacheRoot() do",
    ).toStrictEqual([]);
  });
});
