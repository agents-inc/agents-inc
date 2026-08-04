import { beforeEach, describe, it, expect } from "vitest";
import {
  getDependentSkills,
  isDiscouraged,
  getDiscourageReason,
  isIncompatible,
  getIncompatibleReason,
  hasUnmetRequirements,
  getUnmetRequirementsReason,
  isRecommended,
  validateSelection,
  validateConflicts,
  validateRequirements,
  validateExclusivity,
  validateRecommendations,
  getSkillsByCategory,
  getAvailableSkills,
} from "./matrix-resolver";
import type { CategoryPath, SkillId } from "../../types";
import { SKILLS, TEST_CATEGORIES } from "../__tests__/test-fixtures";
import { createMockSkill } from "../__tests__/factories/skill-factories.js";
import { buildCategoryMap, createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import { createMockCategory } from "../__tests__/factories/category-factories.js";
import {
  EMPTY_MATRIX,
  SINGLE_REACT_MATRIX,
  WEB_PAIR_MATRIX,
} from "../__tests__/mock-data/mock-matrices";
import { initializeMatrix } from "./matrix-provider";

const REACT_ID: SkillId = "web-framework-react";
const VUE_ID: SkillId = "web-framework-vue-composition-api";
const ZUSTAND_ID: SkillId = "web-state-zustand";
const HONO_ID: SkillId = "api-framework-hono";
const SCSS_ID: SkillId = "web-styling-scss-modules";
const TAILWIND_ID: SkillId = "web-styling-tailwind";

// Boundary cast: deliberately invalid skill IDs for error-path testing
const UNKNOWN_SKILL_ID = "web-test-unknown-skill" as SkillId;
const NONEXISTENT_SKILL_ID = "web-skill-nonexistent-item" as SkillId;

// Boundary casts: test matrices only cover the web-framework category
const NON_EXCLUSIVE_FRAMEWORK_CATEGORIES = buildCategoryMap({
  "web-framework": {
    ...TEST_CATEGORIES.framework,
    description: "Frameworks",
    exclusive: false,
    order: 1,
  },
});

const EXCLUSIVE_FRAMEWORK_CATEGORIES = buildCategoryMap({
  "web-framework": { ...TEST_CATEGORIES.framework, exclusive: true },
});

describe("unknown skill ids", () => {
  it("resolver entry points throw for ids not in the matrix", () => {
    initializeMatrix(EMPTY_MATRIX);
    expect(() => isDiscouraged(UNKNOWN_SKILL_ID, [])).toThrow("Skill not found");
  });
});

describe("isDiscouraged", () => {
  it("should return false for skill with no discourages", () => {
    const skill = createMockSkill(REACT_ID);
    const matrix = createMockMatrix(skill);
    initializeMatrix(matrix);

    const result = isDiscouraged(REACT_ID, []);
    expect(result).toBe(false);
  });

  it("should return true if selected skill discourages this skill", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      discourages: [{ skillId: REACT_ID, reason: "Not recommended" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = isDiscouraged(REACT_ID, [VUE_ID]);
    expect(result).toBe(true);
  });

  it("should return true if this skill discourages a selected skill", () => {
    const skillA = createMockSkill(REACT_ID, {
      discourages: [{ skillId: VUE_ID, reason: "Not recommended" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = isDiscouraged(REACT_ID, [VUE_ID]);
    expect(result).toBe(true);
  });

  it("should return false if skill conflicts with a selected skill (conflicts now handled by isIncompatible)", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason: "Incompatible" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = isDiscouraged(REACT_ID, [VUE_ID]);
    expect(result).toBe(false);
    // Conflicts are now checked via isIncompatible
    expect(isIncompatible(REACT_ID, [VUE_ID])).toBe(true);
  });

  it("should return false if selected skill conflicts with this skill (conflicts now handled by isIncompatible)", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      conflictsWith: [{ skillId: REACT_ID, reason: "Incompatible" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = isDiscouraged(REACT_ID, [VUE_ID]);
    expect(result).toBe(false);
    // Conflicts are now checked via isIncompatible
    expect(isIncompatible(REACT_ID, [VUE_ID])).toBe(true);
  });

  it("should return false if required skills are not selected (requirements now handled by hasUnmetRequirements)", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID, ZUSTAND_ID], needsAny: false, reason: "Needs both" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID);
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    const result = isDiscouraged(REACT_ID, [VUE_ID]);
    expect(result).toBe(false);
    // Requirements are now checked via hasUnmetRequirements (separate from isIncompatible)
    expect(hasUnmetRequirements(REACT_ID, [VUE_ID])).toBe(true);
  });

  it("should return false via isIncompatible if required skills are all selected (AND logic)", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID, ZUSTAND_ID], needsAny: false, reason: "Needs both" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID);
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    const result = isIncompatible(REACT_ID, [VUE_ID, ZUSTAND_ID]);
    expect(result).toBe(false);
  });

  it("should return true via hasUnmetRequirements if none of the required skills are selected (OR logic)", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID, ZUSTAND_ID], needsAny: true, reason: "Needs one" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID);
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    const result = hasUnmetRequirements(REACT_ID, []);
    expect(result).toBe(true);
  });

  it("should return false via isIncompatible if any required skill is selected (OR logic)", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID, ZUSTAND_ID], needsAny: true, reason: "Needs one" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID);
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    const result = isIncompatible(REACT_ID, [ZUSTAND_ID]);
    expect(result).toBe(false);
  });
});

describe("isRecommended", () => {
  it("should return false for skill not in recommends list", () => {
    const skill = createMockSkill(REACT_ID);
    const matrix = createMockMatrix(skill);
    initializeMatrix(matrix);

    const result = isRecommended(REACT_ID, []);
    expect(result).toBe(false);
  });

  it("should return true if skill is recommended and has no compatibility constraints", () => {
    const skillA = createMockSkill(REACT_ID, {
      isRecommended: true,
      recommendedReason: "Works well together",
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = isRecommended(REACT_ID, [VUE_ID]);
    expect(result).toBe(true);
  });

  it("should return false if skill is not marked as recommended", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = isRecommended(REACT_ID, [VUE_ID]);
    expect(result).toBe(false);
  });
});

describe("getDiscourageReason", () => {
  it("should return undefined for non-discouraged skill", () => {
    const skill = createMockSkill(REACT_ID);
    const matrix = createMockMatrix(skill);
    initializeMatrix(matrix);

    const result = getDiscourageReason(REACT_ID, []);
    expect(result).toBeUndefined();
  });

  it("should return reason for discouraged skill", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      discourages: [{ skillId: REACT_ID, reason: "Not recommended together" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = getDiscourageReason(REACT_ID, [VUE_ID]);
    expect(result).toContain("Not recommended together");
  });

  it("should return undefined for conflicts (conflicts now handled by getIncompatibleReason)", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason: "Incompatible architectures" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const reason = getDiscourageReason(REACT_ID, [VUE_ID]);
    expect(reason).toBeUndefined();
    // Conflicts are now checked via getIncompatibleReason
    const incompatibleReason = getIncompatibleReason(REACT_ID, [VUE_ID]);
    expect(incompatibleReason).toContain("conflicts with");
    expect(incompatibleReason).toContain("Vue Composition Api");
  });

  it("should return undefined for unmet requirements (requirements now handled by getUnmetRequirementsReason)", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Framework required" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const reason = getDiscourageReason(REACT_ID, []);
    expect(reason).toBeUndefined();
    // Requirements are now checked via getUnmetRequirementsReason (separate from getIncompatibleReason)
    const unmetReason = getUnmetRequirementsReason(REACT_ID, []);
    expect(unmetReason).toContain("requires");
    expect(unmetReason).toContain("Vue Composition Api");
  });
});

