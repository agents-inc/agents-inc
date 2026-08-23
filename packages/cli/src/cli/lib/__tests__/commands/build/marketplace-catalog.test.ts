import os from "os";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matrixSchema, type Matrix } from "@workspace/matrix/matrix-schema";

import {
  DEFAULT_VERSION,
  LOCAL_SKILLS_PATH,
  PLUGIN_MANIFEST_DIR,
  PLUGINS_DIST_PATH,
  SKILL_CATEGORIES_PATH,
  SKILLS_DIR_PATH,
  STACKS_FILE_PATH,
} from "../../../../consts";
import { defaultCategories } from "../../../configuration/default-categories";
import { defaultStacks } from "../../../configuration/default-stacks";
import { renderConfigTs } from "../../content-generators.js";
import { createTestSkill } from "../../factories/skill-factories.js";
import { runCliCommand } from "../../helpers/cli-runner.js";
import { readTestJson, writeTestPackageJson } from "../../helpers/config-io.js";
import { writeSourceSkill, writeTestPluginManifest } from "../../helpers/disk-writers.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { firstElement } from "../../helpers/element-at.js";
import { readTestFile, type TestSkill } from "../../fixtures/create-test-source.js";
import type { SkillId } from "../../../../types";

/**
 * The file the editor fetches, spelled rather than imported.
 *
 * It is a wire name: a consumer builds the URL from it without asking this
 * package, so a test reading the constant would agree with the constant moving
 * and say nothing about the artefact anyone can actually fetch.
 */
const CATALOG_JSON = "catalog.json";

/** The marketplace every fixture here publishes under unless it says otherwise. */
const MARKETPLACE_NAME = "acme";

/**
 * The npm package the public catalogue publishes from. Written out rather than
 * imported from the constant the guards read: it is an identity, and a test
 * asserting it against its own definition cannot notice that identity moving.
 */
const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

/** The marketplace name that package publishes under, and no other may. */
const PUBLIC_CATALOGUE_NAME = "agents-inc";

/**
 * A package name the catalogue's own is a prefix of. Nobody's identity but its
 * own author's — and an implementation that matched loosely would hand it the
 * built-in stacks.
 */
const CATALOGUE_LOOKALIKE_PACKAGE = `${PUBLIC_CATALOGUE_PACKAGE}-extra`;

/** A publishable name for that lookalike, since its scoped npm name is not one. */
const LOOKALIKE_MARKETPLACE_NAME = "acme";

/**
 * The catalogue skill a fixture borrows its taxonomy from.
 *
 * A fixture must not invent a domain, a category or a slug — those are members of
 * generated unions — so the factory answers for them from a real catalogue entry
 * and the test overrides only the fields that make the skill this marketplace's
 * own: the id it publishes under, and the category it declares.
 */
const TAXONOMY_BASE: SkillId = "web-framework-react";

/** The taxonomy a skill that exists only on the author's machine borrows. */
const LOCAL_TAXONOMY_BASE: SkillId = "web-state-zustand";

/**
 * The built-in category {@link TAXONOMY_BASE} sits in.
 *
 * A marketplace may place its own skill in one of these rather than declaring a
 * category, and then the catalogue owes the consumer that definition — which is
 * the case a scaffold cannot exercise, because its one skill sits in its one
 * declared category and the two candidate rules agree there.
 */
const BUILT_IN_CATEGORY = "web-framework";

/** The id the fixture marketplace publishes its one skill under. */
const MARKETPLACE_SKILL_ID = `${MARKETPLACE_NAME}-house-style`;

/** A category no built-in defines, so its presence in a catalog came from the marketplace. */
const MARKETPLACE_CATEGORY = `${MARKETPLACE_NAME}-conventions`;

/** What the marketplace calls that category — a synthesized stand-in would not say this. */
const MARKETPLACE_CATEGORY_DISPLAY_NAME = "House Conventions";

/** And how it describes it. `synthesizeCategory` writes "Auto-generated category for ...". */
const MARKETPLACE_CATEGORY_DESCRIPTION = "How this marketplace writes things";

/** The stack the fixture marketplace ships in its own `config/stacks.ts`. */
const MARKETPLACE_STACK_ID = `${MARKETPLACE_NAME}-starter`;

