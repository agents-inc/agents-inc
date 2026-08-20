import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { seedDefaultSourceCache } from "../fixtures/default-source-cache.js";
import { cleanupTempDir, createTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";
import { BUILT_IN_MATRIX } from "../../src/cli/types/generated/matrix.js";
import type { SkillId } from "../../src/cli/types/index.js";

/**
 * The skill the checkout will not carry. Constrained to `SkillId`, so retiring it from the
 * catalogue reddens this line rather than leaving the fixture seeding a skill that no longer
 * exists and the spec asserting a name nothing would ever print.
 *
 * It is the id that produced the report: `BUILT_IN_MATRIX` named it while the marketplace on
 * GitHub did not, and every default-source eject died on it.
 */
const ABSENT_FROM_THE_CHECKOUT = "meta-reviewing-infra-reviewing" as const satisfies SkillId;

/**
 * `eject skills` from the DEFAULT public marketplace, against a checkout that is missing one skill
 * the catalogue names.
 *
 * **No other spec ejects from the default source, and that is why this failure was never seen.**
 * Every other source a spec names is a directory, and for a directory the matrix is built from the
 * files — the two cannot disagree. The default source is the one place they are separate artefacts:
 * `BUILT_IN_MATRIX` is vendored into the binary, the files come from a fetched checkout, and any
 * user whose CLI predates a marketplace change holds a pair that disagrees with no way to reconcile
 * them. What the run printed was the filesystem's own `ENOENT`, naming a path inside the source
 * cache — an address the user did not choose, cannot place and cannot act on — and, because one
 * `Promise.all` rejection discards its siblings', it named at most one skill per run.
 *
 * The whole thing is offline: the fixture seeds the cache directory `fetchFromSource` resolves to,
 * with the record shape that answers "current" without a network call.
 */
describe("eject skills from the default marketplace, against a checkout missing one of them", () => {
  let projectDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (projectDir) await cleanupTempDir(projectDir);
    projectDir = undefined;
  });

  it("refuses, naming the skill the checkout does not carry", async () => {
    const home = await createTempDir();
    projectDir = home;
    expect(
      Object.keys(BUILT_IN_MATRIX.skills),
      "the fixture omits this skill from a catalogue that must otherwise name it",
    ).toContain(ABSENT_FROM_THE_CHECKOUT);
    await seedDefaultSourceCache(home, { omitting: ABSENT_FROM_THE_CHECKOUT });

    const { exitCode, output } = await CLI.run(
      ["eject", "skills"],
      { dir: home },
      { env: { HOME: home } },
    );

    expect(exitCode, `eject should have refused: ${output}`).toBe(EXIT_CODES.ERROR);
    const collapsed = output.replace(/›/g, " ").replace(/\s+/g, " ");
    expect(
      collapsed,
      "an ENOENT names a cache path; the id is the only part of the failure a user can act on",
    ).toContain(`${ABSENT_FROM_THE_CHECKOUT}: ENOENT`);
    // `toContain` over a multi-line refusal is satisfied by one line, so the id assertion above
    // holds just as well when the fixture broke every other skill too. The count line is the only
    // part that says how many failed, and pinning it is what separates the seeded defect from a
    // fixture that mis-seeded the catalogue. The failure count and the word are asserted, never
    // the total — that moves whenever the catalogue grows.
    expect(
      collapsed,
      "exactly the one skill the checkout omits may fail; a wider count is the fixture's fault",
    ).toContain("Could not copy 1 of ");
  });
});