describe("validateSelection", () => {
  it("when no skills are selected, should return valid with no errors", () => {
    const matrix = EMPTY_MATRIX;
    initializeMatrix(matrix);
    const result = validateSelection([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("should return valid for non-conflicting selection", () => {
    const matrix = createMockMatrix(createMockSkill(REACT_ID), createMockSkill(VUE_ID));
    initializeMatrix(matrix);

    const result = validateSelection([REACT_ID, VUE_ID]);
    expect(result.valid).toBe(true);
  });

  it("should return error for conflicting skills", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason: "Incompatible" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = validateSelection([REACT_ID, VUE_ID]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("conflict");
  });

  it("should return error for missing requirements", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs B" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = validateSelection([REACT_ID]);
    expect(result.valid).toBe(true);
    expect(result.errors.some((e) => e.type === "missingRequirement")).toBe(true);
  });

  it("should return warning for missing recommendations", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      isRecommended: true,
      recommendedReason: "Works better together",
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = validateSelection([REACT_ID]);
    expect(result.valid).toBe(true); // Warnings don't make it invalid
    expect(result.warnings.some((w) => w.type === "missing_recommendation")).toBe(true);
  });

  it("should return error for category exclusivity violation", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
    });
    const skillB = createMockSkill(VUE_ID, {
      category: "web-framework",
    });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: buildCategoryMap({
        "web-framework": { ...TEST_CATEGORIES.framework, description: "Frameworks", order: 1 },
      }),
    });
    initializeMatrix(matrix);

    const result = validateSelection([REACT_ID, VUE_ID]);
    expect(result.valid).toBe(true);
    expect(result.errors.some((e) => e.type === "categoryExclusive")).toBe(true);
  });
});

describe("getSkillsByCategory", () => {
  it("should return skills in the specified category", () => {
    const matrix = createMockMatrix(
      createMockSkill(REACT_ID, { category: "web-framework" }),
      createMockSkill(VUE_ID, { category: "web-styling" }),
      createMockSkill(ZUSTAND_ID, { category: "web-framework" }),
    );
    initializeMatrix(matrix);

    const result = getSkillsByCategory("web-framework");
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toContain(REACT_ID);
    expect(result.map((s) => s.id)).toContain(ZUSTAND_ID);
  });

  it("should return empty array for category with no skills", () => {
    const matrix = createMockMatrix(createMockSkill(REACT_ID, { category: "web-framework" }));
    initializeMatrix(matrix);

    const result = getSkillsByCategory("web-nonexistent" as CategoryPath);
    expect(result).toHaveLength(0);
  });
});

describe("Empty skill selection", () => {
  describe("validateSelection with empty skills", () => {
    it("should return valid=true for empty selection", () => {
      const matrix = EMPTY_MATRIX;
      initializeMatrix(matrix);
      const result = validateSelection([]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should return valid=true even with skills available in matrix", () => {
      const matrix = createMockMatrix(
        createMockSkill(REACT_ID),
        createMockSkill(VUE_ID),
        createMockSkill(ZUSTAND_ID),
      );
      initializeMatrix(matrix);

      const result = validateSelection([]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should not flag missing recommendations for empty selection when recommended skills have compatibility constraints", () => {
      // Recommended skill with compatibleWith won't trigger warning when nothing is selected
      const skillA = createMockSkill(REACT_ID);
      const skillB = createMockSkill(VUE_ID, {
        isRecommended: true,
        recommendedReason: "Works well together",
        compatibleWith: [REACT_ID],
      });
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([]);

      // skillB is recommended but has compatibleWith constraint — not compatible with empty selection
      expect(result.warnings).toHaveLength(0);
    });

    it("should not flag category requirements for empty selection", () => {
      // Required categories only matter when skills are selected
      const matrix = createMockMatrix(
        {},
        {
          categories: buildCategoryMap({
            "web-framework": {
              ...TEST_CATEGORIES.framework,
              description: "Required framework",
              required: true,
              order: 1,
            },
          }),
        },
      );
      initializeMatrix(matrix);

      const result = validateSelection([]);

      // Empty selection is valid - required categories are enforced at wizard level
      expect(result.valid).toBe(true);
    });
  });

  describe("isDiscouraged with empty current selections", () => {
    it("should not discourage skills when nothing is selected (no conflicts)", () => {
      const skill = createMockSkill(REACT_ID);
      const matrix = createMockMatrix(skill);
      initializeMatrix(matrix);

      const result = isDiscouraged(REACT_ID, []);
      expect(result).toBe(false);
    });

    it("should not mark skills with unmet requirements as incompatible (requirements are separate)", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs B" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = isIncompatible(REACT_ID, []);
      expect(result).toBe(false);
    });

    it("should detect unmet requirements via hasUnmetRequirements", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs B" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = hasUnmetRequirements(REACT_ID, []);
      expect(result).toBe(true);
    });
  });

  describe("isRecommended with empty current selections", () => {
    it("should recommend skill with isRecommended even when nothing is selected", () => {
      const skillA = createMockSkill(REACT_ID, {
        isRecommended: true,
        recommendedReason: "Works well",
      });
      const matrix = createMockMatrix(skillA);
      initializeMatrix(matrix);

      // With no selections, isRecommended alone is sufficient
      const result = isRecommended(REACT_ID, []);
      expect(result).toBe(true);
    });

    it("should not recommend skill without isRecommended flag", () => {
      const skillA = createMockSkill(REACT_ID);
      const matrix = createMockMatrix(skillA);
      initializeMatrix(matrix);

      const result = isRecommended(REACT_ID, []);
      expect(result).toBe(false);
    });
  });

  describe("isDiscouraged with empty current selections", () => {
    it("should not discourage anything when nothing is selected", () => {
      const skillA = createMockSkill(REACT_ID);
      const skillB = createMockSkill(VUE_ID, {
        discourages: [{ skillId: REACT_ID, reason: "Not recommended" }],
      });
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = isDiscouraged(REACT_ID, []);
      expect(result).toBe(false);
    });
  });
});

