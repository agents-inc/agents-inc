import os from "os";
import path from "path";
import { appendFile, mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { matrixSchema, type Matrix } from "@workspace/matrix/matrix-schema";

import {
  DEFAULT_VERSION,
  LOCAL_SKILLS_PATH,
  PLUGIN_MANIFEST_DIR,
  PLUGINS_DIST_PATH,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  SOURCE_ROOT_DIR,
  STACKS_FILE_PATH,
  STANDARD_FILES,
} from "../../../../consts";
import { defaultCategories } from "../../../configuration/default-categories";
import { EXIT_CODES } from "../../../exit-codes";
import { defaultStacks } from "../../../configuration/default-stacks";
import { renderConfigTs } from "../../content-generators.js";
import { createTestSkill } from "../../factories/skill-factories.js";
import { renderUnparseableConfigTs } from "../../factories/unloadable-config-factories.js";
import { fileExists } from "../../test-fs-utils";
import { runCliCommand } from "../../helpers/cli-runner.js";
import { readTestJson, writeTestPackageJson } from "../../helpers/config-io.js";
import { writeSourceSkill, writeTestPluginManifest } from "../../helpers/disk-writers.js";
import { setupIsolatedHome } from "../../helpers/isolated-home.js";
import { firstElement } from "../../helpers/element-at.js";
import { readTestFile, type TestSkill } from "../../fixtures/create-test-source.js";
import type { SkillId } from "../../../../types";

/** Spelled, not imported: a wire name consumers build URLs from. */
const CATALOG_JSON = "catalog.json";

const MARKETPLACE_JSON = "marketplace.json";

/** Read only to build the catalogue, so the manifest must not be written before them. */
const CATALOGUE_CONFIG_MODULES = [
  path.join(SOURCE_ROOT_DIR, STANDARD_FILES.CONFIG_TS),
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  STACKS_FILE_PATH,
] as const;

const MARKETPLACE_NAME = "acme";

/** Written out, not imported: an identity asserted against its own definition cannot move. */
const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

const PUBLIC_CATALOGUE_NAME = "agents-inc";

/** The catalogue's name is a prefix of it; a loose match would hand it the built-in stacks. */
const CATALOGUE_LOOKALIKE_PACKAGE = `${PUBLIC_CATALOGUE_PACKAGE}-extra`;

/** Its scoped npm name is not publishable as a marketplace name. */
const LOOKALIKE_MARKETPLACE_NAME = "acme";

/** Taxonomy comes from a real catalogue entry: a fixture must not invent union members. */
const TAXONOMY_BASE: SkillId = "web-framework-react";

const LOCAL_TAXONOMY_BASE: SkillId = "web-state-zustand";

/** A marketplace skill placed in a built-in category, whose definition the catalogue then owes. */
const BUILT_IN_CATEGORY = "web-framework";

const MARKETPLACE_SKILL_ID = `${MARKETPLACE_NAME}-house-style`;

const MARKETPLACE_CATEGORY = `${MARKETPLACE_NAME}-conventions`;

/** A synthesized stand-in would not carry this name. */
const MARKETPLACE_CATEGORY_DISPLAY_NAME = "House Conventions";

/** `synthesizeCategory` writes "Auto-generated category for ..." instead. */
const MARKETPLACE_CATEGORY_DESCRIPTION = "How this marketplace writes things";

const MARKETPLACE_STACK_ID = `${MARKETPLACE_NAME}-starter`;

const STACK_AGENT = "web-developer";

const LOCAL_ONLY_SKILL_ID = "my-private-skill";

/** Named so the built-in assertion cannot pass on an empty list. */
const A_BUILT_IN_STACK_ID = "nextjs-fullstack";

/** Any order the synthesizer does not use. */
const MARKETPLACE_CATEGORY_ORDER = 1;

function marketplaceSkill(): TestSkill {
  return createTestSkill(TAXONOMY_BASE, "This marketplace's own house style", {
    id: MARKETPLACE_SKILL_ID,
    category: MARKETPLACE_CATEGORY,
  });
}

function skillInBuiltInCategory(): TestSkill {
  return createTestSkill(TAXONOMY_BASE, "This marketplace's own take on the framework", {
    id: MARKETPLACE_SKILL_ID,
  });
}

function localOnlySkill(): TestSkill {
  return createTestSkill(LOCAL_TAXONOMY_BASE, "A skill only this machine has", {
    id: LOCAL_ONLY_SKILL_ID,
  });
}

/** Skill plus its built plugin: `build marketplace` refuses a manifest with no plugins. */
async function publishMarketplaceSkill(marketplaceDir: string, skill: TestSkill): Promise<void> {
  await writeSourceSkill(path.join(marketplaceDir, SKILLS_DIR_PATH), skill.id, skill);
  await writeTestPluginManifest(path.join(marketplaceDir, PLUGINS_DIST_PATH, skill.id), {
    name: skill.id,
    version: DEFAULT_VERSION,
    description: skill.description,
  });
}

async function writeLocalSkill(baseDir: string, skill: TestSkill): Promise<void> {
  await writeSourceSkill(path.join(baseDir, LOCAL_SKILLS_PATH), skill.id, skill);
}

async function writeConfigModule(
  marketplaceDir: string,
  relPath: string,
  data: Record<string, unknown>,
): Promise<void> {
  await writeConfigModuleSource(marketplaceDir, relPath, renderConfigTs(data));
}

async function writeConfigModuleSource(
  marketplaceDir: string,
  relPath: string,
  source: string,
): Promise<void> {
  const filePath = path.join(marketplaceDir, relPath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, source);
}

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
        order: MARKETPLACE_CATEGORY_ORDER,
      },
    },
  });
}

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

