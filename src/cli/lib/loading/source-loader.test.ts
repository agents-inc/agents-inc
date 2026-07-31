import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import {
  loadSkillsMatrixFromSource,
  convertStackToResolvedStack,
  extractSourceName,
  mergeLocalSkillsIntoMatrix,
} from "./source-loader";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  createMockSkill,
  createMockSkillAssignment,
  createMockExtractedSkill,
} from "../__tests__/factories/skill-factories.js";
import { createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import { createMockStack } from "../__tests__/factories/stack-factories.js";
import {
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "../__tests__/factories/plugin-factories.js";
import { CLAUDE_DIR, STANDARD_DIRS, STANDARD_FILES, marketplaceManifestPath } from "../../consts";
import {
  createTestSource,
  cleanupTestSource,
  type TestDirs,
  type TestStack,
} from "../__tests__/fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS, EXTRA_DOMAIN_TEST_SKILLS } from "../__tests__/mock-data/mock-skills";
import type {
  CategoryDefinition,
  CategoryPath,
  ResolvedSkill,
  SkillId,
  SkillSlug,
} from "../../types";
import { renderConfigTs, renderSkillMd } from "../__tests__/content-generators";
import { defaultCategories } from "../configuration/default-categories";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { initializeMatrix } from "../matrix/matrix-provider";
import { LOCAL_DEFAULTS } from "../metadata-keys";
import type { LocalSkillDiscoveryResult } from "../skills";

const FIXTURE_SKILLS = [...DEFAULT_TEST_SKILLS, ...EXTRA_DOMAIN_TEST_SKILLS];

const FIXTURE_SKILL_COUNT = FIXTURE_SKILLS.length;

const BUILT_IN_CATEGORY_COUNT = Object.keys(defaultCategories).length;

const FIXTURE_STACKS: TestStack[] = [
  {
    id: "fixture-test-stack",
    name: "Fixture Test Stack",
    description: "A stack for source-loader tests",
    agents: {
      "web-developer": {
        "web-framework": "web-framework-react",
      },
    },
  },
];

let fixtureDirs: TestDirs;

beforeAll(async () => {
  fixtureDirs = await createTestSource({
    skills: FIXTURE_SKILLS,
    stacks: FIXTURE_STACKS,
  });
});

afterAll(async () => {
  await cleanupTestSource(fixtureDirs);
});

describe("source-loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-source-loader-test-");
    // Clear environment
    delete process.env.CC_SOURCE;
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    delete process.env.CC_SOURCE;
  });

  describe("loadSkillsMatrixFromSource", () => {
    describe("dev mode detection", () => {
      it("should use eject mode when devMode flag is explicitly set", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
          devMode: true,
        });

        // Should load from local source in dev mode
        expect(result.isLocal).toBe(true);
        expect(typeof result.matrix.version).toBe("string");
        const loadedSkillIds = Object.keys(result.matrix.skills);
        expect(loadedSkillIds).toHaveLength(FIXTURE_SKILL_COUNT);
        // Verify all fixture skills are present by ID
        for (const skill of FIXTURE_SKILLS) {
          expect(loadedSkillIds).toContain(skill.id);
        }
      });

      it("should use source flag when provided", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
        });

        expect(result.isLocal).toBe(true);
        expect(result.sourceConfig.source).toBe(fixtureDirs.sourceDir);
        expect(result.sourceConfig.sourceOrigin).toBe("flag");
      });
    });

    describe("local source loading", () => {
      it("should load matrix from local source", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
        });

        expect(typeof result.matrix.version).toBe("string");
        expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
        const loadedSkillIds = Object.keys(result.matrix.skills);
        expect(loadedSkillIds).toHaveLength(FIXTURE_SKILL_COUNT);
        // Verify specific fixture skills are present
        for (const skill of FIXTURE_SKILLS) {
          expect(loadedSkillIds).toContain(skill.id);
        }
      });

      it("should set sourcePath to the root path", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
        });

        expect(result.sourcePath).toBe(fixtureDirs.sourceDir);
      });

      it("should mark result as local", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
        });

        expect(result.isLocal).toBe(true);
      });

      it("should resolve marketplace name from the source's marketplace.json", async () => {
        const sourceDir = path.join(tempDir, "local-marketplace-source");
        await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });
        const manifestPath = marketplaceManifestPath(sourceDir);
        await mkdir(path.dirname(manifestPath), { recursive: true });
        await writeFile(
          manifestPath,
          JSON.stringify(
            createMockMarketplace([createMockMarketplacePlugin("web-framework-react")]),
          ),
        );

        const result = await loadSkillsMatrixFromSource({
          sourceFlag: sourceDir,
          projectDir: tempDir,
          skipExtraSources: true,
        });

        expect(result.marketplace).toBe("test-marketplace");
      });

      it("should leave marketplace undefined when the local source has no marketplace.json", async () => {
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: fixtureDirs.sourceDir,
          projectDir: tempDir,
          skipExtraSources: true,
        });

        expect(result.marketplace).toBeUndefined();
      });
    });

    describe("matrixOnly", () => {
      it("should resolve the default source offline with the built-in matrix and empty sourcePath", async () => {
        // No sourceFlag, no env var, no config in projectDir — resolves to
        // DEFAULT_SOURCE. Without matrixOnly this branch fetches the source
        // clone (a network call on a cold cache); with it the fetch is skipped,
        // so a regression here fails with a fetch error instead of passing.
        const result = await loadSkillsMatrixFromSource({
          projectDir: tempDir,
          skipExtraSources: true,
          matrixOnly: true,
        });

        expect(result.sourcePath).toBe("");
        expect(result.isLocal).toBe(false);
        expect(Object.keys(result.matrix.skills)).toStrictEqual(
          Object.keys(BUILT_IN_MATRIX.skills),
        );
      });
    });

    describe("error handling", () => {
      it("should return empty skills for non-existent skills directory", async () => {
        // With new architecture: matrix loads from CLI repo (always succeeds)
        // Skills extraction gracefully returns empty for non-existent paths
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: "/non/existent/path",
          projectDir: tempDir,
        });

        // Matrix loads from CLI, but no skills from non-existent path
        expect(typeof result.matrix.version).toBe("string");
        expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
        // No skills should be extracted from non-existent source
        expect(Object.keys(result.matrix.skills)).toHaveLength(0);
      });

      it("should return empty skills if skills directory is missing", async () => {
        // Create a directory without src/skills/
        const emptySource = path.join(tempDir, "empty-source");
        await mkdir(emptySource, { recursive: true });

        // With new architecture: matrix loads from CLI repo (always succeeds)
        // Skills extraction gracefully returns empty for missing src/skills/
        const result = await loadSkillsMatrixFromSource({
          sourceFlag: emptySource,
          projectDir: tempDir,
        });

        expect(typeof result.matrix.version).toBe("string");
        expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
        // No skills should be extracted when src/skills/ directory is missing
        expect(Object.keys(result.matrix.skills)).toHaveLength(0);
      });
    });
  });
});