describe("Conflicting skills", () => {
  describe("validateSelection catches conflicts", () => {
    it("should return error when conflicting skills are both selected", () => {
      const skillA = createMockSkill(REACT_ID, {
        conflictsWith: [{ skillId: VUE_ID, reason: "These cannot work together" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID, VUE_ID]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("conflict");
      expect(result.errors[0].message).toContain("React conflicts with Vue Composition Api");
      expect(result.errors[0].message).toContain("These cannot work together");
      expect(result.errors[0].skills).toContain(REACT_ID);
      expect(result.errors[0].skills).toContain(VUE_ID);
    });

    it("should return multiple errors for multiple conflicts", () => {
      const skillA = createMockSkill(REACT_ID, {
        conflictsWith: [
          { skillId: VUE_ID, reason: "Conflicts with B" },
          { skillId: ZUSTAND_ID, reason: "Conflicts with C" },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const skillC = createMockSkill(ZUSTAND_ID);
      const matrix = createMockMatrix(skillA, skillB, skillC);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID, VUE_ID, ZUSTAND_ID]);

      expect(result.valid).toBe(true);
      expect(result.errors.filter((e) => e.type === "conflict")).toHaveLength(2);
    });

    it("should catch conflicts when declaring skill comes first in selection", () => {
      const skillA = createMockSkill(REACT_ID, {
        conflictsWith: [{ skillId: VUE_ID, reason: "A conflicts with B" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID, VUE_ID]);

      expect(result.valid).toBe(true);
      expect(result.errors[0].type).toBe("conflict");
    });

    it("documents: validateSelection depends on conflict declaration order", () => {
      // NOTE: validateSelection only checks skillA.conflictsWith where skillA
      // comes BEFORE the conflicting skill in the selection array.
      // This is a limitation — the primary protection is isDiscouraged() which
      // checks bidirectionally and warns about invalid selections in the UI.
      const skillA = createMockSkill(REACT_ID, {
        conflictsWith: [{ skillId: VUE_ID, reason: "A conflicts with B" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([VUE_ID, REACT_ID]);

      expect(result.valid).toBe(true);
    });
  });

  describe("conflicting skills are discouraged in getAvailableSkills", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
      conflictsWith: [{ skillId: VUE_ID, reason: "Different paradigms" }],
    });
    const skillB = createMockSkill(VUE_ID, {
      category: "web-framework",
    });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: buildCategoryMap({
        "web-framework": {
          ...TEST_CATEGORIES.framework,
          description: "Frameworks",
          exclusive: false,
          order: 1,
        },
      }),
    });

    beforeEach(() => {
      initializeMatrix(matrix);
    });

    it("when conflicting skill is selected, should mark skill as incompatible", () => {
      const options = getAvailableSkills("web-framework", [VUE_ID]);

      const skillAOption = options.find((o: { id: string }) => o.id === REACT_ID);
      expect(skillAOption?.advisoryState.status).toBe("incompatible");
    });

    it("when conflicting skill is selected, should set reason with conflict reason", () => {
      const options = getAvailableSkills("web-framework", [VUE_ID]);

      const skillAOption = options.find((o: { id: string }) => o.id === REACT_ID);
      expect(skillAOption?.advisoryState).toStrictEqual(
        expect.objectContaining({
          status: "incompatible",
          reason: expect.stringContaining("conflicts with"),
        }),
      );
    });
  });
});

describe("Missing skill dependencies", () => {
  describe("validateSelection catches missing dependencies", () => {
    it("should return error when required skill is not selected (single dependency)", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [
          {
            skillIds: [VUE_ID],
            needsAny: false,
            reason: "Framework required",
          },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("missingRequirement");
      expect(result.errors[0].skills).toContain(REACT_ID);
      expect(result.errors[0].skills).toContain(VUE_ID);
    });

    it("should return error when multiple required skills are missing (AND logic)", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [
          {
            skillIds: [VUE_ID, ZUSTAND_ID],
            needsAny: false,
            reason: "Both B and C required",
          },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const skillC = createMockSkill(ZUSTAND_ID);
      const matrix = createMockMatrix(skillA, skillB, skillC);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("missingRequirement");
      // Should include both missing dependencies
      expect(result.errors[0].skills).toContain(VUE_ID);
      expect(result.errors[0].skills).toContain(ZUSTAND_ID);
    });

    it("should return error when none of the required skills are selected (OR logic)", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [
          {
            skillIds: [VUE_ID, ZUSTAND_ID],
            needsAny: true,
            reason: "Needs at least one framework",
          },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const skillC = createMockSkill(ZUSTAND_ID);
      const matrix = createMockMatrix(skillA, skillB, skillC);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe("missingRequirement");
      expect(result.errors[0].message).toContain("one of");
    });

    it("should be valid when at least one of OR required skills is selected", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [
          {
            skillIds: [VUE_ID, ZUSTAND_ID],
            needsAny: true,
            reason: "Needs at least one framework",
          },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const skillC = createMockSkill(ZUSTAND_ID);
      const matrix = createMockMatrix(skillA, skillB, skillC);
      initializeMatrix(matrix);

      // Only ZUSTAND_ID selected (not VUE_ID), but that's enough
      const result = validateSelection([REACT_ID, ZUSTAND_ID]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should return multiple errors when multiple skills have missing dependencies", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [ZUSTAND_ID], needsAny: false, reason: "A needs C" }],
      });
      const skillB = createMockSkill(VUE_ID, {
        requires: [{ skillIds: [HONO_ID], needsAny: false, reason: "B needs D" }],
      });
      const skillC = createMockSkill(ZUSTAND_ID);
      const skillD = createMockSkill(HONO_ID);
      const matrix = createMockMatrix(skillA, skillB, skillC, skillD);
      initializeMatrix(matrix);

      // Both A and B are selected but their dependencies are not
      const result = validateSelection([REACT_ID, VUE_ID]);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(2);
      expect(result.errors.every((e) => e.type === "missingRequirement")).toBe(true);
    });
  });

  describe("validation result includes which dependencies are missing", () => {
    it("should include missing skill IDs in the error skills array", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs B" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID]);

      expect(result.errors[0].skills).toStrictEqual([REACT_ID, VUE_ID]);
    });

    it("should include skill display name in error message", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs B" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID]);

      expect(result.errors[0].message).toContain("React");
      expect(result.errors[0].message).toContain("Vue Composition Api");
    });

    it("should include all missing skill display names when multiple are missing", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [
          {
            skillIds: [VUE_ID, ZUSTAND_ID],
            needsAny: false,
            reason: "Needs both",
          },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const skillC = createMockSkill(ZUSTAND_ID);
      const matrix = createMockMatrix(skillA, skillB, skillC);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID]);

      expect(result.errors[0].message).toContain("Vue Composition Api");
      expect(result.errors[0].message).toContain("Zustand");
    });
  });

  describe("recommendation system suggests adding recommended skills", () => {
    it("should issue warning when recommended skill is not selected", () => {
      const skillA = createMockSkill(REACT_ID);
      const skillB = createMockSkill(VUE_ID, {
        isRecommended: true,
        recommendedReason: "Better type safety",
      });
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID]);

      expect(result.valid).toBe(true); // Recommendations are warnings, not errors
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe("missing_recommendation");
      expect(result.warnings[0].message).toContain("Vue Composition Api");
      expect(result.warnings[0].message).toContain("Better type safety");
    });

    it("should include recommended skill in warning skills array", () => {
      const skillA = createMockSkill(REACT_ID);
      const skillB = createMockSkill(VUE_ID, {
        isRecommended: true,
        recommendedReason: "Recommended",
      });
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID]);

      expect(result.warnings[0].skills).toContain(VUE_ID);
    });

    it("should not warn about recommendations that conflict with selected skills", () => {
      const skillA = createMockSkill(REACT_ID);
      const skillB = createMockSkill(VUE_ID, {
        isRecommended: true,
        recommendedReason: "Recommended",
        conflictsWith: [{ skillId: ZUSTAND_ID, reason: "Incompatible" }],
      });
      const skillC = createMockSkill(ZUSTAND_ID);
      const matrix = createMockMatrix(skillA, skillB, skillC);
      initializeMatrix(matrix);

      // B is recommended but conflicts with C which is selected
      const result = validateSelection([REACT_ID, ZUSTAND_ID]);

      // Should not recommend B since it conflicts with C
      expect(result.warnings.filter((w) => w.type === "missing_recommendation")).toHaveLength(0);
    });

    it("should not warn when recommended skill is already selected", () => {
      const skillA = createMockSkill(REACT_ID);
      const skillB = createMockSkill(VUE_ID, {
        isRecommended: true,
        recommendedReason: "Recommended",
      });
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID, VUE_ID]);

      expect(result.warnings.filter((w) => w.type === "missing_recommendation")).toHaveLength(0);
    });
  });

  describe("hasUnmetRequirements detects skills with unmet dependencies", () => {
    it("should detect unmet requirements when required dependency is not selected", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs framework" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = hasUnmetRequirements(REACT_ID, []);

      expect(result).toBe(true);
    });

    it("should not detect unmet requirements when required dependency is selected", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs framework" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = hasUnmetRequirements(REACT_ID, [VUE_ID]);

      expect(result).toBe(false);
    });

    it("should not affect isIncompatible (requirements are separate from conflicts)", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs framework" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = isIncompatible(REACT_ID, []);

      expect(result).toBe(false);
    });
  });

  describe("getUnmetRequirementsReason explains why skill has unmet dependencies", () => {
    it("should explain missing required skill", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [
          {
            skillIds: [VUE_ID],
            needsAny: false,
            reason: "Framework required",
          },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const reason = getUnmetRequirementsReason(REACT_ID, []);

      expect(reason).toContain("requires");
      expect(reason).toContain("Vue Composition Api");
    });

    it("should list all missing required skills (AND logic)", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [
          {
            skillIds: [VUE_ID, ZUSTAND_ID],
            needsAny: false,
            reason: "Multiple frameworks needed",
          },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const skillC = createMockSkill(ZUSTAND_ID);
      const matrix = createMockMatrix(skillA, skillB, skillC);
      initializeMatrix(matrix);

      const reason = getUnmetRequirementsReason(REACT_ID, []);

      expect(reason).toContain("Vue Composition Api");
      expect(reason).toContain("Zustand");
    });

    it("should explain OR requirement options", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [
          {
            skillIds: [VUE_ID, ZUSTAND_ID],
            needsAny: true,
            reason: "Need a framework",
          },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const skillC = createMockSkill(ZUSTAND_ID);
      const matrix = createMockMatrix(skillA, skillB, skillC);
      initializeMatrix(matrix);

      const reason = getUnmetRequirementsReason(REACT_ID, []);

      expect(reason).toContain("requires");
      expect(reason).toContain("or");
    });

    it("should return undefined when getIncompatibleReason is called for requirements (requirements are separate)", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [
          {
            skillIds: [VUE_ID],
            needsAny: false,
            reason: "Framework required",
          },
        ],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const reason = getIncompatibleReason(REACT_ID, []);

      expect(reason).toBeUndefined();
    });
  });

  describe("skill ID resolution works with dependencies", () => {
    it("should detect missing requirement when dependency is not selected", () => {
      const skillA = createMockSkill(SCSS_ID, {
        requires: [
          {
            skillIds: [TAILWIND_ID],
            needsAny: false,
            reason: "Needs B",
          },
        ],
      });
      const skillB = createMockSkill(TAILWIND_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([SCSS_ID]);

      expect(result.valid).toBe(true);
      expect(result.errors[0].type).toBe("missingRequirement");
    });

    it("should validate successfully when dependency is selected", () => {
      const skillA = createMockSkill(SCSS_ID, {
        requires: [
          {
            skillIds: [TAILWIND_ID],
            needsAny: false,
            reason: "Needs B",
          },
        ],
      });
      const skillB = createMockSkill(TAILWIND_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([SCSS_ID, TAILWIND_ID]);

      expect(result.valid).toBe(true);
    });
  });
});

