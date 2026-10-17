import { afterEach, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { seedDefaultSourceCache } from "../fixtures/default-source-cache.js";
import { cleanupTempDir, createTempDir } from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";
import { BUILT_IN_MATRIX } from "../../src/cli/types/generated/matrix.js";
import type { SkillId } from "../../src/cli/types/index.js";

/** Constrained to `SkillId`, so retiring it from the catalogue reddens this line. */
const ABSENT_FROM_THE_CHECKOUT = "meta-reviewing-infra-reviewing" as const satisfies SkillId;

/**
 * `eject skills` from the default marketplace against a checkout missing a skill `BUILT_IN_MATRIX`
 * names: the only source where matrix and files can disagree. Offline: the fixture seeds the cache
 * `fetchFromSource` reads as current.
 */
describe("eject skills from the default marketplace, against a checkout missing one of them", () => {
  let projectDir: string | undefined;

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
    // `toContain` is satisfied by one line, so the failure count is what pins one seeded defect;
    // never the total, which grows with the catalogue.
    expect(
      collapsed,
      "exactly the one skill the checkout omits may fail; a wider count is the fixture's fault",
    ).toContain("Could not copy 1 of ");
  });
});
