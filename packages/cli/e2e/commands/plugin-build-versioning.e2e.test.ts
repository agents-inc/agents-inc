import path from "path";
import { writeFile } from "fs/promises";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL, E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
  readMarketplaceJson,
  readPluginVersions,
  renderSkillMd,
  writeTestPackageJson,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";

/**
 * CLI-338 to CLI-344 — version bumping through the real binary.
 *
 * `determinePluginVersion` / `bumpMajorVersion` / `computeSkillFolderHash` are unit
 * tested in `src/cli/lib/versioning.test.ts`; the chain that runs them —
 * `build plugins` reading a source off disk, writing `plugin.json` + `.content-hash`,
 * then `build marketplace` reading those manifests back — asserted no version VALUE
 * anywhere before this file.
 *
 * The phases run in declaration order and share one source directory, because a bump
 * is only observable as a DIFFERENCE between two compiles of the same plugin
 * directory: the compiler decides the version by comparing the skill's fresh content
 * hash against the `.content-hash` the previous run left beside the manifest. A
 * per-phase source would make every compile an initial one, and every version 1.0.0.
 *
 * Only the edited skill's SKILL.md body changes between rebuilds, so the content hash
 * is the only input that moves.
 */

const INITIAL_VERSION = "1.0.0";
const BUMPED_VERSION = "2.0.0";
const REBUMPED_VERSION = "3.0.0";

const MARKETPLACE_NAME = "versioning-test-mp";

/** The one skill this spec edits. Every other source skill is the control group. */
const EDITED_SKILL_ID = E2E_SKILL.react.id;

const EDITED_DESCRIPTION = "Edited React skill";
const FIRST_EDIT_BODY = "# Edited before the second compile";
const SECOND_EDIT_BODY = "# Edited again before the marketplace regeneration";

/**
 * Every source skill at the version an initial compile gives it. Written out in full
 * rather than derived, so a missing or extra plugin fails the `toStrictEqual` instead
 * of quietly shrinking the expectation with the actual.
 */
const ALL_SKILLS_AT_INITIAL_VERSION: Record<string, string> = {
  [E2E_SKILL.hono.id]: INITIAL_VERSION,
  [E2E_SKILL["research-methodology"].id]: INITIAL_VERSION,
  [E2E_SKILL["cli-reviewing"].id]: INITIAL_VERSION,
  [E2E_SKILL.reviewing.id]: INITIAL_VERSION,
  [E2E_SKILL.react.id]: INITIAL_VERSION,
  [E2E_SKILL["vue-composition-api"].id]: INITIAL_VERSION,
  [E2E_SKILL.pinia.id]: INITIAL_VERSION,
  [E2E_SKILL.zustand.id]: INITIAL_VERSION,
  [E2E_SKILL["visual-regression"].id]: INITIAL_VERSION,
  [E2E_SKILL.vitest.id]: INITIAL_VERSION,
};

const AFTER_FIRST_EDIT: Record<string, string> = {
  ...ALL_SKILLS_AT_INITIAL_VERSION,
  [EDITED_SKILL_ID]: BUMPED_VERSION,
};

const AFTER_SECOND_EDIT: Record<string, string> = {
  ...ALL_SKILLS_AT_INITIAL_VERSION,
  [EDITED_SKILL_ID]: REBUMPED_VERSION,
};

/**
 * The `name` / `source` / `version` triple every marketplace entry must carry, as the
 * marketplace looks once the first bump has landed. `generateMarketplace` sorts by
 * name, and `E2E_SKILL_IDS` is already in that order.
 */
const EXPECTED_MARKETPLACE_ENTRIES = E2E_SKILL_IDS.map((id) => ({
  name: id,
  source: `./${SOURCE_PATHS.PLUGINS_DIST}/${id}`,
  version: AFTER_FIRST_EDIT[id],
}));

/** Rewrites the edited skill's SKILL.md, which is what the content hash reads. */
async function editSkillMd(sourceDir: string, body: string): Promise<void> {
  await writeFile(
    path.join(sourceDir, SOURCE_PATHS.SKILLS_DIR, EDITED_SKILL_ID, FILES.SKILL_MD),
    renderSkillMd(EDITED_SKILL_ID, EDITED_DESCRIPTION, body),
  );
}