// --- Edge case tests ---

describe("getDependentSkills", () => {
  it("should return empty array when no skills depend on target", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = getDependentSkills(REACT_ID, [REACT_ID, VUE_ID]);
    expect(result).toStrictEqual([]);
  });

  it("should throw when skill is not in matrix", () => {
    const matrix = EMPTY_MATRIX;
    initializeMatrix(matrix);

    expect(() => getDependentSkills(NONEXISTENT_SKILL_ID, [])).toThrow("Skill not found");
  });

  it("should find single dependent with AND requirement", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      requires: [{ skillIds: [REACT_ID], needsAny: false, reason: "Needs A" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = getDependentSkills(REACT_ID, [REACT_ID, VUE_ID]);
    expect(result).toStrictEqual([VUE_ID]);
  });

  it("should find multiple dependents", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      requires: [{ skillIds: [REACT_ID], needsAny: false, reason: "B needs A" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID, {
      requires: [{ skillIds: [REACT_ID], needsAny: false, reason: "C needs A" }],
    });
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    const result = getDependentSkills(REACT_ID, [REACT_ID, VUE_ID, ZUSTAND_ID]);
    expect(result).toContain(VUE_ID);
    expect(result).toContain(ZUSTAND_ID);
    expect(result).toHaveLength(2);
  });

  it("should detect OR dependency when target is the sole satisfier", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID, {
      requires: [{ skillIds: [REACT_ID, VUE_ID], needsAny: true, reason: "Needs one" }],
    });
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    // Only A and C selected, so A is the sole satisfier of C's OR requirement
    const result = getDependentSkills(REACT_ID, [REACT_ID, ZUSTAND_ID]);
    expect(result).toStrictEqual([ZUSTAND_ID]);
  });

  it("should NOT detect OR dependency when another satisfier is also selected", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID, {
      requires: [{ skillIds: [REACT_ID, VUE_ID], needsAny: true, reason: "Needs one" }],
    });
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    // Both A and B selected, so removing A would still leave B to satisfy C
    const result = getDependentSkills(REACT_ID, [REACT_ID, VUE_ID, ZUSTAND_ID]);
    expect(result).toStrictEqual([]);
  });

  it("should skip the target skill itself in selections", () => {
    // If a skill requires itself (odd but shouldn't crash), it should skip
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [REACT_ID], needsAny: false, reason: "Self-ref" }],
    });
    const matrix = createMockMatrix(skillA);
    initializeMatrix(matrix);

    const result = getDependentSkills(REACT_ID, [REACT_ID]);
    // A cannot depend on itself in getDependentSkills — it skips selectedId === fullId
    expect(result).toStrictEqual([]);
  });

  it("should handle transitive chain (only direct dependents returned)", () => {
    // A <- B <- C (B requires A, C requires B)
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      requires: [{ skillIds: [REACT_ID], needsAny: false, reason: "B needs A" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID, {
      requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "C needs B" }],
    });
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    // getDependentSkills returns DIRECT dependents only
    const result = getDependentSkills(REACT_ID, [REACT_ID, VUE_ID, ZUSTAND_ID]);
    // Only B directly depends on A; C depends on B (transitive, not returned)
    expect(result).toStrictEqual([VUE_ID]);
  });

  it("should handle circular requirements without infinite loop", () => {
    // A requires B, B requires A — both selected
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "A needs B" }],
    });
    const skillB = createMockSkill(VUE_ID, {
      requires: [{ skillIds: [REACT_ID], needsAny: false, reason: "B needs A" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    // Asking "who depends on A?" -> B depends on A
    const resultA = getDependentSkills(REACT_ID, [REACT_ID, VUE_ID]);
    expect(resultA).toStrictEqual([VUE_ID]);

    // Asking "who depends on B?" -> A depends on B
    const resultB = getDependentSkills(VUE_ID, [REACT_ID, VUE_ID]);
    expect(resultB).toStrictEqual([REACT_ID]);
  });

  it("should find dependents using full skill IDs", () => {
    const skillA = createMockSkill(SCSS_ID);
    const skillB = createMockSkill(TAILWIND_ID, {
      requires: [{ skillIds: [SCSS_ID], needsAny: false, reason: "B needs A" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = getDependentSkills(SCSS_ID, [SCSS_ID, TAILWIND_ID]);
    expect(result).toStrictEqual([TAILWIND_ID]);
  });

  it("should handle skill with multiple AND requirements including target", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID, {
      requires: [{ skillIds: [REACT_ID, VUE_ID], needsAny: false, reason: "Needs both" }],
    });
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    // C requires both A and B (AND), so C is dependent on A
    const result = getDependentSkills(REACT_ID, [REACT_ID, VUE_ID, ZUSTAND_ID]);
    expect(result).toStrictEqual([ZUSTAND_ID]);
  });

  it("should find dependents even when target is not in current selections", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      requires: [{ skillIds: [REACT_ID], needsAny: false, reason: "B needs A" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    // A is not in selections — asking who depends on A among current selections
    const result = getDependentSkills(REACT_ID, [VUE_ID]);
    // B depends on A, so it should still be returned
    expect(result).toStrictEqual([VUE_ID]);
  });
});

describe("getAvailableSkills edge cases", () => {
  it("should return empty array for category with no skills", () => {
    const matrix = createMockMatrix(createMockSkill(REACT_ID, { category: "web-framework" }), {
      categories: buildCategoryMap({
        "web-styling": {
          ...TEST_CATEGORIES.styling,
          description: "Styling options",
          exclusive: false,
          order: 1,
        },
      }),
    });
    initializeMatrix(matrix);

    const result = getAvailableSkills("web-styling", []);
    expect(result).toStrictEqual([]);
  });

  it("should handle large number of skills without issues", () => {
    const SKILL_COUNT = 200;
    const skills = Object.fromEntries(
      Array.from({ length: SKILL_COUNT }, (_, i) => {
        const id = `web-perf-skill${i}` as SkillId;
        return [id, createMockSkill(id, { category: "api-performance" })];
      }),
    );
    const matrix = createMockMatrix(skills, {
      categories: buildCategoryMap({
        "api-performance": createMockCategory("api-performance", "Performance", {
          description: "Performance tools",
          exclusive: false,
          order: 1,
        }),
      }),
    });
    initializeMatrix(matrix);

    const result = getAvailableSkills("api-performance", []);
    expect(result).toHaveLength(SKILL_COUNT);
    expect(result.every((o) => !o.selected)).toBe(true);
  });

  it("should include alternatives in skill options", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
      alternatives: [
        { skillId: VUE_ID, purpose: "Alternative framework" },
        { skillId: ZUSTAND_ID, purpose: "Another alternative" },
      ],
    });
    const skillB = createMockSkill(VUE_ID, {
      category: "web-framework",
    });
    const skillC = createMockSkill(ZUSTAND_ID, {
      category: "web-framework",
    });
    const matrix = createMockMatrix(skillA, skillB, skillC, {
      categories: NON_EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = getAvailableSkills("web-framework", []);
    const optionA = result.find((o) => o.id === REACT_ID);
    expect(optionA?.alternatives).toStrictEqual([VUE_ID, ZUSTAND_ID]);
  });

  it("should correctly mark selected skills", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
    });
    const skillB = createMockSkill(VUE_ID, {
      category: "web-framework",
    });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: NON_EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = getAvailableSkills("web-framework", [REACT_ID]);
    const optionA = result.find((o) => o.id === REACT_ID);
    const optionB = result.find((o) => o.id === VUE_ID);
    expect(optionA!.selected).toBe(true);
    expect(optionB!.selected).toBe(false);
  });

  it("should set discouraged and discouragedReason when applicable", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
      discourages: [{ skillId: VUE_ID, reason: "Not ideal pairing" }],
    });
    const skillB = createMockSkill(VUE_ID, {
      category: "web-framework",
    });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: NON_EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = getAvailableSkills("web-framework", [REACT_ID]);
    const optionB = result.find((o) => o.id === VUE_ID);
    expect(optionB!.advisoryState.status).toBe("discouraged");
    expect(optionB!.advisoryState).toStrictEqual(
      expect.objectContaining({ reason: expect.stringContaining("Not ideal pairing") }),
    );
  });

  it("should set recommended advisoryState when applicable", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
    });
    const skillB = createMockSkill(VUE_ID, {
      category: "web-framework",
      isRecommended: true,
      recommendedReason: "Great combination",
    });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: NON_EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = getAvailableSkills("web-framework", [REACT_ID]);
    const optionB = result.find((o) => o.id === VUE_ID);
    expect(optionB!.advisoryState.status).toBe("recommended");
    expect(optionB!.advisoryState).toStrictEqual(
      expect.objectContaining({ reason: expect.stringContaining("Great combination") }),
    );
  });

  it("should mark discouraged when skill conflicts with selected skill", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
      conflictsWith: [{ skillId: VUE_ID, reason: "Incompatible" }],
      discourages: [{ skillId: VUE_ID, reason: "Not ideal" }],
    });
    const skillB = createMockSkill(VUE_ID, {
      category: "web-framework",
    });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: NON_EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = getAvailableSkills("web-framework", [REACT_ID]);
    const optionB = result.find((o) => o.id === VUE_ID);
    // Conflicts now produce incompatible state
    expect(optionB!.advisoryState.status).toBe("incompatible");
  });

  it("incompatible takes priority over recommended when skill has conflicts", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
      conflictsWith: [{ skillId: VUE_ID, reason: "Incompatible" }],
    });
    const skillB = createMockSkill(VUE_ID, {
      category: "web-framework",
      isRecommended: true,
      recommendedReason: "Good pairing",
    });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: NON_EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = getAvailableSkills("web-framework", [REACT_ID]);
    const optionB = result.find((o) => o.id === VUE_ID);
    // Incompatible takes priority over recommended
    expect(optionB!.advisoryState.status).toBe("incompatible");
  });
});

