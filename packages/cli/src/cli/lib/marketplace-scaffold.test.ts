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

const MARKETPLACE_NAME = "acme";

const EXAMPLE_SKILL_ID = `${MARKETPLACE_NAME}-example-skill`;

/** Compared as a whole set: a count passes for the right number of wrong files. */
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
      // An absent author builds an empty owner name, which the schema rejects on load.
      author: { name: `@${MARKETPLACE_NAME}` },
    });
  });

  it("writes categories the loader accepts, each carrying a domain", async () => {
    const categories = await loadSkillCategories(path.join(marketplaceDir, SKILL_CATEGORIES_PATH));

    const definitions = Object.values(categories);
    expect(definitions.length).toBeGreaterThan(0);
    for (const definition of definitions) {
      expect(definition.domain, "a category with no domain appears in no domain view").toBeTruthy();
    }
  });

  // Over the emitted text: the schema strips unknown keys silently.
  it("emits a category as exactly the fields it declares", async () => {
    const emitted = await readFile(path.join(marketplaceDir, SKILL_CATEGORIES_PATH), "utf-8");

    expect(emitted).toMatchInlineSnapshot(`
      "// The categories this marketplace's skills fall into.
      export default {
        "version": "1.0.0",
        "categories": {
          "web-example": {
            "id": "web-example",
            "displayName": "Example",
            "description": "Replace this with a category of your own",
            "domain": "web",
            "exclusive": false,
            "order": 1
          }
        }
      };
      "
    `);
  });

  // Over the emitted text: a comment or a description is read by a person, never by the loader.
  const emittedAt = (relativePath: string) =>
    readFile(path.join(marketplaceDir, relativePath), "utf-8");

  it("emits the rules with the comment that says what they may name", async () => {
    expect(await emittedAt(SKILL_RULES_PATH)).toMatchInlineSnapshot(`
      "// Relationships between skills — conflicts, requires, alternatives.
      //
      // Rules may only name skills the public catalogue carries; this marketplace's own
      // skills cannot be named here yet, and a rule that names one will not load.
      export default {
        "version": "1.0.0"
      };
      "
    `);
  });

  it("emits the starter stack word for word", async () => {
    expect(await emittedAt(STACKS_FILE_PATH)).toMatchInlineSnapshot(`
      "// The stacks this marketplace offers.
      export default {
        "stacks": [
          {
            "id": "acme-starter",
            "name": "acme starter",
            "description": "Every skill acme ships",
            "agents": {
              "web-developer": {
                "web-example": [
                  {
                    "id": "acme-example-skill"
                  }
                ]
              }
            }
          }
        ]
      };
      "
    `);
  });

  it("emits the package.json word for word", async () => {
    expect(await emittedAt(STANDARD_FILES.PACKAGE_JSON)).toMatchInlineSnapshot(`
      "{
        "name": "acme",
        "version": "0.1.0",
        "description": "Skills curated for acme's conventions",
        "author": {
          "name": "@acme"
        }
      }
      "
    `);
  });

  it("emits the example skill's metadata word for word", async () => {
    expect(
      await emittedAt(path.join(SKILLS_DIR_PATH, EXAMPLE_SKILL_ID, STANDARD_FILES.METADATA_YAML)),
    ).toMatchInlineSnapshot(`
      "custom: true
      domain: web
      author: "@acme"
      displayName: Example Skill
      category: web-example
      slug: example-skill
      cliDescription: "A placeholder skill to replace with your own"
      usageGuidance: "Use when you need a worked example of this marketplace's skill shape"
      "
    `);
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
      "a skill in a category the marketplace never declares reaches no view",
    ).toContain(category);
  });
});