/** The sub-agent that stack staffs. */
const STACK_AGENT = "web-developer";

/** A skill present only in `.claude/skills` — never a marketplace's to publish. */
const LOCAL_ONLY_SKILL_ID = "my-private-skill";

/** One built-in stack, named so the built-in assertion cannot pass on an empty list. */
const A_BUILT_IN_STACK_ID = "nextjs-fullstack";

/** The order a declared category sorts at — any number the synthesizer does not use. */
const MARKETPLACE_CATEGORY_ORDER = 1;

/** The one skill the fixture marketplace ships. */
function marketplaceSkill(): TestSkill {
  return createTestSkill(TAXONOMY_BASE, "This marketplace's own house style", {
    id: MARKETPLACE_SKILL_ID,
    category: MARKETPLACE_CATEGORY,
  });
}

/** The same marketplace's skill, left in the built-in category its taxonomy names. */
function skillInBuiltInCategory(): TestSkill {
  return createTestSkill(TAXONOMY_BASE, "This marketplace's own take on the framework", {
    id: MARKETPLACE_SKILL_ID,
  });
}

/** A skill that exists only where the author happens to be standing. */
function localOnlySkill(): TestSkill {
  return createTestSkill(LOCAL_TAXONOMY_BASE, "A skill only this machine has", {
    id: LOCAL_ONLY_SKILL_ID,
  });
}

/**
 * Writes one skill into the marketplace's own `src/skills/<id>/`, and the built plugin that
 * publishes it.
 *
 * Both halves, because `build marketplace` refuses a manifest with no plugins in it — the schema it
 * would be read back with is `plugins: z.array(...).min(1)` — so a marketplace holding a skill it
 * has not built is not a state this command produces an artefact from, and every catalog assertion
 * below needs an artefact.
 */
async function publishMarketplaceSkill(marketplaceDir: string, skill: TestSkill): Promise<void> {
  await writeSourceSkill(path.join(marketplaceDir, SKILLS_DIR_PATH), skill.id, skill);
  await writeTestPluginManifest(path.join(marketplaceDir, PLUGINS_DIST_PATH, skill.id), {
    name: skill.id,
    version: DEFAULT_VERSION,
    description: skill.description,
  });
}

/** Writes one skill into `<baseDir>/.claude/skills/<id>/` — a local skill. */
async function writeLocalSkill(baseDir: string, skill: TestSkill): Promise<void> {
  await writeSourceSkill(path.join(baseDir, LOCAL_SKILLS_PATH), skill.id, skill);
}

/** Writes one of a marketplace's `config/*.ts` modules. */
async function writeConfigModule(
  marketplaceDir: string,
  relPath: string,
  data: Record<string, unknown>,
): Promise<void> {
  const filePath = path.join(marketplaceDir, relPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, renderConfigTs(data));
}

/** Gives the marketplace a category of its own, declared the way an author declares one. */
async function writeMarketplaceCategories(marketplaceDir: string): Promise<void> {
  await writeConfigModule(marketplaceDir, SKILL_CATEGORIES_PATH, {
    version: DEFAULT_VERSION,
    categories: {
      [MARKETPLACE_CATEGORY]: {
        id: MARKETPLACE_CATEGORY,
        displayName: MARKETPLACE_CATEGORY_DISPLAY_NAME,
        description: MARKETPLACE_CATEGORY_DESCRIPTION,
        domain: "web",
        exclusive: false,
        required: false,
        order: MARKETPLACE_CATEGORY_ORDER,
      },
    },
  });
}

/** Gives the marketplace a stack of its own, the way the scaffold writes one. */
async function writeMarketplaceStacks(marketplaceDir: string): Promise<void> {
  await writeConfigModule(marketplaceDir, STACKS_FILE_PATH, {
    stacks: [
      {
        id: MARKETPLACE_STACK_ID,
        name: `${MARKETPLACE_NAME} starter`,
        description: `Every skill ${MARKETPLACE_NAME} ships`,
        agents: {
          [STACK_AGENT]: {
            [MARKETPLACE_CATEGORY]: [{ id: MARKETPLACE_SKILL_ID }],
          },
        },
      },
    ],
  });
}