describe("validateSelection edge cases", () => {
  it("when selected skill does not exist in matrix, should throw", () => {
    const matrix = EMPTY_MATRIX;
    initializeMatrix(matrix);

    // Selecting a skill that doesn't exist in the matrix is a bug
    expect(() => validateSelection([NONEXISTENT_SKILL_ID])).toThrow("Skill not found");
  });

  it("should detect category exclusivity with more than 2 skills in same exclusive category", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
    });
    const skillB = createMockSkill(VUE_ID, {
      category: "web-framework",
    });
    const skillC = createMockSkill(ZUSTAND_ID, {
      category: "web-framework",
    });
    const matrix = createMockMatrix(skillA, skillB, skillC, {
      categories: buildCategoryMap({
        "web-framework": { ...TEST_CATEGORIES.framework, description: "Frameworks", order: 1 },
      }),
    });
    initializeMatrix(matrix);

    const result = validateSelection([REACT_ID, VUE_ID, ZUSTAND_ID]);
    expect(result.valid).toBe(true);
    expect(result.errors.some((e) => e.type === "categoryExclusive")).toBe(true);
  });

  it("should handle skill with both conflicts and requirements", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason: "Conflicts" }],
      requires: [{ skillIds: [ZUSTAND_ID], needsAny: false, reason: "Needs C" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID);
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    // A conflicts with B AND requires C — selecting A+B should produce conflict error
    const result = validateSelection([REACT_ID, VUE_ID]);
    expect(result.valid).toBe(true);
    expect(result.errors.some((e) => e.type === "conflict")).toBe(true);
    // Also reports missing requirement for C
    expect(result.errors.some((e) => e.type === "missingRequirement")).toBe(true);
  });
});