describe("source-loader local skills integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-local-skills-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should merge local skills into matrix when .claude/skills exists", async () => {
    // Create a local skill in the temp project
    const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "test-my-skill");
    await mkdir(skillsDir, { recursive: true });

    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: My Local Skill\nslug: my-local-skill\ncliDescription: A local skill\ndomain: web\ncategory: dummy-category\ncustom: true`,
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("my-local-skill", "A local skill", "Content"),
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    // Local skill should be in the matrix with normalized ID
    // Boundary cast: skills keys are branded SkillId, widened to string for test indexing
    const skills = result.matrix.skills as Record<string, ResolvedSkill>;
    const localSkill = skills["my-local-skill"];

    expect(localSkill).toStrictEqual(
      expect.objectContaining({
        id: "my-local-skill",
        category: "dummy-category",
        author: "@dummy-author",
        local: true,
        localPath: path.join(tempDir, ".claude/skills", "test-my-skill") + path.sep,
      }),
    );
  });

  it("should not inject fake local category definitions into the matrix", async () => {
    const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "test-cat-skill");
    await mkdir(skillsDir, { recursive: true });

    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: Category Test\nslug: cat-skill\ndomain: web\ncategory: dummy-category\ncustom: true`,
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      `---\nname: cat-skill (@local)\ndescription: Category test\n---\nContent`,
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    // Local skills should NOT cause fake "local" or "local/custom" categories to be injected
    // The skill uses whatever category it declared (or "local" default from local-skill-loader)
    // Boundary cast: categories keys are branded Category, widened to string for test indexing
    expect(
      (result.matrix.categories as Record<string, CategoryDefinition>)["local/custom"],
    ).toBeUndefined();
  });

  it("should not modify matrix when no local skills exist", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir, // No .claude/skills directory
    });

    // Local categories should NOT be added if no local skills
    // (Matrix may already have local categories from previous tests,
    // so we check that no local skills are in the skills object)
    const localSkills = Object.values(result.matrix.skills).filter((s) => s!.local === true);
    expect(localSkills).toHaveLength(0);
  });

  it("should preserve remote skill category when local skill overwrites with category 'local'", async () => {
    // Use a known fixture skill with a domain-mapped category
    const targetSkillId = "web-framework-react";
    const expectedCategory = "web-framework";

    // Create a local skill with the SAME ID but a different category in metadata
    // (source-loader preserves the remote skill's category when overwriting)
    const skillsDir = path.join(
      tempDir,
      CLAUDE_DIR,
      STANDARD_DIRS.SKILLS,
      "test-override-category",
    );
    await mkdir(skillsDir, { recursive: true });

    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: Override Test\nslug: override-test\ndomain: web\ncategory: web-styling`,
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(targetSkillId, "Local override", "Content"),
    );

    // Load with the local skill override
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    // Boundary cast: branded SkillId key widened to string for test indexing
    const overriddenSkill = (result.matrix.skills as Record<string, ResolvedSkill>)[targetSkillId];

    expect(overriddenSkill).toStrictEqual(
      expect.objectContaining({
        local: true,
        // The category should be preserved from the remote skill
        category: expectedCategory,
      }),
    );
  });

  it("should preserve existing skills when merging local skills", async () => {
    const skillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "test-preserve");
    await mkdir(skillsDir, { recursive: true });

    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: Preserve Test\nslug: preserve-test\ndomain: web\ncategory: dummy-category\ncustom: true`,
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("preserve-skill", "Preserve test", "Content"),
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
      projectDir: tempDir,
    });

    // Existing marketplace skills should still be present
    const marketplaceSkills = Object.values(result.matrix.skills).filter((s) => s!.local !== true);
    expect(marketplaceSkills.length).toBe(FIXTURE_SKILL_COUNT);

    // Local skill should also be present with normalized ID
    // Boundary cast: branded SkillId key widened to string for test indexing
    expect((result.matrix.skills as Record<string, ResolvedSkill>)["preserve-skill"]).toStrictEqual(
      expect.objectContaining({ id: "preserve-skill", local: true }),
    );
  });

  it("P1-19: local skill takes precedence over plugin skill with same ID", async () => {
    // Create a source directory with a marketplace skill
    const sourceDir = path.join(tempDir, "precedence-source");
    const skillDir = path.join(
      sourceDir,
      "src",
      STANDARD_DIRS.SKILLS,
      "web",
      "testing",
      "web-testing-vitest",
    );
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(
        "web-testing-vitest",
        "Marketplace vitest configuration",
        "Marketplace vitest skill content.",
      ),
    );
    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      'category: web-testing\nauthor: "@test"\ndisplayName: Vitest\ncliDescription: Marketplace vitest configuration\ncontentHash: abc1234\ndomain: web\nslug: vitest\n',
    );

    // Load skills from source to verify marketplace skill is present
    const initialResult = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    const existingSkillId = "web-testing-vitest";
    const existingSkill = initialResult.matrix.skills[existingSkillId]!;
    expect(existingSkill).toStrictEqual(
      expect.objectContaining({
        id: existingSkillId,
        description: "Marketplace vitest configuration",
      }),
    );
    expect(existingSkill.local).toBeUndefined(); // Should be a marketplace skill
    expect(existingSkill.description).toBe("Marketplace vitest configuration");

    // Create a local skill with the SAME ID to override it
    const localSkillsDir = path.join(tempDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS, "local-vitest");
    await mkdir(localSkillsDir, { recursive: true });

    await writeFile(
      path.join(localSkillsDir, STANDARD_FILES.METADATA_YAML),
      `displayName: My Custom Vitest\nslug: vitest\ndomain: web\ncategory: web-testing`,
    );
    await writeFile(
      path.join(localSkillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd(
        "web-testing-vitest",
        "My custom vitest configuration",
        "This is my local override of the vitest skill.",
      ),
    );

    // Load again with the local skill in place
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // The skill should now be the LOCAL version, not the marketplace version
    const overriddenSkill = result.matrix.skills[existingSkillId]!;
    expect(overriddenSkill).toStrictEqual(
      expect.objectContaining({
        local: true,
        description: "My custom vitest configuration",
        author: "@dummy-author",
        // When overwriting a remote skill, the remote skill's category is inherited
        category: existingSkill.category,
        localPath: path.join(tempDir, ".claude/skills", "local-vitest") + path.sep,
      }),
    );
    // Verify the original description was different (proves we actually overwrote something)
    expect(overriddenSkill.description).not.toBe(existingSkill.description);
  });
});

