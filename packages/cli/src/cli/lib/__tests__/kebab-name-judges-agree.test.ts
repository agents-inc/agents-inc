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

/** The shipped CLI — every surface a user can reach, and nothing that tests one. */
const PRODUCT_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];
const NOT_PRODUCT = ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/__mocks__/**"];

/**
 * Several modules independently judge whether a name is kebab-case, and they must agree.
 *
 * They exist because several artefacts carry such a name — a marketplace being PUBLISHED
 * (`validateKebabCaseName`, reached from `build marketplace`), a marketplace being LOADED
 * (`marketplaceSchema.name`), a `plugin.json` being validated (`isKebabCase`, module-private,
 * driven here through `validatePluginManifest`), and a custom skill's `slug` being validated on
 * load (`customMetadataValidationSchema`).
 *
 * **The roster is derived rather than remembered, and that is the whole of what makes this a
 * gate.** `kebabCaseJudgesIn` finds a judge by asking each anchored pattern what it ACCEPTS, not
 * by looking for the shared constant's name — a scan keyed on the name sees only the surfaces
 * that already agree, which is the one thing a roster of judges must not be built from. So a
 * fifth judge written in a fifth spelling arrives here on its first day, and a rostered surface
 * that stops reaching the one pattern reddens the walk rather than the verdicts.
 *
 * **What this file deliberately does NOT assert is that the judges say the same SENTENCE.** They
 * do not, and should not: one is parameterised by a noun, one names the offending characters, one
 * carries an example and where to edit it. Pinning the prose equal would force a false uniformity
 * on surfaces with genuinely different jobs. The prose duplication is real and is filed as
 * `2026-08-20-marketplace-name-rule-enforced-on-emit-and-not-on-load.md`; the VERDICT is the half
 * that must not diverge, and it is the half held here.
 */
describe("every judge of a kebab-case name", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-kebab-judges-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /** The noun `build marketplace` passes, mirrored rather than imported — it is that command's word. */
  const MARKETPLACE_NOUN = "Marketplace";

  /** The one plugin `marketplaceSchema.plugins.min(1)` requires before `name` is ever reached. */
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

  /**
   * The one field, rather than the whole schema around it: `skillMetadataBaseSchema` demands
   * half a dozen unrelated fields before `slug` is reached, and a fixture supplying them would
   * put this judge's verdict behind a fixture's correctness.
   */
  function customSkillSlugAccepts(name: string): boolean {
    return customMetadataValidationSchema.shape.slug.safeParse(name).success;
  }

  /**
   * Every judge the scan finds, paired with the way this file drives it. `judge` is what the
   * scan names the surface by — the shared constant, or a second spelling's own text — and it is
   * asserted against the walk below, so a surface added, moved or deleted reddens this roster.
   *
   * `surface` is what the verdict table is keyed by, and it is not the same thing as the site: a
   * file states the rule once and can judge several artefacts through it, so `schemas.ts` appears
   * twice here and once in the walk. Keying the verdicts by site instead silently dropped one of
   * the two into the other.
   *
   * In the order the walk yields them, because that is what it is compared against.
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

  /**
   * Names chosen for the boundaries a hand-rolled judge gets wrong, not for coverage. The last
   * four entries are each accepted by `/^[a-z0-9-]+$/` and refused by `KEBAB_CASE_PATTERN` — they
   * are what makes this table discriminating rather than decorative, and `acme-` and
   * `acme--skills` are the two a second spelling of the rule in `schemas.ts` used to admit.
   */
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

  /** Every judge in the product tree, as `file: judge`, in the order the walk yields them. */
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

  /** How the scan and this roster both name one site, so the two cannot spell it differently. */
  function siteOf(judge: Judge): string {
    return `${judge.file}: ${judge.judge}`;
  }

  /**
   * The sites a roster claims, deduplicated: the scan names a file's pattern once however many
   * artefacts that file judges by it, so the two schemas.ts surfaces arrive here as one site.
   */
  function sitesOf(judges: readonly Judge[]): string[] {
    return [...new Set(judges.map(siteOf))];
  }

  /** How the scan spells a site reaching the one pattern, so `endsWith` cannot match a longer name. */
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
