import { describe, it, expect, vi } from "vitest";

import { createMockExtractedSkill } from "../__tests__/factories/skill-factories.js";
import { createMockMatrixConfig } from "../__tests__/factories/matrix-factories.js";
import { FRAMEWORK_CATEGORY } from "../__tests__/mock-data/mock-categories.js";
import {
  MERGE_BASIC_MATRIX,
  CONFLICT_MATRIX,
  ALTERNATIVES_MATRIX,
  REQUIRES_MATRIX,
  EMPTY_MATRIX_CONFIG,
  UNRESOLVED_CONFLICT_MATRIX,
} from "../__tests__/mock-data/mock-matrices.js";

vi.mock("../../utils/logger");

import { mergeMatrixWithSkills, synthesizeCategory } from "./skill-resolution";
import type { CategoryPath, Category, SkillId } from "../../types";

describe("skill-resolution", () => {
  describe("mergeMatrixWithSkills", () => {
    it("merges matrix config with extracted skills into resolved format", () => {
      const merged = mergeMatrixWithSkills(
        MERGE_BASIC_MATRIX.categories,
        MERGE_BASIC_MATRIX.relationships,
        [
          createMockExtractedSkill("web-framework-react", {
            description: "React framework",
            author: "@vince",
          }),
        ],
      );

      expect(merged.version).toBe("1.0.0");
      expect(Object.keys(merged.skills)).toHaveLength(1);

      const react = merged.skills["web-framework-react"];
      expect(react).toStrictEqual(
        expect.objectContaining({
          id: "web-framework-react",
          slug: "react",
          displayName: "react",
          description: "React framework",
          author: "@vince",
          category: "web-framework",
          conflictsWith: [],
          requires: [],
          alternatives: [],
          discourages: [],
          compatibleWith: [],
          isRecommended: false,
        }),
      );
    });

    it("resolves conflict references between skills", () => {
      const merged = mergeMatrixWithSkills(
        CONFLICT_MATRIX.categories,
        CONFLICT_MATRIX.relationships,
        [
          createMockExtractedSkill("web-framework-react", { description: "React" }),
          createMockExtractedSkill("web-framework-vue-composition-api", { description: "Vue" }),
        ],
      );

      const reactSkill = merged.skills["web-framework-react"];
      expect(reactSkill?.conflictsWith).toHaveLength(1);
      expect(reactSkill?.conflictsWith).toStrictEqual([
        { skillId: "web-framework-vue-composition-api", reason: "Pick one framework" },
      ]);

      const vueSkill = merged.skills["web-framework-vue-composition-api"];
      expect(vueSkill?.conflictsWith).toHaveLength(1);
      expect(vueSkill?.conflictsWith).toStrictEqual([
        { skillId: "web-framework-react", reason: "Pick one framework" },
      ]);
    });

    it("handles empty skills array", () => {
      const merged = mergeMatrixWithSkills(
        EMPTY_MATRIX_CONFIG.categories,
        EMPTY_MATRIX_CONFIG.relationships,
        [],
      );

      expect(Object.keys(merged.skills)).toHaveLength(0);
      expect(merged.suggestedStacks).toStrictEqual([]);
    });

    it("builds slugToId map from extracted skill metadata", () => {
      const reactWithSlug = createMockExtractedSkill("web-framework-react", {
        description: "React",
        slug: "react" as import("../../types").SkillSlug,
      });
      const merged = mergeMatrixWithSkills(
        EMPTY_MATRIX_CONFIG.categories,
        EMPTY_MATRIX_CONFIG.relationships,
        [reactWithSlug],
      );

      expect(merged.slugMap.slugToId.react).toBe("web-framework-react");
      expect(merged.slugMap.idToSlug["web-framework-react"]).toBe("react");
    });

    it("drops unresolved conflict references instead of passing through", () => {
      const merged = mergeMatrixWithSkills(
        UNRESOLVED_CONFLICT_MATRIX.categories,
        UNRESOLVED_CONFLICT_MATRIX.relationships,
        [createMockExtractedSkill("web-framework-react", { description: "React" })],
      );

      const reactSkill = merged.skills["web-framework-react"];
      // Unresolved "nonexistent" slug should be dropped, not passed through as-is
      expect(reactSkill?.conflictsWith).toStrictEqual([]);
    });

    it("resolves alternative groups correctly between skills", () => {
      const merged = mergeMatrixWithSkills(
        ALTERNATIVES_MATRIX.categories,
        ALTERNATIVES_MATRIX.relationships,
        [
          createMockExtractedSkill("web-state-zustand", {
            description: "Zustand",
            category: "web-client-state",
          }),
          createMockExtractedSkill("web-state-jotai", {
            description: "Jotai",
            category: "web-client-state",
          }),
        ],
      );

      const zustand = merged.skills["web-state-zustand"];
      const jotai = merged.skills["web-state-jotai"];
      expect(zustand!.alternatives).toHaveLength(1);
      expect(zustand!.alternatives).toStrictEqual([
        { skillId: "web-state-jotai", purpose: "State management" },
      ]);
      expect(jotai!.alternatives).toHaveLength(1);
      expect(jotai!.alternatives).toStrictEqual([
        { skillId: "web-state-zustand", purpose: "State management" },
      ]);
    });

    it("resolves require rules correctly", () => {
      const merged = mergeMatrixWithSkills(
        REQUIRES_MATRIX.categories,
        REQUIRES_MATRIX.relationships,
        [
          createMockExtractedSkill("web-state-zustand", {
            description: "Zustand",
            category: "web-client-state",
          }),
          createMockExtractedSkill("web-framework-react", { description: "React" }),
        ],
      );

      const zustand = merged.skills["web-state-zustand"];
      expect(zustand!.requires).toHaveLength(1);
      expect(zustand!.requires).toStrictEqual([
        {
          skillIds: ["web-framework-react"],
          needsAny: false,
          reason: "Zustand needs React",
        },
      ]);

      // React should NOT have any requirements from this rule
      const react = merged.skills["web-framework-react"];
      expect(react!.requires).toStrictEqual([]);
    });

    it("resolves recommendations from flat recommends list", () => {
      const matrixConfig = createMockMatrixConfig(
        { "web-framework": FRAMEWORK_CATEGORY },
        {
          relationships: {
            recommends: [{ skill: "zustand", reason: "Best state management" }],
          },
        },
      );

      const merged = mergeMatrixWithSkills(matrixConfig.categories, matrixConfig.relationships, [
        createMockExtractedSkill("web-framework-react", { description: "React" }),
        createMockExtractedSkill("web-state-zustand", {
          description: "Zustand",
          category: "web-client-state",
        }),
      ]);

      const zustand = merged.skills["web-state-zustand"];
      expect(zustand?.isRecommended).toBe(true);
      expect(zustand?.recommendedReason).toBe("Best state management");

      const react = merged.skills["web-framework-react"];
      expect(react?.isRecommended).toBe(false);
    });

    it("returns empty relationship fields when no relationships reference a skill", () => {
      const merged = mergeMatrixWithSkills(
        MERGE_BASIC_MATRIX.categories,
        MERGE_BASIC_MATRIX.relationships,
        [createMockExtractedSkill("web-framework-react", { description: "React" })],
      );

      const react = merged.skills["web-framework-react"];
      expect(react?.conflictsWith).toStrictEqual([]);
      expect(react?.requires).toStrictEqual([]);
      expect(react?.alternatives).toStrictEqual([]);
      expect(react?.discourages).toStrictEqual([]);
      expect(react?.compatibleWith).toStrictEqual([]);
      expect(react?.isRecommended).toBe(false);
      expect(react?.recommendedReason).toBeUndefined();
    });
  });

  describe("auto-synthesis", () => {
    it("synthesizes missing categories for skills with unknown category", () => {
      // Boundary cast: intentionally custom category not in built-in union
      const skill = createMockExtractedSkill("web-custom-tool" as SkillId, {
        category: "devops-iac" as CategoryPath,
        domain: "web",
      });

      const merged = mergeMatrixWithSkills({}, EMPTY_MATRIX_CONFIG.relationships, [skill]);

      // Boundary cast: accessing synthesized custom category key
      const synthesized = merged.categories["devops-iac" as Category];
      expect(synthesized).toStrictEqual(
        expect.objectContaining({
          displayName: "Devops Iac",
          exclusive: false,
          required: false,
          order: 999,
          domain: "web",
        }),
      );
    });

    it("uses skill domain field for synthesized category domain", () => {
      // Boundary cast: intentionally custom category not in built-in union
      const skill = createMockExtractedSkill("web-custom-tool" as SkillId, {
        category: "devops-iac" as CategoryPath,
        domain: "api",
      });

      const merged = mergeMatrixWithSkills({}, EMPTY_MATRIX_CONFIG.relationships, [skill]);

      expect(merged.categories["devops-iac" as Category]!.domain).toBe("api");
    });

    it("passes skill domain to synthesized category regardless of prefix", () => {
      const skill = createMockExtractedSkill("web-custom-tool" as SkillId, {
        // Boundary cast: intentionally custom category not in built-in union
        category: "web-custom" as CategoryPath,
        domain: "cli",
      });

      const merged = mergeMatrixWithSkills({}, EMPTY_MATRIX_CONFIG.relationships, [skill]);

      expect(merged.categories["web-custom" as Category]!.domain).toBe("cli");
    });

    it("synthesized category uses skill domain even for unknown prefixes", () => {
      // Boundary cast: intentionally custom category not in built-in union
      const skill = createMockExtractedSkill("web-custom-tool" as SkillId, {
        category: "devops-iac" as CategoryPath,
        domain: "shared",
      });

      const merged = mergeMatrixWithSkills({}, EMPTY_MATRIX_CONFIG.relationships, [skill]);

      expect(merged.categories["devops-iac" as Category]!.domain).toBe("shared");
    });

    it("does not synthesize categories that already exist", () => {
      const existingCategories = {
        "web-framework": FRAMEWORK_CATEGORY,
      };

      const merged = mergeMatrixWithSkills(existingCategories, EMPTY_MATRIX_CONFIG.relationships, [
        createMockExtractedSkill("web-framework-react", { description: "React" }),
      ]);

      expect(merged.categories["web-framework"]).toBe(FRAMEWORK_CATEGORY);
    });
  });

  describe("synthesizeCategory", () => {
    it("creates category with provided domain", () => {
      // Boundary cast: custom category not in built-in union
      const cat = synthesizeCategory("web-custom" as Category, "web");
      expect(cat.domain).toBe("web");
      expect(cat.displayName).toBe("Web Custom");
    });

    it("creates category with explicit domain override", () => {
      // Boundary cast: custom category not in built-in union
      const cat = synthesizeCategory("devops-iac" as Category, "api");
      expect(cat.domain).toBe("api");
    });

    it("uses the provided domain regardless of category prefix", () => {
      // Boundary cast: custom category not in built-in union
      const cat = synthesizeCategory("devops-iac" as Category, "cli");
      expect(cat.domain).toBe("cli");
    });
  });
});