describe("build plugins version bumping", () => {
  let sourceDir: string;
  let tempDir: string;
  let pluginsDir: string;
  let marketplacePath: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    ({ sourceDir, tempDir } = await createE2ESource());
    pluginsDir = path.join(sourceDir, SOURCE_PATHS.PLUGINS_DIST);
    marketplacePath = path.join(
      sourceDir,
      SOURCE_PATHS.PLUGIN_MANIFEST_DIR,
      FILES.MARKETPLACE_JSON,
    );
    // `build marketplace` reads marketplace identity from package.json at cwd.
    await writeTestPackageJson(sourceDir, {
      name: MARKETPLACE_NAME,
      description: "Version-bumping test marketplace",
    });
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  describe("first compile of a source that has never been built", () => {
    let result: Awaited<ReturnType<typeof CLI.run>>;

    beforeAll(async () => {
      result = await CLI.run(["build", "plugins"], { dir: sourceDir });
    }, TIMEOUTS.SETUP);

    it("succeeds", () => {
      expect(result.exitCode, `build plugins failed: ${result.output}`).toBe(EXIT_CODES.SUCCESS);
    });

    it("writes every plugin manifest at the initial version", async () => {
      expect(
        await readPluginVersions(pluginsDir, E2E_SKILL_IDS),
        `a plugin compiled for the first time must be at ${INITIAL_VERSION}`,
      ).toStrictEqual(ALL_SKILLS_AT_INITIAL_VERSION);
    });
  });

  describe("recompile after one skill's SKILL.md changed", () => {
    let result: Awaited<ReturnType<typeof CLI.run>>;

    beforeAll(async () => {
      await editSkillMd(sourceDir, FIRST_EDIT_BODY);
      result = await CLI.run(["build", "plugins"], { dir: sourceDir });
    }, TIMEOUTS.SETUP);

    it("succeeds", () => {
      expect(result.exitCode, `build plugins failed: ${result.output}`).toBe(EXIT_CODES.SUCCESS);
    });

    it("bumps the changed skill and leaves every other skill where it was", async () => {
      expect(
        await readPluginVersions(pluginsDir, E2E_SKILL_IDS),
        "only the skill whose content hash moved may take a new major version",
      ).toStrictEqual(AFTER_FIRST_EDIT);
    });

    it("reports the bumped version in the compilation summary", () => {
      expect(result.output).toContain(`${EDITED_SKILL_ID} (v${BUMPED_VERSION})`);
    });
  });

  describe("recompile with no source change at all", () => {
    let result: Awaited<ReturnType<typeof CLI.run>>;

    beforeAll(async () => {
      result = await CLI.run(["build", "plugins"], { dir: sourceDir });
    }, TIMEOUTS.SETUP);

    it("succeeds", () => {
      expect(result.exitCode, `build plugins failed: ${result.output}`).toBe(EXIT_CODES.SUCCESS);
    });

    it("leaves every version untouched", async () => {
      expect(
        await readPluginVersions(pluginsDir, E2E_SKILL_IDS),
        "a compile that changes no content must not bump anything",
      ).toStrictEqual(AFTER_FIRST_EDIT);
    });
  });

  describe("marketplace generated from the compiled plugins", () => {
    let result: Awaited<ReturnType<typeof CLI.run>>;

    beforeAll(async () => {
      result = await CLI.run(["build", "marketplace"], { dir: sourceDir });
    }, TIMEOUTS.SETUP);

    it("succeeds and reports every compiled plugin in its summary", () => {
      expect(result.exitCode, `build marketplace failed: ${result.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      // Ported from the deleted plugin-build.e2e.test.ts, which matched
      // `[1-9]\d* plugins!` — any non-zero count. The source's own skill count is
      // known, so the exact number is what a dropped plugin has to redden.
      expect(result.output).toContain(
        `Marketplace generated with ${E2E_SKILL_IDS.length} plugins!`,
      );
    });

    /**
     * Artifact-to-artifact: proves the marketplace was generated from the manifests
     * on disk rather than from anything cached. It deliberately does NOT carry the
     * red for a broken bump — both sides move together when the compiler stops
     * bumping, so it stayed green under that mutation. The literal-value assertions
     * ("carries name, version and source", and the regeneration case below) are the
     * ones that go red; do not simplify them into this one.
     */
    it("lists every compiled skill at the version its own manifest declares", async () => {
      const marketplace = await readMarketplaceJson(marketplacePath);
      const listedVersions = Object.fromEntries(
        marketplace.plugins.map((p) => [p.name, p.version]),
      );

      expect(
        listedVersions,
        "the marketplace must mirror the plugin manifests on disk, not a stale copy",
      ).toStrictEqual(await readPluginVersions(pluginsDir, E2E_SKILL_IDS));
    });

    it("carries name, version and source on every plugin entry", async () => {
      const marketplace = await readMarketplaceJson(marketplacePath);

      expect(
        marketplace.plugins.map((p) => ({ name: p.name, source: p.source, version: p.version })),
      ).toStrictEqual(EXPECTED_MARKETPLACE_ENTRIES);
    });

    /**
     * `MarketplacePlugin.category` is optional and `getMarketplaceStats` groups by
     * `p.category ?? "uncategorized"`, so the marketplace command has a category
     * breakdown to print — but nothing ever fills it in for a skill plugin.
     * `PluginManifest` has no category field, `generateSkillPluginManifest` takes no
     * category, and `convertManifestToMarketplacePlugin` never sets one, so every
     * generated marketplace reports "uncategorized: <all>". The skill's own
     * metadata.yaml DOES carry a category; it is simply dropped on the way through.
     *
     * Expected-fail rather than deleted: the assertion is the record of the gap, and
     * it turns green the moment a category reaches the entry.
     */
    it("carries a category on every plugin entry", async () => {
      const marketplace = await readMarketplaceJson(marketplacePath);

      expect(marketplace.plugins.map((p) => p.category)).not.toContain(undefined);
    });
  });

  describe("marketplace regenerated after a further bump", () => {
    let buildResult: Awaited<ReturnType<typeof CLI.run>>;
    let marketplaceResult: Awaited<ReturnType<typeof CLI.run>>;

    beforeAll(async () => {
      await editSkillMd(sourceDir, SECOND_EDIT_BODY);
      buildResult = await CLI.run(["build", "plugins"], { dir: sourceDir });
      marketplaceResult = await CLI.run(["build", "marketplace"], { dir: sourceDir });
    }, TIMEOUTS.SETUP);

    it("succeeds", () => {
      expect(buildResult.exitCode, `build plugins failed: ${buildResult.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      expect(
        marketplaceResult.exitCode,
        `build marketplace failed: ${marketplaceResult.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
    });

    it("replaces the previously listed version with the newly bumped one", async () => {
      const marketplace = await readMarketplaceJson(marketplacePath);
      const listedVersions = Object.fromEntries(
        marketplace.plugins.map((p) => [p.name, p.version]),
      );

      expect(
        listedVersions,
        "regenerating the marketplace must pick up the version the rebuild wrote",
      ).toStrictEqual(AFTER_SECOND_EDIT);
    });
  });
});
