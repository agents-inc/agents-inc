import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { seedDefaultSourceCache } from "../../../../e2e/fixtures/default-source-cache.js";
import { LOCAL_PSEUDO_CATEGORY, SOURCE_SRC_DIR, STANDARD_FILES } from "../../consts.js";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix.js";
import type { Category, CategoryPath, Domain, SkillId } from "../../types/index.js";
import { readSkillMetadata } from "../loading/loader.js";
import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";

/** Left out of the seeded cache, as both specs seeding it leave it out. */
const OMITTED = "meta-reviewing-infra-reviewing" as const satisfies SkillId;

const REACT = "web-framework-react" as const satisfies SkillId;

/** REACT's category in the catalogue, which the table declares. */
const REACT_CATEGORY = "web-framework" as const satisfies Category;

/** One catalogue skill from each of three domains, so one domain answered for all cannot pass. */
const ONE_SKILL_PER_DOMAIN = [
  REACT,
  "api-framework-hono",
  "cli-framework-oclif-ink",
] as const satisfies readonly SkillId[];

/** Loaded by the product's own judgment of a metadata.yaml, rather than scanned. */
async function seededCategoryAndDomain(
  cacheDir: string,
  skillId: SkillId,
): Promise<{ category: CategoryPath; domain: Domain }> {
  const skill = BUILT_IN_MATRIX.skills[skillId];
  if (skill === undefined) throw new Error(`no catalogue skill '${skillId}'`);

  const read = await readSkillMetadata(
    path.join(cacheDir, SOURCE_SRC_DIR, skill.path, STANDARD_FILES.METADATA_YAML),
  );
  if (!read.usable) throw new Error(read.reason);

  return { category: read.metadata.category, domain: read.metadata.domain };
}

/**
 * The end-to-end fixture names each seeded skill's domain from the catalogue's category table, and
 * refuses a category the table does not declare. Its callers are e2e specs, which this suite does
 * not run, so this is where its check is held.
 */
describe("the default marketplace's cache, seeded for an end-to-end spec", () => {
  let home: string;

  beforeEach(async () => {
    home = await createTempDir("default-source-cache-");
  });

  afterEach(async () => {
    vi.doUnmock("../../types/generated/matrix.js");
    vi.resetModules();
    await cleanupTempDir(home);
  });

  it("writes each skill's metadata with the domain its category declares", async () => {
    const cacheDir = await seedDefaultSourceCache(home, { omitting: OMITTED });

    expect(
      await Promise.all(
        ONE_SKILL_PER_DOMAIN.map(async (id) => seededCategoryAndDomain(cacheDir, id)),
      ),
    ).toStrictEqual([
      { category: "web-framework", domain: "web" },
      { category: "api-api", domain: "api" },
      { category: "cli-framework", domain: "cli" },
    ]);
  });

  it("refuses a skill whose category the catalogue does not declare, naming the category", async () => {
    vi.doMock("../../types/generated/matrix.js", async (importOriginal) => {
      const { BUILT_IN_MATRIX: catalogue } =
        await importOriginal<typeof import("../../types/generated/matrix.js")>();
      const react = catalogue.skills[REACT];
      if (react === undefined) throw new Error(`no catalogue skill '${REACT}'`);

      // One skill, so no other skill's writes are still landing when the refusal ends the spec.
      return {
        BUILT_IN_MATRIX: {
          ...catalogue,
          skills: { [REACT]: { ...react, category: LOCAL_PSEUDO_CATEGORY } },
        },
      };
    });
    vi.resetModules();
    const { seedDefaultSourceCache: seedFromThatCatalogue } =
      await import("../../../../e2e/fixtures/default-source-cache.js");

    await expect(seedFromThatCatalogue(home, { omitting: OMITTED })).rejects.toThrow(
      "seedDefaultSourceCache: no category 'local'",
    );
  });

  it("refuses a skill whose category is missing from the catalogue's table, naming the category", async () => {
    vi.doMock("../../types/generated/matrix.js", async (importOriginal) => {
      const { BUILT_IN_MATRIX: catalogue } =
        await importOriginal<typeof import("../../types/generated/matrix.js")>();
      const react = catalogue.skills[REACT];
      if (react === undefined) throw new Error(`no catalogue skill '${REACT}'`);
      const { [REACT_CATEGORY]: _undeclared, ...everyOtherCategory } = catalogue.categories;

      // One skill, so no other skill's writes are still landing when the refusal ends the spec.
      return {
        BUILT_IN_MATRIX: {
          ...catalogue,
          categories: everyOtherCategory,
          skills: { [REACT]: react },
        },
      };
    });
    vi.resetModules();
    const { seedDefaultSourceCache: seedFromThatCatalogue } =
      await import("../../../../e2e/fixtures/default-source-cache.js");

    await expect(seedFromThatCatalogue(home, { omitting: OMITTED })).rejects.toThrow(
      "seedDefaultSourceCache: no category 'web-framework'",
    );
  });
});