describe("validateConflicts", () => {
  it("should return no errors for empty selections", () => {
    initializeMatrix(EMPTY_MATRIX);

    const result = validateConflicts([]);
    expect(result.errors).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([]);
  });

  it("should return no errors for a single skill", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    const result = validateConflicts([REACT_ID]);
    expect(result.errors).toStrictEqual([]);
  });

  it("should return no errors when skills do not conflict", () => {
    initializeMatrix(WEB_PAIR_MATRIX);

    const result = validateConflicts([REACT_ID, ZUSTAND_ID]);
    expect(result.errors).toStrictEqual([]);
  });

  it("should detect conflict declared on first skill against second", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason: "Choose one framework" }],
    });
    const skillB = createMockSkill(VUE_ID);
    initializeMatrix(createMockMatrix(skillA, skillB));

    const result = validateConflicts([REACT_ID, VUE_ID]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("conflict");
    expect(result.errors[0].skills).toStrictEqual([REACT_ID, VUE_ID]);
  });

  it("should not detect conflict when declaration is only on second skill (order-dependent)", () => {
    // validateConflicts only checks skillA.conflictsWith for skillB where i < j
    // If the conflict is declared on B against A, and A comes first, it won't find it
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      conflictsWith: [{ skillId: REACT_ID, reason: "Choose one framework" }],
    });
    initializeMatrix(createMockMatrix(skillA, skillB));

    const result = validateConflicts([REACT_ID, VUE_ID]);
    // B declares conflict with A, but since A (index 0) is checked first against B (index 1),
    // and A has no conflicts, nothing is found. Then B is never the "outer" loop skill
    // because j starts at i+1, so B's conflicts are not checked.
    expect(result.errors).toHaveLength(0);
  });

  it("should detect multiple conflicts in one selection set", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [
        { skillId: VUE_ID, reason: "Framework conflict" },
        { skillId: ZUSTAND_ID, reason: "State conflict" },
      ],
    });
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID);
    initializeMatrix(createMockMatrix(skillA, skillB, skillC));

    const result = validateConflicts([REACT_ID, VUE_ID, ZUSTAND_ID]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.every((e) => e.type === "conflict")).toBe(true);
  });

  it("should skip skills not found in the matrix gracefully", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    // VUE_ID is not in the matrix — should not throw, just skip
    const result = validateConflicts([REACT_ID, VUE_ID]);
    expect(result.errors).toStrictEqual([]);
  });

  it("should include conflict reason in error message", () => {
    const reason = "Only one framework per project";
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason }],
    });
    const skillB = createMockSkill(VUE_ID);
    initializeMatrix(createMockMatrix(skillA, skillB));

    const result = validateConflicts([REACT_ID, VUE_ID]);
    expect(result.errors[0].message).toContain(reason);
  });

  it("should always return empty warnings array", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason: "Conflict" }],
    });
    const skillB = createMockSkill(VUE_ID);
    initializeMatrix(createMockMatrix(skillA, skillB));

    const result = validateConflicts([REACT_ID, VUE_ID]);
    expect(result.warnings).toStrictEqual([]);
  });
});

