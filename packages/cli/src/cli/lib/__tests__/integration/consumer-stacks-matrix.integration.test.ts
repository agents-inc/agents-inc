import { afterEach, beforeEach, describe, expect, it } from "vitest";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { writeSourceSkill } from "../helpers/disk-writers.js";
import { SKILLS } from "../test-fixtures";
import { STANDARD_FILES } from "../../../consts";

import { createTestSource, cleanupTestSource, type TestDirs } from "../fixtures/create-test-source";
import { resolveInstallPaths } from "../../installation/install-base-dir";
import { writeProjectConfig } from "../../operations/project/write-project-config.js";
import { installThroughOperations } from "../helpers/install-through-operations.js";
import type { ProjectConfig, ResolvedSkill, SkillId } from "../../../types";
import { buildWizardResult, initMatrixAndSource } from "../factories/config-factories.js";
import { createMockMatrix } from "../factories/matrix-factories.js";
import { readTestTsConfig } from "../helpers/config-io.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { fileExists, directoryExists, createTempDir, cleanupTempDir } from "../test-fs-utils";
import { expectConfigSkills } from "../assertions/index.js";
import { loadStacks, loadStackById } from "../../stacks/stacks-loader";
import { extractAllSkills, mergeMatrixWithSkills } from "../../matrix";
import {
  CUSTOM_TEST_STACKS,
  PHILOSOPHY_TEST_STACKS,
  OVERRIDING_TEST_STACKS,
  MARKETPLACE_TEST_STACKS,
  MARKETPLACE_FULLSTACK_TEST_STACKS,
  PIPELINE_TEST_STACKS,
  MULTI_TEST_STACKS,
} from "../mock-data/mock-stacks.js";
import {
  TOOLING_AND_FRAMEWORK_CONFIG,
  CI_CD_CONFIG,
  FRAMEWORK_AND_STYLING_CONFIG,
  OBSERVABILITY_CONFIG,
  FRAMEWORK_AND_TESTING_CONFIG,
} from "../mock-data/mock-matrices.js";
import {
  DISCOURAGES_RELATIONSHIP_SKILLS,
  REQUIRES_RELATIONSHIP_SKILLS,
  CI_CD_SKILLS,
  DOCKER_TOOLING_SKILL,
  DATADOG_OBSERVABILITY_SKILL,
} from "../mock-data/mock-skills.js";
import { renderConfigTs } from "../content-generators";
import { elementAt, firstElement } from "../helpers/element-at.js";
import { TEST_CUSTOM_SOURCE_URL } from "../test-constants";

const CONSUMER_MATRIX_SKILLS: Record<string, ResolvedSkill> = {
  "web-framework-react": SKILLS.react,
  "api-framework-hono": SKILLS.hono,
  "web-testing-vitest": SKILLS.vitest,
};

function buildConsumerMatrix() {
  return createMockMatrix(CONSUMER_MATRIX_SKILLS);
}