describe("source-loader config-driven paths", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-config-paths-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should use custom skillsDir from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-source");

    // Create source config with custom skillsDir
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { skillsDir: "lib/skills" };',
    );

    // Create skills in the custom directory
    const skillsDir = path.join(
      sourceDir,
      "lib",
      STANDARD_DIRS.SKILLS,
      "web",
      "framework",
      "react",
    );
    await mkdir(skillsDir, { recursive: true });
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("web-framework-react", "React framework", "React skill content"),
    );
    await writeFile(
      path.join(skillsDir, STANDARD_FILES.METADATA_YAML),
      'category: web-framework\nauthor: "@test"\ndisplayName: React\ncliDescription: React framework\nusageGuidance: Use React for building UIs\ncontentHash: abc1234\ndomain: web\nslug: react\n',
    );

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Skill should be loaded from custom path
    expect(result.matrix.skills["web-framework-react"]).toStrictEqual(
      expect.objectContaining({ id: "web-framework-react" }),
    );
  });

  it("should use custom categoriesFile path from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-categories-source");

    // Create source config with custom categoriesFile pointing to a non-existent path
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { categoriesFile: "data/categories.yaml" };',
    );

    // Do NOT create categories at data/categories.yaml — loader should fall back to CLI categories
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Falls back to CLI categories since custom path doesn't exist
    expect(typeof result.matrix.version).toBe("string");
    expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
  });

  it("should use custom rulesFile path from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-rules-source");

    // Create source config with custom rulesFile pointing to a non-existent path
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { rulesFile: "data/rules.yaml" };',
    );

    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Falls back to CLI rules since custom path doesn't exist
    expect(typeof result.matrix.version).toBe("string");
  });

  it("should use custom stacksFile from source config", async () => {
    const sourceDir = path.join(tempDir, "custom-stacks-source");

    // Create source config with custom stacksFile
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { stacksFile: "data/stacks.ts" };',
    );

    // Create stacks at the custom path
    const dataDir = path.join(sourceDir, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "stacks.ts"),
      renderConfigTs({
        stacks: [
          {
            id: "custom-path-stack",
            name: "Custom Path Stack",
            description: "Stack from custom path",
            agents: { "web-developer": { "web-framework": "web-framework-react" } },
          },
        ],
      }),
    );

    // Create empty skills dir
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    expect(result.matrix.suggestedStacks).toHaveLength(1);
    expect(result.matrix.suggestedStacks[0].id).toBe("custom-path-stack");
  });

  it("should fall back to convention defaults when source has no config", async () => {
    const sourceDir = path.join(tempDir, "no-config-source");

    // No .claude-src/config.ts — just create conventional paths
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Should still work using convention defaults
    expect(typeof result.matrix.version).toBe("string");
    expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
  });

  it("should fall back to convention defaults when config has no path overrides", async () => {
    const sourceDir = path.join(tempDir, "config-no-paths-source");

    // Create source config WITHOUT path fields
    const configDir = path.join(sourceDir, ".claude-src");
    await mkdir(configDir, { recursive: true });
    await writeFile(
      path.join(configDir, STANDARD_FILES.CONFIG_TS),
      'export default { source: "github:myorg/skills" };',
    );

    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Should still work using convention defaults
    expect(typeof result.matrix.version).toBe("string");
    expect(Object.keys(result.matrix.categories)).toHaveLength(BUILT_IN_CATEGORY_COUNT);
  });
});

