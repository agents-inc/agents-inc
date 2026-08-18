import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createTestSource,
  cleanupTestSource,
  type TestDirs,
} from "../__tests__/fixtures/create-test-source";
import { installEject } from "../installation/local-installer";
import {
  validateSelection,
  getAvailableSkills,
  isIncompatible,
  hasUnmetRequirements,
  getUnmetRequirementsReason,
} from ".";
import { createMockSkill } from "../__tests__/factories/skill-factories.js";
import { createMatrixFromTestSkills } from "../__tests__/factories/matrix-factories.js";
import { buildWizardResult, buildSourceResult } from "../__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation.js";
import { readTestTsConfig } from "../__tests__/helpers/config-io.js";
import { expectConfigSkills } from "../__tests__/assertions/index.js";
import {
  MULTI_SOURCE_PUBLIC_SKILLS,
  MULTI_SOURCE_ACME_SKILLS,
  MULTI_SOURCE_INTERNAL_SKILLS,
  RESOLUTION_PIPELINE_SKILLS,
} from "../__tests__/mock-data/mock-skills.js";
import { buildMultiSourceMatrix } from "../__tests__/mock-data/mock-matrices.js";
import type { MergedSkillsMatrix, ProjectConfig, SkillId, SkillSlug, Category } from "../../types";
import { initializeMatrix, getSkillById } from "./matrix-provider";
import { firstElement } from "../__tests__/helpers/element-at.js";