describe("validateRequirements", () => {
  it("should return no errors for empty selections", () => {
    initializeMatrix(EMPTY_MATRIX);

    const result = validateRequirements([], new Set());
    expect(result.errors).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([]);
  });

  it("should return no errors for skill with no requirements", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    const result = validateRequirements([REACT_ID], new Set([REACT_ID]));
    expect(result.errors).toStrictEqual([]);
  });

  it("should return error when AND requirement is not satisfied", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID], needsAny: false, reason: "Needs state" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    initializeMatrix(createMockMatrix(skillA, skillC));

    const result = validateRequirements([REACT_ID], new Set([REACT_ID]));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("missingRequirement");
    expect(result.errors[0].skills).toContain(REACT_ID);
    expect(result.errors[0].skills).toContain(ZUSTAND_ID);
  });

  it("should return no error when AND requirement is fully satisfied", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID], needsAny: false, reason: "Needs state" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    initializeMatrix(createMockMatrix(skillA, skillC));

    const selectedSet = new Set<SkillId>([REACT_ID, ZUSTAND_ID]);
    const result = validateRequirements([REACT_ID, ZUSTAND_ID], selectedSet);
    expect(result.errors).toStrictEqual([]);
  });

  it("should return error listing all missing skills for multi-skill AND requirement", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID, HONO_ID], needsAny: false, reason: "Needs both" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    const skillD = createMockSkill(HONO_ID);
    initializeMatrix(createMockMatrix(skillA, skillC, skillD));

    const result = validateRequirements([REACT_ID], new Set([REACT_ID]));
    expect(result.errors).toHaveLength(1);
    // Should include both missing IDs
    expect(result.errors[0].skills).toContain(ZUSTAND_ID);
    expect(result.errors[0].skills).toContain(HONO_ID);
  });

  it("should return error for partially satisfied AND requirement", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID, HONO_ID], needsAny: false, reason: "Needs both" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    const skillD = createMockSkill(HONO_ID);
    initializeMatrix(createMockMatrix(skillA, skillC, skillD));

    // Only ZUSTAND_ID is selected, HONO_ID is missing
    const selectedSet = new Set<SkillId>([REACT_ID, ZUSTAND_ID]);
    const result = validateRequirements([REACT_ID, ZUSTAND_ID], selectedSet);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].skills).toContain(HONO_ID);
    expect(result.errors[0].skills).not.toContain(ZUSTAND_ID);
  });

  it("should return error when OR requirement has no satisfying skill selected", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID, HONO_ID], needsAny: true, reason: "Needs one of these" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    const skillD = createMockSkill(HONO_ID);
    initializeMatrix(createMockMatrix(skillA, skillC, skillD));

    const result = validateRequirements([REACT_ID], new Set([REACT_ID]));
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("missingRequirement");
  });

  it("should return no error when OR requirement has at least one satisfying skill", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID, HONO_ID], needsAny: true, reason: "Needs one of these" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    const skillD = createMockSkill(HONO_ID);
    initializeMatrix(createMockMatrix(skillA, skillC, skillD));

    const selectedSet = new Set<SkillId>([REACT_ID, HONO_ID]);
    const result = validateRequirements([REACT_ID, HONO_ID], selectedSet);
    expect(result.errors).toStrictEqual([]);
  });

  it("should return errors for multiple skills with unmet requirements", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID], needsAny: false, reason: "Needs state" }],
    });
    const skillB = createMockSkill(VUE_ID, {
      requires: [{ skillIds: [HONO_ID], needsAny: false, reason: "Needs API" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    const skillD = createMockSkill(HONO_ID);
    initializeMatrix(createMockMatrix(skillA, skillB, skillC, skillD));

    const selectedSet = new Set<SkillId>([REACT_ID, VUE_ID]);
    const result = validateRequirements([REACT_ID, VUE_ID], selectedSet);
    expect(result.errors).toHaveLength(2);
  });

  it("should handle skill with multiple requirement groups", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [
        { skillIds: [ZUSTAND_ID], needsAny: false, reason: "Needs state" },
        { skillIds: [HONO_ID], needsAny: false, reason: "Needs API" },
      ],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    const skillD = createMockSkill(HONO_ID);
    initializeMatrix(createMockMatrix(skillA, skillC, skillD));

    const result = validateRequirements([REACT_ID], new Set([REACT_ID]));
    // Two separate requirement groups, both unmet
    expect(result.errors).toHaveLength(2);
  });

  it("should skip skills not found in the matrix", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    // VUE_ID is not in the matrix — should not throw
    const result = validateRequirements([VUE_ID], new Set([VUE_ID]));
    expect(result.errors).toStrictEqual([]);
  });

  it("should always return empty warnings array", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID], needsAny: false, reason: "Needs state" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    initializeMatrix(createMockMatrix(skillA, skillC));

    const result = validateRequirements([REACT_ID], new Set([REACT_ID]));
    expect(result.warnings).toStrictEqual([]);
  });
});

describe("validateExclusivity", () => {
  it("should return no errors for empty selections", () => {
    initializeMatrix(EMPTY_MATRIX);

    const result = validateExclusivity([]);
    expect(result.errors).toStrictEqual([]);
    expect(result.warnings).toStrictEqual([]);
  });

  it("should return no errors for single skill in exclusive category", () => {
    const matrix = createMockMatrix(SKILLS.react, {
      categories: EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = validateExclusivity([REACT_ID]);
    expect(result.errors).toStrictEqual([]);
  });

  it("should return error for multiple skills in exclusive category", () => {
    const skillA = createMockSkill(REACT_ID, { category: "web-framework" });
    const skillB = createMockSkill(VUE_ID, { category: "web-framework" });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = validateExclusivity([REACT_ID, VUE_ID]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("categoryExclusive");
    expect(result.errors[0].skills).toContain(REACT_ID);
    expect(result.errors[0].skills).toContain(VUE_ID);
  });

  it("should allow multiple skills in non-exclusive category", () => {
    const skillA = createMockSkill(REACT_ID, { category: "web-testing" });
    const skillB = createMockSkill(VUE_ID, { category: "web-testing" });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: buildCategoryMap({
        "web-testing": { ...TEST_CATEGORIES.testing, exclusive: false },
      }),
    });
    initializeMatrix(matrix);

    const result = validateExclusivity([REACT_ID, VUE_ID]);
    expect(result.errors).toStrictEqual([]);
  });

  it("should skip the 'local' pseudo-category even with multiple skills", () => {
    const skillA = createMockSkill(REACT_ID, { category: "local" as CategoryPath });
    const skillB = createMockSkill(VUE_ID, { category: "local" as CategoryPath });
    initializeMatrix(createMockMatrix(skillA, skillB));

    const result = validateExclusivity([REACT_ID, VUE_ID]);
    expect(result.errors).toStrictEqual([]);
  });

  it("should handle mixed exclusive and non-exclusive categories", () => {
    const skillA = createMockSkill(REACT_ID, { category: "web-framework" });
    const skillB = createMockSkill(VUE_ID, { category: "web-framework" });
    const skillC = createMockSkill(ZUSTAND_ID, { category: "web-testing" });
    const skillD = createMockSkill(HONO_ID, { category: "web-testing" });
    const matrix = createMockMatrix(skillA, skillB, skillC, skillD, {
      categories: buildCategoryMap({
        "web-framework": { ...TEST_CATEGORIES.framework, exclusive: true },
        "web-testing": { ...TEST_CATEGORIES.testing, exclusive: false },
      }),
    });
    initializeMatrix(matrix);

    const result = validateExclusivity([REACT_ID, VUE_ID, ZUSTAND_ID, HONO_ID]);
    // Only framework is exclusive, so only one error
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("categoryExclusive");
    expect(result.errors[0].message).toContain("Framework");
  });

  it("should skip skills not found in the matrix", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    // VUE_ID not in matrix — should not throw
    const result = validateExclusivity([REACT_ID, VUE_ID]);
    expect(result.errors).toStrictEqual([]);
  });

  it("should detect exclusivity violation with 3+ skills in same category", () => {
    const skillA = createMockSkill(REACT_ID, { category: "web-framework" });
    const skillB = createMockSkill(VUE_ID, { category: "web-framework" });
    const skillC = createMockSkill(ZUSTAND_ID, { category: "web-framework" });
    const matrix = createMockMatrix(skillA, skillB, skillC, {
      categories: EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = validateExclusivity([REACT_ID, VUE_ID, ZUSTAND_ID]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].skills).toHaveLength(3);
  });

  it("should include category display name in error message", () => {
    const skillA = createMockSkill(REACT_ID, { category: "web-framework" });
    const skillB = createMockSkill(VUE_ID, { category: "web-framework" });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: buildCategoryMap({
        "web-framework": {
          ...TEST_CATEGORIES.framework,
          displayName: "Framework",
          exclusive: true,
        },
      }),
    });
    initializeMatrix(matrix);

    const result = validateExclusivity([REACT_ID, VUE_ID]);
    expect(result.errors[0].message).toContain("Framework");
  });

  it("should always return empty warnings array", () => {
    const skillA = createMockSkill(REACT_ID, { category: "web-framework" });
    const skillB = createMockSkill(VUE_ID, { category: "web-framework" });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const result = validateExclusivity([REACT_ID, VUE_ID]);
    expect(result.warnings).toStrictEqual([]);
  });
});

