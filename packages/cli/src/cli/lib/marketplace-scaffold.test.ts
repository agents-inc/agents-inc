import path from "path";
import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "./__tests__/test-fs-utils";
import {
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  STACKS_FILE_PATH,
  STANDARD_FILES,
} from "../consts";
import { loadSkillCategories, loadSkillRules } from "./matrix";
import { loadStacks } from "./stacks";
import { parseFrontmatter } from "./loading/loader";
import { validateSkillMetadata } from "./schemas";
import { exampleSkillId, writeMarketplaceScaffold } from "./marketplace-scaffold";

/** The name every scaffold under test publishes under. */
const MARKETPLACE_NAME = "acme";

/** The single skill a scaffold ships, composed the way the scaffold composes it. */
const EXAMPLE_SKILL_ID = `${MARKETPLACE_NAME}-example-skill`;

/**
 * Every file the published guide promises a marketplace directory holds, relative
 * to its root and sorted — the writer's own return value is compared against this
 * whole set, because a count passes for the right number of wrong files.
 */
const PROMISED_FILES = [
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  STACKS_FILE_PATH,
  STANDARD_FILES.PACKAGE_JSON,
  path.join(SKILLS_DIR_PATH, EXAMPLE_SKILL_ID, STANDARD_FILES.METADATA_YAML),
  path.join(SKILLS_DIR_PATH, EXAMPLE_SKILL_ID, STANDARD_FILES.SKILL_MD),
].sort();

describe("exampleSkillId", () => {
  it("prefixes the bare id with the marketplace's own name", () => {
    expect(exampleSkillId(MARKETPLACE_NAME)).toBe(EXAMPLE_SKILL_ID);
  });

  it("carries a hyphenated marketplace name through whole", () => {
    expect(exampleSkillId("acme-skills")).toBe("acme-skills-example-skill");
  });
});

describe("writeMarketplaceScaffold", () => {
  let tempDir: string;
  let marketplaceDir: string;
  let written: string[];

  beforeEach(async () => {
    tempDir = await createTempDir("marketplace-scaffold-");
    marketplaceDir = path.join(tempDir, MARKETPLACE_NAME);
    written = await writeMarketplaceScaffold(marketplaceDir, MARKETPLACE_NAME);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("reports every file it wrote, and reports no others", () => {
    expect([...written].sort()).toStrictEqual(PROMISED_FILES);
  });

  it("writes a package.json build marketplace can read its identity out of", async () => {
    const pkg: unknown = JSON.parse(
      await readFile(path.join(marketplaceDir, STANDARD_FILES.PACKAGE_JSON), "utf-8"),
    );

    expect(pkg).toMatchObject({
      name: MARKETPLACE_NAME,
      version: expect.any(String),
      description: expect.any(String),
      // An absent author builds `owner: { name: "" }`, and the schema the CLI reads
      // a marketplace.json back with requires a non-empty owner name — so a
      // marketplace with no author builds one that then loads as none at all.
      author: { name: `@${MARKETPLACE_NAME}` },
    });
  });

  it("writes categories the loader accepts, each carrying a domain", async () => {
    const categories = await loadSkillCategories(path.join(marketplaceDir, SKILL_CATEGORIES_PATH));

    const definitions = Object.values(categories);
    expect(definitions.length).toBeGreaterThan(0);
    for (const definition of definitions) {
      expect(
        definition.domain,
        "a category with no domain appears in no wizard domain view",
      ).toBeTruthy();
    }
  });

  it("writes rules the loader accepts, declaring no relationship at all", async () => {
    const rules = await loadSkillRules(path.join(marketplaceDir, SKILL_RULES_PATH));

    expect(rules.version).toBe("1.0.0");
    expect(
      rules.relationships,
      "a marketplace cannot name its own skills in a rule yet, so the scaffold names none",
    ).toStrictEqual({ conflicts: [], discourages: [], requires: [], alternatives: [] });
  });

  it("writes one stack whose every assignment names the scaffolded skill", async () => {
    const stacks = await loadStacks(marketplaceDir);

    expect(stacks.length).toBe(1);
    const assignedIds = Object.values(stacks[0]?.agents ?? {}).flatMap((agentConfig) =>
      Object.values(agentConfig).flatMap((assignments) =>
        assignments.map((assignment) => assignment.id),
      ),
    );
    expect(assignedIds.length).toBeGreaterThan(0);
    expect([...new Set(assignedIds)]).toStrictEqual([EXAMPLE_SKILL_ID]);
  });

  it("names the skill by its namespaced id in the frontmatter the loader reads", async () => {
    const skillMd = await readFile(
      path.join(marketplaceDir, SKILLS_DIR_PATH, EXAMPLE_SKILL_ID, STANDARD_FILES.SKILL_MD),
      "utf-8",
    );

    expect(parseFrontmatter(skillMd, STANDARD_FILES.SKILL_MD)?.name).toBe(EXAMPLE_SKILL_ID);
  });

  it("writes metadata that satisfies the judgement doctor applies to it", async () => {
    const rawMetadata: unknown = parseYaml(
      await readFile(
        path.join(marketplaceDir, SKILLS_DIR_PATH, EXAMPLE_SKILL_ID, STANDARD_FILES.METADATA_YAML),
        "utf-8",
      ),
    );

    const result = validateSkillMetadata(rawMetadata);
    expect(
      result.success,
      `the scaffolded metadata.yaml must validate: ${JSON.stringify(result.error?.issues)}`,
    ).toBe(true);
  });

  it("places the skill in a category the categories file declares", async () => {
    const [categories, rawMetadata] = await Promise.all([
      loadSkillCategories(path.join(marketplaceDir, SKILL_CATEGORIES_PATH)),
      readFile(
        path.join(marketplaceDir, SKILLS_DIR_PATH, EXAMPLE_SKILL_ID, STANDARD_FILES.METADATA_YAML),
        "utf-8",
      ).then((raw): unknown => parseYaml(raw)),
    ]);

    const category = (rawMetadata as { category?: string }).category;
    expect(category).toBeDefined();
    expect(
      Object.keys(categories),
      "a skill in a category the marketplace never declares reaches no wizard view",
    ).toContain(category);
  });
});