describe("build:marketplace catalog emission", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let catalogPath: string;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("build-marketplace-catalog-"));
    // `loadSkillsMatrixFromSource` reaches the home directory through `os.homedir()`.
    // Node re-reads `$HOME` on every call, so the env var alone would carry there; bun
    // resolves it once at startup and ignores the mutation, and this package runs both.
    // Pointing the spy at the same fake home is what makes the absence assertions below
    // assertions rather than accidents.
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    catalogPath = path.join(projectDir, PLUGIN_MANIFEST_DIR, CATALOG_JSON);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });

  describe("the artefact", () => {
    beforeEach(async () => {
      await writeTestPackageJson(projectDir, { name: MARKETPLACE_NAME });
      await writeMarketplaceCategories(projectDir);
      await publishMarketplaceSkill(projectDir, marketplaceSkill());
    });

    it("emits a catalog beside the marketplace manifest", async () => {
      const { error } = await runCliCommand(["build:marketplace"]);

      expect(error).toBeUndefined();
      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(Object.keys(catalog.skills)).toStrictEqual([MARKETPLACE_SKILL_ID]);
    });

    it("emits a catalog the wire contract the editor parses it with accepts", async () => {
      await runCliCommand(["build:marketplace"]);

      const parsed = matrixSchema.safeParse(await readTestJson<unknown>(catalogPath));

      expect(
        parsed.error?.issues ?? [],
        "the editor safeParses this file and maintains no transform for it",
      ).toStrictEqual([]);
    });

    it("names no slug that no skill in it carries", async () => {
      await runCliCommand(["build:marketplace"]);

      const raw = await readTestJson<Record<string, unknown>>(catalogPath);

      expect(
        raw.unresolvedSlugs,
        "the built-in rules must be narrowed to the slugs this marketplace ships",
      ).toBeUndefined();
    });

    it("emits the same bytes on a second build over an unchanged marketplace", async () => {
      await runCliCommand(["build:marketplace"]);
      const firstBuild = await readTestFile(catalogPath);

      await runCliCommand(["build:marketplace"]);
      const secondBuild = await readTestFile(catalogPath);

      expect(
        secondBuild,
        "the editor fetches this file directly, so a byte that moves on every build defeats its cache and writes a diff into the marketplace's history",
      ).toBe(firstBuild);
    });

    it("carries the category the marketplace declares, not a synthesized stand-in", async () => {
      await runCliCommand(["build:marketplace"]);

      const catalog = await readTestJson<Matrix>(catalogPath);

      expect(catalog.categories[MARKETPLACE_CATEGORY]).toMatchObject({
        id: MARKETPLACE_CATEGORY,
        displayName: MARKETPLACE_CATEGORY_DISPLAY_NAME,
        description: MARKETPLACE_CATEGORY_DESCRIPTION,
      });
      expect(catalog.skills[MARKETPLACE_SKILL_ID]?.category).toBe(MARKETPLACE_CATEGORY);
    });
  });

  describe("categories", () => {
    beforeEach(async () => {
      await writeTestPackageJson(projectDir, { name: MARKETPLACE_NAME });
    });

    it("carries the category its skill declares, and none of the built-in taxonomy", async () => {
      await writeMarketplaceCategories(projectDir);
      await publishMarketplaceSkill(projectDir, marketplaceSkill());

      await runCliCommand(["build:marketplace"]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(
        Object.keys(catalog.categories),
        "a published catalogue cannot claim categories the marketplace ships nothing in",
      ).toStrictEqual([MARKETPLACE_CATEGORY]);
    });

    it("carries a built-in category its own skill sits in, with the built-in definition", async () => {
      await publishMarketplaceSkill(projectDir, skillInBuiltInCategory());

      await runCliCommand(["build:marketplace"]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(
        Object.keys(catalog.categories),
        "a consumer holding this skill must be able to place it, so the category it names travels with it",
      ).toStrictEqual([BUILT_IN_CATEGORY]);
      expect(
        catalog.categories[BUILT_IN_CATEGORY],
        "the built-in definition, not the humanized stand-in `synthesizeCategory` writes",
      ).toStrictEqual(defaultCategories[BUILT_IN_CATEGORY]);
    });

    it("leaves out a category the marketplace declares and ships no skill in", async () => {
      await writeMarketplaceCategories(projectDir);
      await publishMarketplaceSkill(projectDir, skillInBuiltInCategory());

      await runCliCommand(["build:marketplace"]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(
        Object.keys(catalog.categories),
        "declaring a category is not shipping one — the rule is the same for the marketplace's own as for the built-ins",
      ).toStrictEqual([BUILT_IN_CATEGORY]);
    });
  });

  describe("local skills", () => {
    beforeEach(async () => {
      await writeTestPackageJson(projectDir, { name: MARKETPLACE_NAME });
      await writeMarketplaceCategories(projectDir);
      await publishMarketplaceSkill(projectDir, marketplaceSkill());
    });

    it("leaves a skill in the author's home directory out of the published catalog", async () => {
      await writeLocalSkill(fakeHome, localOnlySkill());

      await runCliCommand(["build:marketplace"]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(
        Object.keys(catalog.skills),
        "a published catalogue must carry the marketplace's skills and nothing the author's machine happens to hold",
      ).toStrictEqual([MARKETPLACE_SKILL_ID]);
    });

    it("leaves a skill in the marketplace's own .claude/skills out of the published catalog", async () => {
      await writeLocalSkill(projectDir, localOnlySkill());

      await runCliCommand(["build:marketplace"]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(Object.keys(catalog.skills)).toStrictEqual([MARKETPLACE_SKILL_ID]);
    });
  });

  describe("stacks", () => {
    it("carries a marketplace's own stack, and none of the built-ins", async () => {
      await writeTestPackageJson(projectDir, { name: MARKETPLACE_NAME });
      await writeMarketplaceCategories(projectDir);
      await publishMarketplaceSkill(projectDir, marketplaceSkill());
      await writeMarketplaceStacks(projectDir);

      await runCliCommand(["build:marketplace"]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(catalog.suggestedStacks.map((stack) => stack.id)).toStrictEqual([
        MARKETPLACE_STACK_ID,
      ]);
      expect(firstElement(catalog.suggestedStacks).allSkillIds).toStrictEqual([
        MARKETPLACE_SKILL_ID,
      ]);
    });

    it("carries no stacks for a marketplace that ships none", async () => {
      await writeTestPackageJson(projectDir, { name: MARKETPLACE_NAME });
      await writeMarketplaceCategories(projectDir);
      await publishMarketplaceSkill(projectDir, marketplaceSkill());

      await runCliCommand(["build:marketplace"]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(
        catalog.suggestedStacks,
        "a marketplace ships its own stacks or offers none — it gets no stand-in",
      ).toStrictEqual([]);
    });

    it("carries the built-in stacks for the public catalogue's own package", async () => {
      await writeTestPackageJson(projectDir, { name: PUBLIC_CATALOGUE_PACKAGE });
      await writeMarketplaceCategories(projectDir);
      await publishMarketplaceSkill(projectDir, marketplaceSkill());

      await runCliCommand(["build:marketplace", "--name", PUBLIC_CATALOGUE_NAME]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(
        catalog.suggestedStacks.map((stack) => stack.id),
        "the built-in stacks are the public catalogue's stacks, and a checkout of it is still it",
      ).toStrictEqual(defaultStacks.map((stack) => stack.id));
      expect(catalog.suggestedStacks.map((stack) => stack.id)).toContain(A_BUILT_IN_STACK_ID);
    });

    it("withholds the built-in stacks from a package that merely resembles the catalogue", async () => {
      await writeTestPackageJson(projectDir, { name: CATALOGUE_LOOKALIKE_PACKAGE });
      await writeMarketplaceCategories(projectDir);
      await publishMarketplaceSkill(projectDir, marketplaceSkill());

      // A scoped npm name is not publishable as a marketplace name, so the build is
      // refused without one — the same flag the sibling case above needs, and for the
      // same reason. It does not touch the claim: `offersBuiltInStacks` answers off
      // `isPublicCatalogueCheckout`, which reads the package identity from disk.
      await runCliCommand(["build:marketplace", "--name", LOOKALIKE_MARKETPLACE_NAME]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(
        catalog.suggestedStacks,
        "the identity is the whole package name, so a prefix of it is somebody else",
      ).toStrictEqual([]);
    });
  });
});