describe("Integration: Multi-Source Skill Resolution", () => {
  describe("Scenario 1: Skills from 3 sources resolve into unified matrix", () => {
    it("should create a matrix with unique skills from all sources", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Count unique skills from all 3 sources (15 total, minus overlaps)
      const uniqueSkillIds = new Set([
        ...MULTI_SOURCE_PUBLIC_SKILLS.map((s) => s.id),
        ...MULTI_SOURCE_ACME_SKILLS.map((s) => s.id),
        ...MULTI_SOURCE_INTERNAL_SKILLS.map((s) => s.id),
      ]);
      const EXPECTED_UNIQUE_COUNT = uniqueSkillIds.size;

      const skillKeys = Object.keys(matrix.skills);
      expect(skillKeys).toHaveLength(EXPECTED_UNIQUE_COUNT);

      // Verify every expected skill ID is present
      for (const expectedId of uniqueSkillIds) {
        expect(skillKeys).toContain(expectedId);
      }

      // Verify no unexpected skill IDs are present
      for (const actualId of skillKeys) {
        expect(uniqueSkillIds.has(actualId)).toBe(true);
      }
    });

    it("should annotate skills with all available sources", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // web-framework-react exists in all 3 sources
      const reactSkill = matrix.skills["web-framework-react"];
      expect(reactSkill?.availableSources).toHaveLength(3);

      const sourceTypes = reactSkill!.availableSources!.map((s) => s.type);
      expect(sourceTypes).toContain("public");
      expect(sourceTypes).toContain("private");

      const sourceNames = reactSkill!.availableSources!.map((s) => s.name);
      expect(sourceNames).toContain("public");
      expect(sourceNames).toContain("acme-corp");
      expect(sourceNames).toContain("internal");
    });

    it("should annotate skills with single source when not duplicated", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // web-state-zustand is only in public source
      const zustandSkill = matrix.skills["web-state-zustand"];
      expect(zustandSkill?.availableSources).toHaveLength(1);
      expect(zustandSkill?.availableSources?.[0]?.name).toBe("public");
    });

    it("should have correct activeSource defaulting to first available", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Skills without any installed source should have first source as active
      const reactSkill = matrix.skills["web-framework-react"];
      expect(reactSkill?.activeSource?.name).toBe("public");
    });
  });

  describe("Scenario 2: Active source wins when same skill ID exists in multiple sources", () => {
    it("should use installed source as activeSource over non-installed sources", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Simulate acme-corp version being installed
      const reactSkill = matrix.skills["web-framework-react"]!;
      const acmeSource = reactSkill.availableSources!.find((s) => s.name === "acme-corp")!;
      acmeSource.installed = true;
      acmeSource.installMode = "eject";

      // Re-compute active source (same logic as setActiveSources in multi-source-loader)
      const availableSources = reactSkill.availableSources ?? [];
      const activeSource =
        availableSources.find((s) => s.installed) ?? firstElement(availableSources);
      reactSkill.activeSource = activeSource;

      expect(activeSource.name).toBe("acme-corp");
      expect(activeSource.type).toBe("private");
      expect(activeSource.installed).toBe(true);
    });

    it("should respect sourceSelections when determining which source is preferred", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // sourceSelections maps SkillId -> source name (user's choice from wizard)
      const sourceSelections: Partial<Record<SkillId, string>> = {
        "web-framework-react": "internal",
        "web-testing-vitest": "acme-corp",
      };

      // Verify the source selections reference valid sources
      for (const [skillId, sourceName] of Object.entries(sourceSelections)) {
        const skill = matrix.skills[skillId as SkillId];
        const matchingSource = skill?.availableSources?.find((s) => s.name === sourceName);
        expect(matchingSource?.name).toBe(sourceName);
      }
    });

    it("should allow selecting 10 skills across different sources without conflicts", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Select 10 skills from different sources (no conflicts since no conflictsWith defined)
      const selectedSkills: SkillId[] = [
        "web-framework-react", // from 3 sources
        "web-state-zustand", // public only
        "web-styling-scss-modules", // public only
        "web-testing-vitest", // from 2 sources
        "api-framework-hono", // acme only
        "api-database-drizzle", // acme only
        "api-security-auth-patterns" as SkillId, // acme only
        "web-animation-framer" as SkillId, // internal only
        "web-accessibility-a11y" as SkillId, // internal only
        "api-monitoring-sentry" as SkillId, // internal only
      ];

      expect(selectedSkills).toHaveLength(10);

      const validation = validateSelection(selectedSkills);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // All selected skills should exist in the matrix
      for (const skillId of selectedSkills) {
        expect(matrix.skills[skillId]?.id).toBe(skillId);
      }
    });
  });

  describe("Scenario 3: Missing skill reference produces warning", () => {
    it("should throw when missing skill is selected", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Select a skill that doesn't exist in any source
      const selections: SkillId[] = ["web-framework-react", "web-nonexistent-skill" as SkillId];

      // getSkillById throws for unknown skill IDs — invalid input is a bug
      expect(() => validateSelection(selections)).toThrow("Skill not found");
    });

    it("should throw for unknown skill ID lookup", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      expect(() => getSkillById("web-nonexistent-skill" as SkillId)).toThrow("Skill not found");
    });

    it("should not include missing skill in getAvailableSkills for any category", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Check all categories -- missing skill should not appear
      const allCategories = Object.keys(matrix.categories) as Category[];
      for (const category of allCategories) {
        const available = getAvailableSkills(category, []);
        const ids = available.map((o) => o.id);
        expect(ids).not.toContain("web-nonexistent-skill" as SkillId);
      }
    });

    it("should detect missing requirement when dependency is not in matrix", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Add a skill that requires a non-existent skill
      matrix.skills["web-feature-advanced" as SkillId] = createMockSkill(
        "web-feature-advanced" as SkillId,
        {
          category: "web-framework",
          // Boundary cast: fictional slug, as the ID it belongs to is fictional
          slug: "feature-advanced" as SkillSlug,
          requires: [
            {
              skillIds: ["web-nonexistent-dep" as SkillId],
              needsAny: false,
              reason: "Needs nonexistent dependency",
            },
          ],
        },
      );

      expect(() => validateSelection(["web-feature-advanced" as SkillId])).toThrow();
    });
  });

  describe("Scenario 4: Skill dependencies are correctly resolved across sources", () => {
    it("should validate when dependency from different source is selected", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Add dependency: drizzle (acme) requires hono (acme)
      const drizzleSkill = matrix.skills["api-database-drizzle"]!;
      drizzleSkill.requires = [
        {
          skillIds: ["api-framework-hono"],
          needsAny: false,
          reason: "Database ORM needs a backend framework",
        },
      ];

      // Both selected -- should be valid
      const validation = validateSelection(["api-database-drizzle", "api-framework-hono"]);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should fail validation when dependency from another source is not selected", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Add dependency: drizzle requires hono
      const drizzleSkill = matrix.skills["api-database-drizzle"]!;
      drizzleSkill.requires = [
        {
          skillIds: ["api-framework-hono"],
          needsAny: false,
          reason: "Database ORM needs a backend framework",
        },
      ];

      // Only drizzle selected, hono missing
      const validation = validateSelection(["api-database-drizzle"]);
      expect(validation.valid).toBe(false);
      expect(firstElement(validation.errors).type).toBe("missingRequirement");
      expect(firstElement(validation.errors).message).toContain("Hono");
    });

    it("should mark dependent skill as having unmet requirements when requirement is not selected", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // auth-patterns requires hono
      const authSkill = matrix.skills["api-security-auth-patterns" as SkillId]!;
      authSkill.requires = [
        {
          skillIds: ["api-framework-hono"],
          needsAny: false,
          reason: "Auth patterns need a backend framework",
        },
      ];

      // Nothing selected, auth should have unmet requirements
      const unmet = hasUnmetRequirements("api-security-auth-patterns" as SkillId, []);
      expect(unmet).toBe(true);

      const reason = getUnmetRequirementsReason("api-security-auth-patterns" as SkillId, []);
      expect(reason).toContain("requires");
      expect(reason).toContain("Hono");
    });

    it("should not mark dependent skill as having unmet requirements when requirement is selected", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // auth-patterns requires hono
      const authSkill = matrix.skills["api-security-auth-patterns" as SkillId]!;
      authSkill.requires = [
        {
          skillIds: ["api-framework-hono"],
          needsAny: false,
          reason: "Auth patterns need a backend framework",
        },
      ];

      // hono selected, auth should not have unmet requirements
      const unmet = hasUnmetRequirements("api-security-auth-patterns" as SkillId, [
        "api-framework-hono",
      ]);
      expect(unmet).toBe(false);
    });

    it("should handle OR dependency across sources", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // sentry can work with either hono (acme) OR react (public/acme/internal)
      const sentrySkill = matrix.skills["api-monitoring-sentry" as SkillId]!;
      sentrySkill.requires = [
        {
          skillIds: ["api-framework-hono", "web-framework-react"],
          needsAny: true,
          reason: "Needs at least one framework for instrumentation",
        },
      ];

      // Select react (from public), sentry should be valid
      const validation = validateSelection([
        "api-monitoring-sentry" as SkillId,
        "web-framework-react",
      ]);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Without any framework, sentry should fail with missing requirement
      const failValidation = validateSelection(["api-monitoring-sentry" as SkillId]);
      expect(failValidation.valid).toBe(false);
      expect(failValidation.errors).toHaveLength(1);
      expect(firstElement(failValidation.errors).type).toBe("missingRequirement");
      expect(firstElement(failValidation.errors).message).toContain("one of");
    });
  });

  describe("Scenario 5: Conflict resolution across sources", () => {
    it("should detect conflicts between skills from different sources", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // react and vue conflict (both in framework category)
      const reactSkill = matrix.skills["web-framework-react"]!;
      reactSkill.conflictsWith = [
        {
          skillId: "web-framework-vue-composition-api",
          reason: "Choose one frontend framework",
        },
      ];

      const validation = validateSelection([
        "web-framework-react",
        "web-framework-vue-composition-api",
      ]);
      expect(validation.valid).toBe(false);
      expect(firstElement(validation.errors).type).toBe("conflict");
      expect(firstElement(validation.errors).message).toContain("Choose one frontend framework");
    });

    it("should mark conflicting skill from another source as incompatible", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      const reactSkill = matrix.skills["web-framework-react"]!;
      reactSkill.conflictsWith = [
        {
          skillId: "web-framework-vue-composition-api",
          reason: "Choose one frontend framework",
        },
      ];

      // React selected, vue should be incompatible
      const incompatible = isIncompatible("web-framework-vue-composition-api", [
        "web-framework-react",
      ]);
      expect(incompatible).toBe(true);
    });

    it("should enforce category exclusivity across multi-source skills", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // framework category is exclusive -- selecting both react and vue violates it
      const validation = validateSelection([
        "web-framework-react",
        "web-framework-vue-composition-api",
      ]);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.type === "categoryExclusive")).toBe(true);
    });
  });

  describe("Scenario 6: Large-scale multi-source selection", () => {
    it("should validate a cross-source selection without errors", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      const validation = validateSelection([
        "web-state-zustand",
        "api-framework-hono",
        "api-database-drizzle",
      ]);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toStrictEqual([]);
    });

    it("should handle getAvailableSkills with multi-source skills correctly", () => {
      const matrix = buildMultiSourceMatrix();
      initializeMatrix(matrix);

      // Get available framework skills
      const available = getAvailableSkills("web-framework", []);

      // Should have exactly react and vue (only framework skills)
      const ids = available.map((o) => o.id);
      expect(ids).toHaveLength(2);
      expect(ids).toContain("web-framework-react");
      expect(ids).toContain("web-framework-vue-composition-api");

      // Non-framework skills should NOT appear
      expect(ids).not.toContain("web-state-zustand");
      expect(ids).not.toContain("api-framework-hono");

      // None should be discouraged or selected initially
      expect(available.every((o) => o.advisoryState.status === "normal")).toBe(true);
      expect(available.every((o) => !o.selected)).toBe(true);
    });
  });
});