describe("validateRecommendations", () => {
  it("should return no warnings for empty selections", () => {
    initializeMatrix(EMPTY_MATRIX);

    const result = validateRecommendations([], new Set());
    expect(result.warnings).toStrictEqual([]);
    expect(result.errors).toStrictEqual([]);
  });

  it("should return no warnings when no skills are recommended", () => {
    initializeMatrix(WEB_PAIR_MATRIX);

    const selectedSet = new Set<SkillId>([REACT_ID]);
    const result = validateRecommendations([REACT_ID], selectedSet);
    expect(result.warnings).toStrictEqual([]);
  });

  it("should return warning for recommended skill not selected", () => {
    const recommendedSkill = createMockSkill(ZUSTAND_ID, {
      isRecommended: true,
      recommendedReason: "Great state management",
      compatibleWith: [REACT_ID],
    });
    initializeMatrix(createMockMatrix(SKILLS.react, recommendedSkill));

    const selectedSet = new Set<SkillId>([REACT_ID]);
    const result = validateRecommendations([REACT_ID], selectedSet);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("missing_recommendation");
    expect(result.warnings[0].skills).toStrictEqual([ZUSTAND_ID]);
  });

  it("should not warn when recommended skill is already selected", () => {
    const recommendedSkill = createMockSkill(ZUSTAND_ID, {
      isRecommended: true,
      recommendedReason: "Great state management",
      compatibleWith: [REACT_ID],
    });
    initializeMatrix(createMockMatrix(SKILLS.react, recommendedSkill));

    const selectedSet = new Set<SkillId>([REACT_ID, ZUSTAND_ID]);
    const result = validateRecommendations([REACT_ID, ZUSTAND_ID], selectedSet);
    expect(result.warnings).toStrictEqual([]);
  });

  it("should not warn when recommended skill is incompatible with selections", () => {
    const recommendedSkill = createMockSkill(ZUSTAND_ID, {
      isRecommended: true,
      recommendedReason: "Great state management",
      compatibleWith: [VUE_ID], // Only compatible with Vue, not React
    });
    initializeMatrix(createMockMatrix(SKILLS.react, recommendedSkill));

    const selectedSet = new Set<SkillId>([REACT_ID]);
    const result = validateRecommendations([REACT_ID], selectedSet);
    expect(result.warnings).toStrictEqual([]);
  });

  it("should warn for recommended skill with no compatibility constraints (unconditional)", () => {
    const recommendedSkill = createMockSkill(ZUSTAND_ID, {
      isRecommended: true,
      recommendedReason: "Always recommended",
      compatibleWith: [], // No constraints — recommended for everyone
    });
    initializeMatrix(createMockMatrix(SKILLS.react, recommendedSkill));

    const selectedSet = new Set<SkillId>([REACT_ID]);
    const result = validateRecommendations([REACT_ID], selectedSet);
    expect(result.warnings).toHaveLength(1);
  });

  it("should not warn when recommended skill conflicts with a selected skill", () => {
    const recommendedSkill = createMockSkill(ZUSTAND_ID, {
      isRecommended: true,
      recommendedReason: "Great state management",
      compatibleWith: [],
      conflictsWith: [{ skillId: REACT_ID, reason: "Incompatible" }],
    });
    initializeMatrix(createMockMatrix(SKILLS.react, recommendedSkill));

    const selectedSet = new Set<SkillId>([REACT_ID]);
    const result = validateRecommendations([REACT_ID], selectedSet);
    expect(result.warnings).toStrictEqual([]);
  });

  it("should include recommendation reason in warning message", () => {
    const reason = "Essential for modern React apps";
    const recommendedSkill = createMockSkill(ZUSTAND_ID, {
      isRecommended: true,
      recommendedReason: reason,
      compatibleWith: [REACT_ID],
    });
    initializeMatrix(createMockMatrix(SKILLS.react, recommendedSkill));

    const selectedSet = new Set<SkillId>([REACT_ID]);
    const result = validateRecommendations([REACT_ID], selectedSet);
    expect(result.warnings[0].message).toContain(reason);
  });

  it("should use default reason when recommendedReason is undefined", () => {
    const recommendedSkill = createMockSkill(ZUSTAND_ID, {
      isRecommended: true,
      compatibleWith: [REACT_ID],
    });
    initializeMatrix(createMockMatrix(SKILLS.react, recommendedSkill));

    const selectedSet = new Set<SkillId>([REACT_ID]);
    const result = validateRecommendations([REACT_ID], selectedSet);
    expect(result.warnings[0].message).toContain("Recommended for this stack");
  });

  it("should return multiple warnings for multiple unselected recommendations", () => {
    const rec1 = createMockSkill(ZUSTAND_ID, {
      isRecommended: true,
      recommendedReason: "State management",
      compatibleWith: [REACT_ID],
    });
    const rec2 = createMockSkill(SCSS_ID, {
      isRecommended: true,
      recommendedReason: "Styling solution",
      compatibleWith: [REACT_ID],
    });
    initializeMatrix(createMockMatrix(SKILLS.react, rec1, rec2));

    const selectedSet = new Set<SkillId>([REACT_ID]);
    const result = validateRecommendations([REACT_ID], selectedSet);
    expect(result.warnings).toHaveLength(2);
    const warnedSkills = result.warnings.flatMap((w) => w.skills);
    expect(warnedSkills).toContain(ZUSTAND_ID);
    expect(warnedSkills).toContain(SCSS_ID);
  });

  it("should always return empty errors array", () => {
    const recommendedSkill = createMockSkill(ZUSTAND_ID, {
      isRecommended: true,
      recommendedReason: "Great state management",
      compatibleWith: [REACT_ID],
    });
    initializeMatrix(createMockMatrix(SKILLS.react, recommendedSkill));

    const selectedSet = new Set<SkillId>([REACT_ID]);
    const result = validateRecommendations([REACT_ID], selectedSet);
    expect(result.errors).toStrictEqual([]);
  });
});