describe("source-loader integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-integration-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should load all skills from local source", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
    });

    // Verify all fixture skills are present (built-in matrix may add more)
    const loadedSkillIds = Object.keys(result.matrix.skills);
    expect(loadedSkillIds.length).toBeGreaterThanOrEqual(FIXTURE_SKILL_COUNT);
    for (const skill of FIXTURE_SKILLS) {
      expect(loadedSkillIds).toContain(skill.id);
    }

    // Verify a known skill has meaningful properties from the fixture data
    const reactSkill = result.matrix.skills["web-framework-react"]!;
    expect(reactSkill).toStrictEqual(
      expect.objectContaining({
        id: "web-framework-react",
        category: "web-framework",
      }),
    );
    expect(reactSkill.path).toContain("web-framework/web-framework-react");
  });

  it("should load suggested stacks", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
    });

    // Should contain the fixture stack
    const fixtureStack = result.matrix.suggestedStacks.find((s) => s.id === "fixture-test-stack");
    expect(fixtureStack).toStrictEqual(
      expect.objectContaining({
        id: "fixture-test-stack",
        name: "Fixture Test Stack",
      }),
    );
    expect(fixtureStack!.allSkillIds).toContain("web-framework-react");
  });

  it("should load stacks from source when source has config/stacks.ts", async () => {
    // Create a source directory with its own stacks.ts
    const sourceDir = path.join(tempDir, "custom-source");
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    // Write a minimal custom stacks.ts with a unique stack ID
    await writeFile(
      path.join(configDir, "stacks.ts"),
      renderConfigTs({
        stacks: [
          {
            id: "custom-test-stack",
            name: "Custom Test Stack",
            description: "A test stack from the source",
            agents: { "web-developer": { "web-framework": "web-framework-react" } },
          },
        ],
      }),
    );

    // Create an empty src/skills dir so extractAllSkills doesn't fail
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Should load the custom stack from source, not CLI stacks
    expect(result.matrix.suggestedStacks).toHaveLength(1);
    expect(result.matrix.suggestedStacks[0].id).toBe("custom-test-stack");
    expect(result.matrix.suggestedStacks[0].name).toBe("Custom Test Stack");
  });

  it("should fall back to CLI stacks when source has no config/stacks.ts", async () => {
    // Create a source directory without stacks.ts
    const sourceDir = path.join(tempDir, "no-stacks-source");
    await mkdir(path.join(sourceDir, "src", STANDARD_DIRS.SKILLS), { recursive: true });

    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDir,
      projectDir: tempDir,
    });

    // Should fall back to CLI's stacks (which has multiple stacks)
    expect(result.matrix.suggestedStacks.length).toBeGreaterThan(1);
  });

  it("should load categories", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: fixtureDirs.sourceDir,
    });

    const categoryIds = Object.keys(result.matrix.categories);
    // Categories come from the CLI's built-in matrix — verify known categories exist
    expect(categoryIds).toContain("web-framework");
    expect(categoryIds).toContain("web-testing");
    expect(categoryIds).toContain("api-api");
    expect(categoryIds.length).toBeGreaterThan(10);
  });
});