describe("Integration: Consumer-Defined Stacks", () => {
  let dirs: TestDirs;
  let extraDirs: TestDirs | undefined;

  beforeEach(async () => {
    dirs = await createTestSource({
      stacks: CUSTOM_TEST_STACKS,
    });
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
    if (extraDirs) {
      await cleanupTestSource(extraDirs);
      extraDirs = undefined;
    }
  });

  it("should load custom stacks from source config/stacks.ts", async () => {
    const stacks = await loadStacks(dirs.sourceDir);

    expect(stacks.length).toBe(2);
    expect(firstElement(stacks).id).toBe("custom-fullstack");
    expect(firstElement(stacks).name).toBe("Custom Fullstack");
    expect(elementAt(stacks, 1).id).toBe("custom-testing");
  });

  it("should return empty array when source has no stacks.ts", async () => {
    extraDirs = await createTestSource();

    const stacks = await loadStacks(extraDirs.sourceDir);
    expect(stacks).toStrictEqual([]);
  });

  it("should install with custom stack skills reflected in config.ts", async () => {
    const consumerMatrix = buildConsumerMatrix();
    const sourceResult = initMatrixAndSource(consumerMatrix, dirs.sourceDir);

    const result = await writeProjectConfig({
      wizardResult: buildWizardResult(
        buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
      ),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    const config = await readTestTsConfig<ProjectConfig>(result.configPath);
    expectConfigSkills(config, ["api-framework-hono", "web-framework-react"]);
  });

  it("should find a specific stack by ID using loadStackById", async () => {
    const stack = await loadStackById("custom-fullstack", dirs.sourceDir, TEST_CUSTOM_SOURCE_URL);

    expect(stack).not.toBeNull();
    expect(stack!.id).toBe("custom-fullstack");
    expect(stack!.name).toBe("Custom Fullstack");
    expect(stack!.description).toBe("A consumer-defined fullstack stack");
  });

  it("should return null from loadStackById for non-existent stack", async () => {
    const stack = await loadStackById("nonexistent-stack", dirs.sourceDir, TEST_CUSTOM_SOURCE_URL);

    expect(stack).toBeNull();
  });

  it("should normalize bare string skill assignments to SkillAssignment arrays", async () => {
    const stacks = await loadStacks(dirs.sourceDir);
    const fullstackStack = firstElement(stacks);

    // Bare YAML strings like `framework: web-framework-react` are normalized
    // to SkillAssignment[] with preloaded: false
    const webDevConfig = fullstackStack.agents["web-developer"];
    expect(webDevConfig?.["web-framework"]).toStrictEqual([
      { id: "web-framework-react", preloaded: false },
    ]);
  });

  it("should load stacks with philosophy field when provided", async () => {
    extraDirs = await createTestSource({ stacks: PHILOSOPHY_TEST_STACKS });

    const stacks = await loadStacks(extraDirs.sourceDir);
    expect(stacks).toHaveLength(1);
    expect(firstElement(stacks).philosophy).toBe("Modern fullstack with type safety");
  });
});

describe("Integration: Stacks Precedence", () => {
  let dirs: TestDirs;

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  it("should load source stacks independently from CLI stacks", async () => {
    // Source with custom stacks
    dirs = await createTestSource({ stacks: CUSTOM_TEST_STACKS });

    const sourceStacks = await loadStacks(dirs.sourceDir);
    expect(sourceStacks.map((s) => s.id)).toStrictEqual(["custom-fullstack", "custom-testing"]);
  });

  it("should use source stacks when source has stacks.ts (source overrides CLI)", async () => {
    // In loadAndMergeFromBasePath, if sourceStacks.length > 0, CLI stacks are NOT loaded.
    // This test verifies source stacks are self-contained.
    dirs = await createTestSource({ stacks: CUSTOM_TEST_STACKS });

    const sourceStacks = await loadStacks(dirs.sourceDir);
    expect(sourceStacks).toHaveLength(2);

    // custom-fullstack has 2 agents: web-developer, api-developer
    expect(Object.keys(firstElement(sourceStacks).agents)).toStrictEqual([
      "web-developer",
      "api-developer",
    ]);
    // custom-testing has 1 agent: web-developer
    expect(Object.keys(elementAt(sourceStacks, 1).agents)).toStrictEqual(["web-developer"]);
  });

  it("should allow a source to define a stack with an ID matching a CLI built-in", async () => {
    // A source can define a stack with the same ID as a CLI built-in.
    // Since loadAndMergeFromBasePath uses source stacks when available,
    // the source's version effectively takes precedence.
    dirs = await createTestSource({ stacks: OVERRIDING_TEST_STACKS });

    const stacks = await loadStacks(dirs.sourceDir);
    expect(stacks).toHaveLength(1);
    expect(firstElement(stacks).id).toBe("nextjs-fullstack");
    // The consumer's custom description, not the CLI built-in
    expect(firstElement(stacks).name).toBe("Custom Next.js");
    expect(firstElement(stacks).description).toBe("Consumer override of Next.js stack");
  });
});

describe("Integration: Marketplace Source Stacks", () => {
  let dirs: TestDirs;

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  it("should load stacks from a marketplace-like source directory", async () => {
    // A marketplace source has its own config/stacks.ts alongside skills
    dirs = await createTestSource({ stacks: MARKETPLACE_TEST_STACKS });

    const stacks = await loadStacks(dirs.sourceDir);
    expect(stacks).toHaveLength(1);
    expect(firstElement(stacks).id).toBe("marketplace-stack");
    expect(firstElement(stacks).name).toBe("Marketplace Stack");

    // Verify the stack has exactly these agents
    expect(Object.keys(firstElement(stacks).agents)).toStrictEqual([
      "web-developer",
      "api-developer",
    ]);
  });

  it("should load stacks alongside skills in the same source", async () => {
    dirs = await createTestSource({ stacks: MARKETPLACE_FULLSTACK_TEST_STACKS });

    // Stacks load from source config/stacks.ts
    const stacks = await loadStacks(dirs.sourceDir);
    expect(stacks).toHaveLength(1);

    // Skills are also available at the source skills dir (verify via file existence)
    const reactSkillPath = path.join(
      dirs.skillsDir,
      "web-framework",
      "web-framework-react",
      STANDARD_FILES.SKILL_MD,
    );
    expect(await fileExists(reactSkillPath)).toBe(true);

    // Categories and rules files also exist alongside stacks
    const categoriesPath = path.join(dirs.sourceDir, "config", "skill-categories.ts");
    expect(await fileExists(categoriesPath)).toBe(true);
  });
});

describe("Integration: Consumer-Defined Skills Matrix", () => {
  let dirs: TestDirs;

  beforeEach(async () => {
    dirs = await createTestSource({
      stacks: CUSTOM_TEST_STACKS,
    });
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  it("should use source skill-categories.ts and skill-rules.ts when present", async () => {
    const categoriesPath = path.join(dirs.sourceDir, "config", "skill-categories.ts");
    const rulesPath = path.join(dirs.sourceDir, "config", "skill-rules.ts");
    expect(await fileExists(categoriesPath)).toBe(true);
    expect(await fileExists(rulesPath)).toBe(true);

    // The disk categories file contains category definitions (not skill IDs — those
    // come from metadata scanning in src/skills/).
    const categoriesContent = await readFile(categoriesPath, "utf-8");
    expect(categoriesContent).toContain("framework");
    expect(categoriesContent).toContain("testing");
    expect(categoriesContent).toContain('"version"');
  });

  it("should install all skills from source and compile agents", async () => {
    const consumerMatrix = buildConsumerMatrix();
    const sourceResult = initMatrixAndSource(consumerMatrix, dirs.sourceDir);

    const { copied, config, compilation } = await installThroughOperations({
      wizardResult: buildWizardResult(
        buildSkillConfigs(["web-framework-react", "api-framework-hono", "web-testing-vitest"]),
        { selectedAgents: ["web-developer", "api-developer"] },
      ),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    expect(copied.projectCopied.map((copiedSkill) => copiedSkill.skillId).sort()).toStrictEqual([
      "api-framework-hono",
      "web-framework-react",
      "web-testing-vitest",
    ]);
    expect([...compilation.compiled].sort()).toStrictEqual(["api-developer", "web-developer"]);
    expect(compilation.failed).toStrictEqual([]);

    const paths = resolveInstallPaths(dirs.projectDir, "project");
    expect(await directoryExists(paths.skillsDir)).toBe(true);
    expect(await directoryExists(paths.agentsDir)).toBe(true);
    expect(config.configPath).toBe(paths.configPath);
  });
});

describe("Integration: Custom Skills Matrix Loading", () => {
  let tempDir: string;

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should load custom categories and skills from a matrix config", async () => {
    tempDir = await createTempDir("matrix-test-");
    const skillsDir = path.join(tempDir, "src", "skills");

    // Create a skill in the tooling category (use "infra" prefix — valid categoryPath prefix)
    await writeSourceSkill(
      skillsDir,
      path.join("infra", "tooling", "docker"),
      DOCKER_TOOLING_SKILL,
    );

    // Extract skills from filesystem and merge with matrix config
    const skills = await extractAllSkills(skillsDir);
    const merged = mergeMatrixWithSkills(
      TOOLING_AND_FRAMEWORK_CONFIG.categories,
      TOOLING_AND_FRAMEWORK_CONFIG.relationships,
      skills,
    );

    // Assert the custom "tooling" category is present
    expect(Object.keys(merged.categories)).toHaveLength(2);
    expect(merged.categories["shared-tooling"]).toStrictEqual(
      expect.objectContaining({
        displayName: "Tooling",
        exclusive: false,
      }),
    );

    // Assert the custom skill is present
    // Boundary cast: test-only skill ID not in generated SkillId union
    const dockerId = "infra-tooling-docker" as SkillId;
    expect(merged.skills[dockerId]).toStrictEqual(
      expect.objectContaining({
        description: "Docker containerization patterns",
        category: "shared-tooling",
      }),
    );
  });

  it("should respect exclusive flag from custom matrix categories", async () => {
    tempDir = await createTempDir("exclusive-test-");
    const skillsDir = path.join(tempDir, "src", "skills");

    // Create skills in the exclusive category (use "infra" prefix — valid categoryPath prefix)
    for (const skill of CI_CD_SKILLS) {
      const dir = skill.id.replace(`${skill.category}-`, "");
      await writeSourceSkill(skillsDir, path.join("infra", "ci-cd", dir), skill);
    }

    const skills = await extractAllSkills(skillsDir);
    const merged = mergeMatrixWithSkills(
      CI_CD_CONFIG.categories,
      CI_CD_CONFIG.relationships,
      skills,
    );

    // Verify category exclusive flag
    expect(merged.categories["infra-ci-cd"]).toStrictEqual(
      expect.objectContaining({ exclusive: true }),
    );

    // Verify both skills are loaded
    // Boundary cast: test-only skill IDs not in generated SkillId union
    expect(merged.skills["infra-ci-cd-github-actions" as SkillId]).toStrictEqual(
      expect.objectContaining({ category: "infra-ci-cd" }),
    );
    expect(merged.skills["infra-ci-cd-gitlab-ci" as SkillId]).toStrictEqual(
      expect.objectContaining({ category: "infra-ci-cd" }),
    );
  });

  it("should respect discourages relationships from custom matrix", async () => {
    tempDir = await createTempDir("discourages-test-");
    const skillsDir = path.join(tempDir, "src", "skills");

    // Create the skills referenced in relationships
    for (const skill of DISCOURAGES_RELATIONSHIP_SKILLS) {
      const dir = skill.id.replace(`${skill.category}-`, "");
      const categoryPath = skill.category.replace(/\//g, path.sep);
      await writeSourceSkill(skillsDir, path.join(categoryPath, dir), skill);
    }

    const skills = await extractAllSkills(skillsDir);
    const merged = mergeMatrixWithSkills(
      FRAMEWORK_AND_STYLING_CONFIG.categories,
      FRAMEWORK_AND_STYLING_CONFIG.relationships,
      skills,
    );

    // Verify discourages relationship is applied to both skills
    const skillA = merged.skills["web-framework-react"];
    expect(skillA).toStrictEqual(
      expect.objectContaining({
        discourages: [
          expect.objectContaining({
            skillId: "web-styling-scss-modules",
            reason: "These tools have conflicting design philosophies",
          }),
        ],
      }),
    );

    const skillB = merged.skills["web-styling-scss-modules"];
    expect(skillB).toStrictEqual(
      expect.objectContaining({
        discourages: [expect.objectContaining({ skillId: "web-framework-react" })],
      }),
    );
  });

  it("should preserve preloaded flag through stack loading", async () => {
    tempDir = await createTempDir("preloaded-test-");
    const configDir = path.join(tempDir, "config");
    await mkdir(configDir, { recursive: true });

    // Create a stacks.ts with preloaded: true on some skills
    const stacksContent = {
      stacks: [
        {
          id: "preloaded-test",
          name: "Preloaded Test Stack",
          description: "Stack with preloaded skills",
          agents: {
            "web-developer": {
              "web-framework": [{ id: "web-framework-react", preloaded: true }],
              "web-testing": "web-testing-vitest",
              "meta-reviewing": [
                { id: "meta-methodology-research-methodology", preloaded: true },
                "meta-reviewing-reviewing",
              ],
            },
          },
        },
      ],
    };

    await writeFile(path.join(configDir, "stacks.ts"), renderConfigTs(stacksContent));

    const stacks = await loadStacks(tempDir);

    expect(stacks).toHaveLength(1);
    const webDeveloper = firstElement(stacks).agents["web-developer"];
    if (!webDeveloper) throw new Error("the loaded stack must roster web-developer");

    // Framework: preloaded: true (object form)
    expect(webDeveloper["web-framework"]).toStrictEqual([
      { id: "web-framework-react", preloaded: true },
    ]);

    // Testing: bare string -> preloaded defaults to false
    expect(webDeveloper["web-testing"]).toStrictEqual([
      { id: "web-testing-vitest", preloaded: false },
    ]);

    // Methodology: mixed array — first preloaded: true, second defaults to false
    expect(webDeveloper["meta-reviewing"]).toStrictEqual([
      { id: "meta-methodology-research-methodology", preloaded: true },
      { id: "meta-reviewing-reviewing", preloaded: false },
    ]);
  });
});

describe("Integration: Custom Matrix + Stacks Full Pipeline", () => {
  let dirs: TestDirs;

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  it("should install skills from a source with both custom matrix and stacks", async () => {
    dirs = await createTestSource({ stacks: PIPELINE_TEST_STACKS });

    // 1. Verify stacks loaded from source
    const stacks = await loadStacks(dirs.sourceDir);
    expect(stacks).toHaveLength(1);
    expect(firstElement(stacks).id).toBe("custom-pipeline");

    // 2. Verify skills exist at the source skills dir
    const reactSkillPath = path.join(
      dirs.skillsDir,
      "web-framework",
      "web-framework-react",
      STANDARD_FILES.SKILL_MD,
    );
    expect(await fileExists(reactSkillPath)).toBe(true);

    // 3. Verify categories/rules are loadable
    const categoriesPath = path.join(dirs.sourceDir, "config", "skill-categories.ts");
    expect(await fileExists(categoriesPath)).toBe(true);

    // 4. Install with the custom stack skills
    const consumerMatrix = buildConsumerMatrix();
    const sourceResult = initMatrixAndSource(consumerMatrix, dirs.sourceDir);
    const {
      copied,
      config: configResult,
      compilation,
    } = await installThroughOperations({
      wizardResult: buildWizardResult(
        buildSkillConfigs(["web-framework-react", "web-testing-vitest", "api-framework-hono"]),
        { selectedAgents: ["web-developer", "api-developer"] },
      ),
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // 5. Verify installation results
    expect(copied.projectCopied.map((copiedSkill) => copiedSkill.skillId).sort()).toStrictEqual([
      "api-framework-hono",
      "web-framework-react",
      "web-testing-vitest",
    ]);
    expect([...compilation.compiled].sort()).toStrictEqual(["api-developer", "web-developer"]);
    expect(compilation.failed).toStrictEqual([]);

    // 6. Verify config.ts contains exactly the selected skills
    const config = await readTestTsConfig<ProjectConfig>(configResult.configPath);
    expectConfigSkills(config, ["api-framework-hono", "web-framework-react", "web-testing-vitest"]);
  });

  it("should load categories and rules from a custom source directory", async () => {
    dirs = await createTestSource();

    // Verify the source's skill-categories.ts can be loaded and parsed
    const categoriesPath = path.join(dirs.sourceDir, "config", "skill-categories.ts");
    expect(await fileExists(categoriesPath)).toBe(true);

    const categoriesContent = await readFile(categoriesPath, "utf-8");

    // Verify the disk categories file contains category definitions and structure.
    // Skill IDs are not in the categories file — they come from metadata scanning
    // in the skills directory (src/skills/).
    expect(categoriesContent).toContain("framework");
    expect(categoriesContent).toContain("testing");
    expect(categoriesContent).toContain('"version"');
    expect(categoriesContent).toContain('"categories"');

    // Verify source also has skill directories
    const reactDir = path.join(dirs.skillsDir, "web-framework", "web-framework-react");
    expect(await directoryExists(reactDir)).toBe(true);
  });

  it("should handle a source with multiple stacks referencing the same skills", async () => {
    dirs = await createTestSource({ stacks: MULTI_TEST_STACKS });

    const stacks = await loadStacks(dirs.sourceDir);
    expect(stacks).toHaveLength(2);

    // Both stacks reference web-framework-react
    const stackAReactAssignment = elementAt(stacks, 0).agents["web-developer"]?.["web-framework"];
    const stackBReactAssignment = elementAt(stacks, 1).agents["web-developer"]?.["web-framework"];

    expect(stackAReactAssignment).toStrictEqual([
      expect.objectContaining({ id: "web-framework-react" }),
    ]);
    expect(stackBReactAssignment).toStrictEqual([
      expect.objectContaining({ id: "web-framework-react" }),
    ]);
  });
});

describe("Integration: Custom Matrix Skill Metadata Survival", () => {
  let tempDir: string;

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should load skills with tags from custom source metadata", async () => {
    tempDir = await createTempDir("tags-test-");
    const skillsDir = path.join(tempDir, "src", "skills");

    await writeSourceSkill(
      skillsDir,
      path.join("api", "observability", "datadog"),
      DATADOG_OBSERVABILITY_SKILL,
    );

    const skills = await extractAllSkills(skillsDir);
    const merged = mergeMatrixWithSkills(
      OBSERVABILITY_CONFIG.categories,
      OBSERVABILITY_CONFIG.relationships,
      skills,
    );

    // Boundary cast: test-only skill ID not in generated SkillId union
    const datadogSkill = merged.skills["api-observability-datadog" as SkillId];
    expect(datadogSkill).toStrictEqual(
      expect.objectContaining({ description: "Datadog APM integration" }),
    );
  });

  it("should handle requires relationship from custom matrix", async () => {
    tempDir = await createTempDir("requires-test-");
    const skillsDir = path.join(tempDir, "src", "skills");

    // Create the skills (use valid categoryPath prefixes — "shared" is not valid)
    for (const skill of REQUIRES_RELATIONSHIP_SKILLS) {
      const dir = skill.id.replace(`${skill.category}-`, "");
      const catPath = skill.category.replace(/\//g, path.sep);
      await writeSourceSkill(skillsDir, path.join(catPath, dir), skill);
    }

    const skills = await extractAllSkills(skillsDir);
    const merged = mergeMatrixWithSkills(
      FRAMEWORK_AND_TESTING_CONFIG.categories,
      FRAMEWORK_AND_TESTING_CONFIG.relationships,
      skills,
    );

    // Verify requires relationship is applied
    const rtlSkill = merged.skills["web-testing-vitest"];
    expect(rtlSkill).toStrictEqual(
      expect.objectContaining({
        requires: [
          expect.objectContaining({
            skillIds: expect.arrayContaining(["web-framework-react"]),
            reason: "RTL requires React to function",
          }),
        ],
      }),
    );
  });
});