describe("Integration: Multi-Source Install Pipeline", () => {
  let dirs: TestDirs;

  const PIPELINE_SKILL_COUNT = 5;

  function buildPipelineMatrix(): MergedSkillsMatrix {
    return createMatrixFromTestSkills(RESOLUTION_PIPELINE_SKILLS, (skill) => ({
      author: skill.author,
    }));
  }

  beforeEach(async () => {
    dirs = await createTestSource({ skills: RESOLUTION_PIPELINE_SKILLS });
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
  });

  it("should install skills from multiple sources and produce compiled agents", async () => {
    // Boundary cast: TestSkill.id is string, but RESOLUTION_PIPELINE_SKILLS contains valid SkillIds
    const selectedSkills = RESOLUTION_PIPELINE_SKILLS.map((s) => s.id) as SkillId[];

    const matrix = buildPipelineMatrix();
    initializeMatrix(matrix);

    const wizardResult = buildWizardResult(
      [
        ...buildSkillConfigs(["web-framework-react", "web-testing-vitest"], { origin: "public" }),
        ...buildSkillConfigs(["api-framework-hono", "api-database-drizzle"], {
          origin: "acme-corp",
        }),
        ...buildSkillConfigs(["web-animation-framer" as SkillId], { origin: "internal" }),
      ],
      {
        selectedAgents: ["web-developer", "api-developer"],
      },
    );
    const sourceResult = buildSourceResult(matrix, dirs.sourceDir);

    const installResult = await installEject({
      wizardResult,
      sourceResult,
      projectDir: dirs.projectDir,
    });

    // Verify all skills were copied
    expect(installResult.copiedSkills).toHaveLength(PIPELINE_SKILL_COUNT);

    // Verify config contains all selected skills
    // Boundary cast: config parse returns `unknown`
    const config = await readTestTsConfig<ProjectConfig>(installResult.configPath);

    expectConfigSkills(config, selectedSkills);

    // Verify agents were compiled
    expect(installResult.compiledAgents).toHaveLength(2);
  });

  it("should preserve source selections through the config write", async () => {
    // Boundary cast: TestSkill.id is string, but RESOLUTION_PIPELINE_SKILLS contains valid SkillIds
    const selectedSkills = RESOLUTION_PIPELINE_SKILLS.map((s) => s.id) as SkillId[];

    const matrix = buildPipelineMatrix();
    initializeMatrix(matrix);

    const wizardResult = buildWizardResult(buildSkillConfigs(selectedSkills));
    const sourceResult = buildSourceResult(matrix, dirs.sourceDir, {
      marketplace: "test-marketplace",
    });

    const installResult = await installEject({
      wizardResult,
      sourceResult,
      projectDir: dirs.projectDir,
      sourceFlag: "github:test-org/skills",
    });

    // Boundary cast: config parse returns `unknown`
    const config = await readTestTsConfig<ProjectConfig>(installResult.configPath);

    // Source metadata should be preserved
    expect(config.marketplace).toBe("github:test-org/skills");
    expect(config.marketplaceName).toBe("test-marketplace");
  });
});

describe("Integration: Skill ID Resolution in Multi-Source Context", () => {
  it("should resolve skill IDs with multi-source metadata", () => {
    const matrix = buildMultiSourceMatrix();
    initializeMatrix(matrix);

    const resolved = getSkillById("web-framework-react").id;
    expect(resolved).toBe("web-framework-react");

    // Resolved skill should have multi-source metadata
    const skill = matrix.skills[resolved];
    expect(skill?.availableSources?.length).toBeGreaterThanOrEqual(1);
  });

  it("should validate selection using skill IDs with multi-source skills", () => {
    const matrix = buildMultiSourceMatrix();
    initializeMatrix(matrix);

    const validation = validateSelection(["web-framework-react", "api-framework-hono"]);
    expect(validation.valid).toBe(true);
  });
});