describe("extractSourceName", () => {
  it("should strip github: protocol and return org name", () => {
    expect(extractSourceName("github:agents-inc/skills")).toBe("agents-inc");
  });

  it("should strip gh: protocol and return org name", () => {
    expect(extractSourceName("gh:acme-corp/claude-skills")).toBe("acme-corp");
  });

  it("should strip gitlab: protocol and return org name", () => {
    expect(extractSourceName("gitlab:myorg/repo")).toBe("myorg");
  });

  it("should strip bitbucket: protocol and return org name", () => {
    expect(extractSourceName("bitbucket:team/repo")).toBe("team");
  });

  it("should strip sourcehut: protocol and return org name", () => {
    expect(extractSourceName("sourcehut:user/project")).toBe("user");
  });

  it("should strip https:// URL and return org name", () => {
    expect(extractSourceName("https://github.com/acme-corp/repo")).toBe("acme-corp");
  });

  it("should strip https:// URL with .git suffix", () => {
    expect(extractSourceName("https://github.com/org/repo.git")).toBe("org");
  });

  it("should return first segment of plain path", () => {
    expect(extractSourceName("org/repo")).toBe("org");
  });

  it("should return the source itself when no slash is present", () => {
    expect(extractSourceName("single-segment")).toBe("single-segment");
  });

  it("should return full source for empty string", () => {
    expect(extractSourceName("")).toBe("");
  });

  it("should handle http:// URLs", () => {
    expect(extractSourceName("http://gitlab.example.com/team/repo")).toBe("team");
  });

  it("should handle complex paths after protocol stripping", () => {
    expect(extractSourceName("github:deep-org/nested-repo/subdir")).toBe("deep-org");
  });
});

