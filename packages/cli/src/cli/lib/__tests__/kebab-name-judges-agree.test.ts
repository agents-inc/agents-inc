import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import fg from "fast-glob";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";
import {
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "./factories/plugin-factories.js";
import { kebabCaseJudgesIn, SHARED_PATTERN } from "./helpers/kebab-case-judges.js";
import { customMetadataValidationSchema, marketplaceSchema } from "../schemas.js";
import { validateKebabCaseName } from "../validate-kebab-name.js";
import { validatePluginManifest } from "../plugins/plugin-validator.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const PRODUCT_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];
const NOT_PRODUCT = ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/__mocks__/**"];

/**
 * Every module judging whether a name is kebab-case must reach the same verdict. The roster is
 * derived: `kebabCaseJudgesIn` finds judges by what their patterns accept, so a new spelling shows
 * up here. Only verdicts are pinned; the error prose legitimately differs per surface.
 */
describe("every judge of a kebab-case name", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-kebab-judges-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /** Mirrored, not imported: it is `build marketplace`'s word. */
  const MARKETPLACE_NOUN = "Marketplace";

  /** `marketplaceSchema.plugins.min(1)` must pass before `name` is reached. */
  const ONE_PLUGIN = [createMockMarketplacePlugin("web-framework-react")];

  async function marketplaceLoadAccepts(name: string): Promise<boolean> {
    return marketplaceSchema.safeParse({ ...createMockMarketplace(ONE_PLUGIN), name }).success;
  }

  function marketplacePublishAccepts(name: string): boolean {
    return validateKebabCaseName(name, MARKETPLACE_NOUN) === null;
  }

  async function pluginManifestAccepts(name: string): Promise<boolean> {
    const manifestPath = path.join(tempDir, "plugin.json");
    await writeFile(manifestPath, JSON.stringify({ name, version: "1.0.0" }));
    const { errors } = await validatePluginManifest(manifestPath);

    return !errors.some((error) => error.includes("kebab-case"));
  }

  /** The field alone: the whole schema demands unrelated fields before `slug` is reached. */
  function customSkillSlugAccepts(name: string): boolean {
    return customMetadataValidationSchema.shape.slug.safeParse(name).success;
  }

  /**
   * In walk order. `surface` keys the verdicts, not the site: `schemas.ts` judges two artefacts
   * through one pattern, so it appears twice here and once in the walk.
   */
  const JUDGES = [
    {
      surface: "a plugin.json name",
      file: "src/cli/lib/plugins/plugin-validator.ts",
      judge: SHARED_PATTERN,
      accepts: pluginManifestAccepts,
    },
    {
      surface: "a marketplace being loaded",
      file: "src/cli/lib/schemas.ts",
      judge: SHARED_PATTERN,
      accepts: marketplaceLoadAccepts,
    },
    {
      surface: "a custom skill's slug",
      file: "src/cli/lib/schemas.ts",
      judge: SHARED_PATTERN,
      accepts: customSkillSlugAccepts,
    },
    {
      surface: "a marketplace being published",
      file: "src/cli/lib/validate-kebab-name.ts",
      judge: SHARED_PATTERN,
      accepts: marketplacePublishAccepts,
    },
  ] as const satisfies readonly {
    surface: string;
    file: string;
    judge: string;
    accepts: (name: string) => boolean | Promise<boolean>;
  }[];

  /** The last four are accepted by `/^[a-z0-9-]+$/` and refused by `KEBAB_CASE_PATTERN`. */
  const NAMES = [
    { name: "acme-skills", accepted: true },
    { name: "a", accepted: true },
    { name: "web3-tooling", accepted: true },
    { name: "@acme/skills", accepted: false },
    { name: "Acme-Skills", accepted: false },
    { name: "acme skills", accepted: false },
    { name: "acme_skills", accepted: false },
    { name: "2acme", accepted: false },
    { name: "-acme", accepted: false },
    { name: "acme-", accepted: false },
    { name: "acme--skills", accepted: false },
  ] as const;

  async function judgeSitesInProduct(): Promise<string[]> {
    const files = (await fg(PRODUCT_SOURCES, { cwd: CLI_ROOT, ignore: NOT_PRODUCT })).sort();

    const scanned = await Promise.all(
      files.map(async (file) => {
        const source = await readFile(path.join(CLI_ROOT, file), "utf8");
        return kebabCaseJudgesIn(source, file).map((judge) => `${file}: ${judge}`);
      }),
    );

    return scanned.flat();
  }

  type Judge = (typeof JUDGES)[number];

  /** Shared by the scan and the roster, so the two cannot spell a site differently. */
  function siteOf(judge: Judge): string {
    return `${judge.file}: ${judge.judge}`;
  }

  /** Deduplicated: the scan names a file's pattern once, so schemas.ts is one site. */
  function sitesOf(judges: readonly Judge[]): string[] {
    return [...new Set(judges.map(siteOf))];
  }

  /** The trailing pattern name keeps `endsWith` from matching a longer name. */
  const REACHES_THE_ONE_PATTERN = `: ${SHARED_PATTERN}`;

  async function verdictsFor(name: string): Promise<Record<string, boolean>> {
    const answers = await Promise.all(
      JUDGES.map(async (judge) => [judge.surface, await judge.accepts(name)] as const),
    );

    return Object.fromEntries(answers);
  }

  function everyJudgeAnswering(accepted: boolean): Record<string, boolean> {
    return Object.fromEntries(JUDGES.map((judge) => [judge.surface, accepted]));
  }

  it("is one the product tree still holds, and no judge in it is unrostered", async () => {
    expect(
      await judgeSitesInProduct(),
      "a surface judging a kebab-case name and not rostered here is one nothing holds to the verdict below — the scan finds it by what its pattern accepts, so a new spelling arrives on its first day",
    ).toStrictEqual(sitesOf(JUDGES));
  });

  it("reaches the one statement of the rule rather than restating it", async () => {
    const sites = await judgeSitesInProduct();

    expect(
      sites.filter((site) => !site.endsWith(REACHES_THE_ONE_PATTERN)),
      "a judge written with its own regex is how one surface starts refusing what another emits, and rostering it is how that becomes permanent",
    ).toStrictEqual([]);
  });

  it.each(NAMES)(
    "is answered the same way for '$name' by every judge",
    async ({ name, accepted }) => {
      expect(
        await verdictsFor(name),
        "a name one judge accepts and another refuses is a name the CLI admits on load and declines to publish",
      ).toStrictEqual(everyJudgeAnswering(accepted));
    },
  );
});
