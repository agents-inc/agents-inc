import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { producerRostersIn } from "./helpers/producer-rosters.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const EVERY_SPEC = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "e2e/**/*.test.ts",
  "scripts/**/*.test.ts",
];

/**
 * A spec comparing several producers must derive its roster from the tree: a hand-gathered roster
 * cannot see the producer nobody gathered. Only rosters of callables are gated; wider recognisers
 * condemn legitimate test data.
 */
describe("a spec comparing several producers derives its roster from the tree", () => {
  /** Keep empty: an entry is a spec that stays green while a forgotten producer goes unjudged. */
  const CANNOT_BE_DERIVED: readonly string[] = [];

  async function rostersInTheTree(): Promise<{ site: string; derived: boolean }[]> {
    const specs = (await fg(EVERY_SPEC, { cwd: CLI_ROOT })).sort();

    const scanned = await Promise.all(
      specs.map(async (file) => {
        const source = await readFile(path.join(CLI_ROOT, file), "utf8");
        return producerRostersIn(source, file).map((roster) => ({
          site: `${file}: ${roster.name}`,
          derived: roster.derived,
        }));
      }),
    );

    return scanned.flat();
  }

  it("holds every roster of producers against a walk", async () => {
    const rosters = await rostersInTheTree();

    expect(
      rosters.length,
      "no roster of producers was found anywhere — the scan has stopped reading",
    ).toBeGreaterThan(0);

    expect(
      rosters.filter((roster) => !roster.derived).map((roster) => roster.site),
      "this spec compares the producers its author gathered, so the one nobody gathered is invisible — hold the roster's membership against a walk of the tree, or add it to CANNOT_BE_DERIVED with what makes a walk impossible",
    ).toStrictEqual(CANNOT_BE_DERIVED);
  });
});