/** Distinct from the SKILL.md description on purpose. */
const SHORT_LABEL = "Short label";

describe("build:marketplace catalog emission", () => {
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let catalogPath: string;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("build-marketplace-catalog-"));
    // Bun resolves `$HOME` once at startup, so the env var alone would not reach `os.homedir()`.
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

    /** The editor's preview needs the SKILL.md description the install writes, not the label. */
    it("carries the SKILL.md description beside the short label", async () => {
      const skill = marketplaceSkill();
      await appendFile(
        path.join(projectDir, SKILLS_DIR_PATH, skill.id, STANDARD_FILES.METADATA_YAML),
        `cliDescription: ${SHORT_LABEL}\n`,
      );

      await runCliCommand(["build:marketplace"]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(catalog.skills[MARKETPLACE_SKILL_ID]).toMatchObject({
        description: SHORT_LABEL,
        activationDescription: skill.description,
      });
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

      // A scoped npm name is not publishable, so `--name` is needed; the claim reads package.json.
      await runCliCommand(["build:marketplace", "--name", LOOKALIKE_MARKETPLACE_NAME]);

      const catalog = await readTestJson<Matrix>(catalogPath);
      expect(
        catalog.suggestedStacks,
        "the identity is the whole package name, so a prefix of it is somebody else",
      ).toStrictEqual([]);
    });
  });

  describe("a build refused while reading the catalogue", () => {
    beforeEach(async () => {
      await writeTestPackageJson(projectDir, { name: MARKETPLACE_NAME });
      await writeMarketplaceCategories(projectDir);
      await publishMarketplaceSkill(projectDir, marketplaceSkill());
    });

    it.each(CATALOGUE_CONFIG_MODULES)(
      "writes neither file when %s does not load",
      async (relPath) => {
        await writeConfigModuleSource(projectDir, relPath, renderUnparseableConfigTs());

        const { error } = await runCliCommand(["build:marketplace"]);

        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(error?.message).toContain(path.join(projectDir, relPath));
        expect(
          await fileExists(path.join(projectDir, PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON)),
          "a refused build writes nothing, so no manifest goes out without the catalogue beside it",
        ).toBe(false);
        expect(await fileExists(catalogPath)).toBe(false);
      },
    );
  });
});