describe("convertStackToResolvedStack", () => {
  const reactSkill = createMockSkill("web-framework-react");
  const zustandSkill = createMockSkill("web-state-zustand");
  const honoSkill = createMockSkill("api-framework-hono");

  beforeEach(() => {
    // convertStackToResolvedStack reads from the module-level currentMatrix
    // via `a.id in currentMatrix.skills`, so we must seed it
    const testMatrix = createMockMatrix(reactSkill, zustandSkill, honoSkill);
    initializeMatrix(testMatrix);
  });

  it("should convert an empty stack", () => {
    const stack = createMockStack("empty", {
      name: "Empty Stack",
      agents: {},
    });

    const resolved = convertStackToResolvedStack(stack);

    expect(resolved.id).toBe("empty");
    expect(resolved.name).toBe("Empty Stack");
    expect(resolved.allSkillIds).toStrictEqual([]);
    expect(resolved.skills).toStrictEqual({});
    expect(resolved.philosophy).toBe("");
  });

  it("should convert a single-agent stack", () => {
    const stack = createMockStack("single", {
      name: "Single Agent",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    expect(resolved.id).toBe("single");
    expect(resolved.name).toBe("Single Agent");
    expect(resolved.allSkillIds).toContain("web-framework-react");
    // Boundary cast: branded Category key widened to string for test indexing
    const agentSkills = resolved.skills["web-developer"] as Record<string, SkillId[]>;
    expect(agentSkills).toStrictEqual({ "web-framework": ["web-framework-react"] });
  });

  it("should convert a multi-agent stack with shared skills", () => {
    const stack = createMockStack("multi", {
      name: "Multi Agent",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
          "web-client-state": [createMockSkillAssignment("web-state-zustand")],
        },
        "api-developer": {
          "api-api": [createMockSkillAssignment("api-framework-hono")],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    expect(resolved.allSkillIds).toHaveLength(3);
    expect(resolved.allSkillIds).toContain("web-framework-react");
    expect(resolved.allSkillIds).toContain("web-state-zustand");
    expect(resolved.allSkillIds).toContain("api-framework-hono");

    expect(resolved.skills["web-developer"]).toStrictEqual({
      "web-framework": ["web-framework-react"],
      "web-client-state": ["web-state-zustand"],
    });
    expect(resolved.skills["api-developer"]).toStrictEqual({
      "api-api": ["api-framework-hono"],
    });
  });

  it("should deduplicate skill IDs across agents", () => {
    const stack = createMockStack("shared", {
      name: "Shared Skills",
      agents: {
        "web-developer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
        },
        "web-reviewer": {
          "web-framework": [createMockSkillAssignment("web-framework-react")],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    // The same skill appears in both agents, but allSkillIds should be deduplicated
    expect(resolved.allSkillIds).toHaveLength(1);
    expect(resolved.allSkillIds).toStrictEqual(["web-framework-react"]);
  });

  it("should filter out skills not present in the current matrix", () => {
    const stack = createMockStack("filtered", {
      name: "Filtered",
      agents: {
        "web-developer": {
          "web-framework": [
            createMockSkillAssignment("web-framework-react"),
            // Boundary cast: deliberately invalid skill ID for test
            createMockSkillAssignment("web-framework-nonexistent" as SkillId),
          ],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    // Only the valid skill should appear in the per-agent category mapping
    const agentSkills = resolved.skills["web-developer"] as Record<string, SkillId[]>;
    expect(agentSkills["web-framework"]).toStrictEqual(["web-framework-react"]);
  });

  it("should preserve stack philosophy", () => {
    const stack = createMockStack("with-philosophy", {
      name: "Philosophical",
      agents: {},
      philosophy: "Modern type-safe development",
    });

    const resolved = convertStackToResolvedStack(stack);

    expect(resolved.philosophy).toBe("Modern type-safe development");
  });

  it("should skip empty assignment arrays", () => {
    const stack = createMockStack("empty-assignments", {
      name: "Empty Assignments",
      agents: {
        "web-developer": {
          "web-framework": [],
        },
      },
    });

    const resolved = convertStackToResolvedStack(stack);

    // Empty category should not appear in agent skills
    const agentSkills = resolved.skills["web-developer"] as Record<string, SkillId[]> | undefined;
    expect(agentSkills?.["web-framework"]).toBeUndefined();
    expect(resolved.allSkillIds).toHaveLength(0);
  });
});

describe("mergeLocalSkillsIntoMatrix", () => {
  it("should add a local skill to an empty matrix", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom-skill/",
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    // Boundary cast: branded SkillId key widened to string for test indexing
    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-tooling-custom"]).toStrictEqual(
      expect.objectContaining({
        id: "web-tooling-custom",
        local: true,
        author: LOCAL_DEFAULTS.AUTHOR,
      }),
    );
  });

  it("should inherit category from existing remote skill when overwriting", () => {
    const remoteSkill = createMockSkill("web-framework-react");
    const matrix = createMockMatrix(remoteSkill);

    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-framework-react", {
          local: true,
          localPath: "/project/.claude/skills/react-override/",
          // Local skill declares different category, but remote's should be preserved
          category: "web-styling",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    // Should inherit the remote skill's category, not the local's declaration
    expect(skills["web-framework-react"].category).toBe("web-framework");
    expect(skills["web-framework-react"].local).toBe(true);
  });

  it("should use local skill category when no remote skill exists", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          // Boundary cast: custom category not in generated union
          category: "web-tooling" as CategoryPath,
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-tooling-custom"].category).toBe("web-tooling");
  });

  it("should inherit slug and displayName from existing remote skill", () => {
    const remoteSkill = createMockSkill("web-framework-react", {
      slug: "react",
      displayName: "React",
    });
    const matrix = createMockMatrix(remoteSkill);

    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-framework-react", {
          local: true,
          localPath: "/project/.claude/skills/react/",
          // Boundary cast: test slug not in generated union
          slug: "local-react" as SkillSlug,
          displayName: "Local React",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    // Should preserve slug and displayName from the remote skill
    expect(skills["web-framework-react"].slug).toBe("react");
    expect(skills["web-framework-react"].displayName).toBe("React");
  });

  it("should preserve existing skills when adding new local skills", () => {
    const existingSkill = createMockSkill("web-framework-react");
    const matrix = createMockMatrix(existingSkill);

    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    // Both existing and new skill should be present
    expect(skills["web-framework-react"]).toStrictEqual(
      expect.objectContaining({ id: "web-framework-react" }),
    );
    expect(skills["web-tooling-custom"]).toStrictEqual(
      expect.objectContaining({ id: "web-tooling-custom", local: true }),
    );
    // Existing skill should not be marked as local
    expect(skills["web-framework-react"].local).toBeUndefined();
  });

  it("should add category definition for local skill when category does not exist", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          // Boundary cast: custom category not in generated union
          category: "web-tooling" as CategoryPath,
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    // Should have created a category definition for web-tooling
    // Boundary cast: branded Category key widened to string for test indexing
    const categories = result.categories as Record<string, CategoryDefinition>;
    expect(categories["web-tooling"]).toStrictEqual(
      expect.objectContaining({
        id: "web-tooling",
        domain: "web",
        exclusive: false,
        required: false,
        order: 0,
      }),
    );
  });

  it("should NOT add category definition when category is 'local'", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-local-skill" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          category: "local",
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const categories = result.categories as Record<string, CategoryDefinition>;
    expect(categories["local"]).toBeUndefined();
  });

  it("should handle multiple local skills", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          domain: "web",
        }),
        createMockExtractedSkill("api-database-drizzle", {
          local: true,
          localPath: "/project/.claude/skills/drizzle/",
          domain: "api",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-tooling-custom"].local).toBe(true);
    expect(skills["api-database-drizzle"].local).toBe(true);
  });

  it("should inherit conflict and relationship data from existing remote skill", () => {
    const remoteSkill = createMockSkill("web-framework-react", {
      conflictsWith: [{ skillId: "web-framework-vue-composition-api", reason: "Choose one" }],
      isRecommended: true,
      recommendedReason: "Most popular",
      requires: [{ skillIds: ["web-state-zustand"], needsAny: false, reason: "State needed" }],
    });
    const matrix = createMockMatrix(remoteSkill);

    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-framework-react", {
          local: true,
          localPath: "/project/.claude/skills/react/",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    const mergedSkill = skills["web-framework-react"];
    expect(mergedSkill.conflictsWith).toStrictEqual([
      { skillId: "web-framework-vue-composition-api", reason: "Choose one" },
    ]);
    expect(mergedSkill.isRecommended).toBe(true);
    expect(mergedSkill.recommendedReason).toBe("Most popular");
    expect(mergedSkill.requires).toStrictEqual([
      { skillIds: ["web-state-zustand"], needsAny: false, reason: "State needed" },
    ]);
  });

  it("should mark custom local skills with their custom flag", () => {
    const matrix = createMockMatrix();
    const localResult: LocalSkillDiscoveryResult = {
      skills: [
        createMockExtractedSkill("web-tooling-custom" as SkillId, {
          local: true,
          localPath: "/project/.claude/skills/custom/",
          custom: true,
          domain: "web",
        }),
      ],
      localSkillsPath: "/project/.claude/skills",
    };

    const result = mergeLocalSkillsIntoMatrix(matrix, localResult);

    const skills = result.skills as Record<string, ResolvedSkill>;
    expect(skills["web-tooling-custom"].custom).toBe(true);
  });
});
