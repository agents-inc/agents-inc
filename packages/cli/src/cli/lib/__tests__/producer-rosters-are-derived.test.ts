import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { producerRostersIn } from "./helpers/producer-rosters.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Every spec the package holds, whichever of its suites collects it. */
const EVERY_SPEC = [
  "src/**/*.test.ts",
  "src/**/*.test.tsx",
  "e2e/**/*.test.ts",
  "scripts/**/*.test.ts",
];

/**
 * A spec whose subject is AGREEMENT BETWEEN SEVERAL PRODUCERS holds its roster of producers
 * against a walk of the tree.
 *
 * Such a spec is green by construction. It compares the producers its author gathered, so the
 * one nobody gathered is invisible — which is exactly the recurrence it was written against.
 * Two specs here had already gone stale that way: the toast roster lost the toast its own
 * subject had most recently produced, and the kebab-case roster's docblock claimed it "goes red
 * the day a fourth judge is written with a hand-rolled regex" while holding no tree walk that
 * could see one. A fourth judge was in the tree when that sentence was written.
 *
 * **The shape this gate reaches is a roster of CALLABLES, and that is the whole of its claim.**
 * A roster whose members are functions reaching product code is a roster of code paths and
 * cannot be anything else. Every wider recogniser measured against this tree condemned test
 * data with it — a roster of file paths, of exported symbol names, or of any subset of an
 * enumeration the tree declares reads, in syntax, exactly like the inputs a spec is
 * parameterised by. `NAMES` in `kebab-name-judges-agree.test.ts` is the case that settles it:
 * it is correctly hand-written, correctly discriminating, and parameterises the same assertions
 * the judges do. A gate condemning both is one that gets silenced.
 *
 * So the other half of the class is deliberately ungated, and the two instances that produced
 * this gate carry their own derivations instead. `producer-rosters.test.ts` is where the shapes
 * this reader accepts and refuses are planted, because a scan reporting nothing across a clean
 * tree is indistinguishable from one that cannot report.
 */
describe("a spec comparing several producers derives its roster from the tree", () => {
  /**
   * Rosters that cannot be derived, each standing as the reason rather than as an oversight.
   *
   * Empty, and that is the state to keep it in: an entry here is a spec that will keep passing
   * while the producer nobody remembered goes unjudged, which is the whole defect. An entry has
   * to be worth that, and it has to say what makes the walk impossible rather than awkward.
   */
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

    // Subject guard: a glob that matched nothing, or a reader that recognised none of what it
    // matched, satisfies the comparison below for free. It asks only whether the scan is
    // READING — the shapes it accepts and refuses are proved beside the reader, on fixtures.
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
