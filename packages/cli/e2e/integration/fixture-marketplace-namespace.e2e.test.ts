import path from "path";
import { readdir, readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { BUILT_IN_MATRIX } from "../../src/cli/types/generated/matrix.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  E2E_MARKETPLACE_NAME,
  E2E_SKILL,
  E2E_SKILL_IDS,
  e2eSkillId,
} from "../fixtures/expected-values.js";
import { cleanupFixture, cleanupTempDir, readMarketplaceJson } from "../helpers/test-utils.js";
import {
  E2E_MARKETPLACE_PREFIX,
  EXIT_CODES,
  FILES,
  SOURCE_PATHS,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../src/cli/consts.js";
import { validateKebabCaseName } from "../../src/cli/lib/validate-kebab-name.js";

// A marketplace's name is its skills' id prefix, so it must be constant across runs. Slugs are
// pinned (it.fails) rather than met: the fixture borrows catalogue slugs because `skillRefInRules`
// holds a marketplace's own rules to the public catalogue's slug union.

describe("E2E fixture marketplace namespace", () => {
  describe("the name the fixtures publish under", () => {
    it("carries the prefix the stale-registration sweep matches", () => {
      expect(
        E2E_MARKETPLACE_NAME.startsWith(E2E_MARKETPLACE_PREFIX),
        "global-setup removes stale Claude registrations by this prefix — a name outside it leaks",
      ).toBe(true);
    });

    it("is not the public marketplace's own name", () => {
      expect(
        E2E_MARKETPLACE_NAME,
        "the public catalogue owns its namespace; a fixture claiming it collides with every catalogue id",
      ).not.toBe(DEFAULT_PUBLIC_SOURCE_NAME);
    });

    it("is a name build marketplace accepts", () => {
      expect(validateKebabCaseName(E2E_MARKETPLACE_NAME, "Marketplace")).toBeNull();
    });
  });

  describe("the id builder", () => {
    it("composes a bare id into the fixture marketplace's namespace", () => {
      expect(e2eSkillId(E2E_SKILL.react.slug)).toBe(
        `${E2E_MARKETPLACE_NAME}-${E2E_SKILL.react.slug}`,
      );
    });
  });

  describe("a published fixture", () => {
    let fixture: E2EPluginSource;

    beforeAll(async () => {
      fixture = await createE2EPluginSource();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(fixture);
    });

    it("publishes under the shared name rather than a per-run one", () => {
      expect(fixture.marketplaceName).toBe(E2E_MARKETPLACE_NAME);
    });

    it("writes that name into the marketplace it generates", async () => {
      const marketplace = await readMarketplaceJson(
        path.join(fixture.sourceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, FILES.MARKETPLACE_JSON),
      );
      expect(marketplace.name).toBe(E2E_MARKETPLACE_NAME);
      expect(
        marketplace.plugins.map((plugin) => plugin.name).sort(),
        "the published marketplace must list every skill the fixture ships",
      ).toStrictEqual([...E2E_SKILL_IDS].sort());
    });
  });
  describe("the slugs a fixture publishes", () => {
    const CATALOGUE_OWNED_SLUG = "react";

    let source: E2ESource;
    let projectTempDir: string | undefined;

    beforeAll(async () => {
      source = await createE2ESource();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupTempDir(source.tempDir);
    });

    afterEach(async () => {
      if (projectTempDir) {
        await cleanupTempDir(projectTempDir);
        projectTempDir = undefined;
      }
    });

    async function slugPublishedBy(skillDir: string): Promise<string> {
      const metadataPath = path.join(skillDir, FILES.METADATA_YAML);
      const metadata: Record<string, unknown> = parseYaml(await readFile(metadataPath, "utf8"));
      const slug = metadata["slug"];
      if (typeof slug !== "string") throw new Error(`No slug declared in ${metadataPath}`);

      return slug;
    }

    async function publishedSlugs(): Promise<string[]> {
      const skillsDir = path.join(source.sourceDir, SOURCE_PATHS.SKILLS_DIR);
      const skillDirs = await readdir(skillsDir);

      return Promise.all(skillDirs.map((dir) => slugPublishedBy(path.join(skillsDir, dir))));
    }

    function rosteredSlugs(): string[] {
      return Object.values(E2E_SKILL)
        .map((skill) => skill.slug)
        .sort();
    }

    it("mirror a slug the shipped catalogue really owns", () => {
      expect(
        CATALOGUE_OWNED_SLUG in BUILT_IN_MATRIX.slugMap.slugToId,
        "the fixture must mirror a catalogue slug for the pins below to mean anything",
      ).toBe(true);
    });

    it.fails("carry the marketplace's namespace, as its ids do", async () => {
      const published = await publishedSlugs();

      expect(
        published.sort(),
        "the slugs on disk are what a consumer's slug map is built from — the exported roster must be the same set",
      ).toStrictEqual(rosteredSlugs());
      expect(
        published.filter((slug) => !slug.startsWith(E2E_MARKETPLACE_NAME)),
        "a slug outside the marketplace's namespace is one some other marketplace may already own",
      ).toStrictEqual([]);
      expect(
        published.filter((slug) => slug in BUILT_IN_MATRIX.slugMap.slugToId),
        "a slug the public catalogue already owns is one this marketplace loses on a first-claim-wins map, leaving its skill unreachable by slug",
      ).toStrictEqual([]);
    });

    it(
      "are read back without a duplicate claim when the catalogue is loaded beside them",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const project = await ProjectBuilder.editable({
          skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
          agents: ["web-developer"],
        });
        projectTempDir = path.dirname(project.dir);

        const { exitCode, output } = await CLI.run(["compile"], project);

        expect(exitCode, "the mixed configuration must compile like any other").toBe(
          EXIT_CODES.SUCCESS,
        );
        expect(
          flattenCliOutput(output),
          "an installed skill may share a slug with the catalogue, since only ids carry a namespace, and nothing is ignored",
        ).not.toContain(STEP_TEXT.DUPLICATE_SLUG);
      },
    );

    // The permitted case beside the pins: whatever the slugs become, doctor's metadata schema must accept them.
    it(
      "are accepted by the strict metadata schema doctor validates with",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const project = await ProjectBuilder.editable({
          marketplace: source.sourceDir,
          skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
          agents: ["web-developer"],
        });
        projectTempDir = path.dirname(project.dir);

        const { exitCode, output } = await CLI.run(["doctor"], project);
        const report = flattenCliOutput(output);

        expect(exitCode, "a slug the CLI declines to read back is one it cannot ship").toBe(
          EXIT_CODES.SUCCESS,
        );
        expect(
          report,
          "the content layer must reach a verdict on the skills, not skip them",
        ).toContain(STEP_TEXT.DOCTOR_SKILLS_VALIDATED);
        expect(
          report,
          "the marketplace's own metadata is validated by the same schema as its installed copies",
        ).toContain(STEP_TEXT.DOCTOR_ONE_MARKETPLACE_VALIDATED);
      },
    );
  });
});
