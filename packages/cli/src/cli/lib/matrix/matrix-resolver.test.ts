import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../../utils/logger");

import { warn } from "../../utils/logger";
import { mergeMatrixWithSkills } from "./skill-resolution.js";
import {
  getCellState,
  hasUnmetRequirements,
  getUnmetRequirementsReason,
  validateSelection,
  validateConflicts,
  validateRequirements,
  validateExclusivity,
  getSkillsByCategory,
  getAvailableSkills,
} from "./matrix-resolver";
import type { CategoryPath, Domain, SkillId, SkillSlug } from "../../types";
import { SKILLS, TEST_CATEGORIES } from "../__tests__/test-fixtures";
import {
  createMockExtractedSkill,
  createMockSkill,
} from "../__tests__/factories/skill-factories.js";
import { buildCategoryMap, createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import { createMockCategory } from "../__tests__/factories/category-factories.js";
import {
  CATALOGUE_WITH_LOCAL_SKILL_MATRIX,
  EMPTY_MATRIX,
  SINGLE_REACT_MATRIX,
  WEB_PAIR_MATRIX,
} from "../__tests__/mock-data/mock-matrices";
import { LOCAL_HOUSE_STYLE_ID } from "../__tests__/mock-data/mock-skills";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { allSkills, initializeMatrix } from "./matrix-provider";
import { firstElement } from "../__tests__/helpers/element-at.js";

const REACT_ID: SkillId = "web-framework-react";
const VUE_ID: SkillId = "web-framework-vue-composition-api";
const ZUSTAND_ID: SkillId = "web-state-zustand";
const HONO_ID: SkillId = "api-framework-hono";

/** A category no shipped `skill-categories.ts` declares, so resolution has to synthesize one. */
const UNDECLARED = "web-nothing-declares-this" as CategoryPath;
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

/**
 * The synthesised half of an unmet-requirements message, with the rule author's `reason` cut off.
 *
 * `getUnmetRequirementsReason` answers `<what is missing> — <why it is needed>`, and the two halves
 * have different owners: the first is computed from the current selection, the second is prose a
 * rule author wrote. Every pin below is about the first, so splitting here keeps them EXACT rather
 * than loosening them to `toContain` — which would pass on a message that had lost the skill names
 * entirely.
 */
const missingHalf = (message: string | undefined): string | undefined => message?.split(" — ")[0];

describe("unknown skill ids", () => {
  it("resolver entry points throw for ids not in the matrix", () => {
    initializeMatrix(EMPTY_MATRIX);
    expect(() => getCellState(UNKNOWN_SKILL_ID, [])).toThrow("Skill not found");
  });
});

describe("the advisory a grid cell carries", () => {
  it("should stay normal for a skill nothing discourages", () => {
    const skill = createMockSkill(REACT_ID);
    const matrix = createMockMatrix(skill);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [])).toStrictEqual({ status: "normal" });
  });

  it("should read as discouraged when a selected skill discourages this one", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      discourages: [{ skillId: REACT_ID, reason: "Prefer the alternative" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [VUE_ID]).status).toBe("discouraged");
  });

  it("should read as discouraged when this skill discourages a selected one", () => {
    const skillA = createMockSkill(REACT_ID, {
      discourages: [{ skillId: VUE_ID, reason: "Prefer the alternative" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [VUE_ID]).status).toBe("discouraged");
  });

  it("should read as incompatible rather than discouraged when this skill conflicts with a selected one", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason: "Incompatible" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [VUE_ID]).status).toBe("incompatible");
  });

  it("should read as incompatible rather than discouraged when a selected skill conflicts with this one", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      conflictsWith: [{ skillId: REACT_ID, reason: "Incompatible" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [VUE_ID]).status).toBe("incompatible");
  });

  it("should stay normal for an unmet requirement, which the grid reports separately", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID, ZUSTAND_ID], needsAny: false, reason: "Needs both" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID);
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [VUE_ID]).status).toBe("normal");
    expect(hasUnmetRequirements(REACT_ID, [VUE_ID])).toBe(true);
  });

  it("should stay normal when every required skill is selected (AND logic)", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID, ZUSTAND_ID], needsAny: false, reason: "Needs both" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID);
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [VUE_ID, ZUSTAND_ID]).status).toBe("normal");
  });

  it("should report an unmet requirement when none of the options are selected (OR logic)", () => {
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

  it("should stay normal when any one required option is selected (OR logic)", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID, ZUSTAND_ID], needsAny: true, reason: "Needs one" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID);
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [ZUSTAND_ID]).status).toBe("normal");
  });
});

describe("the reason a grid cell carries with its advisory", () => {
  it("should carry the declared reason for a discouraged skill", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      discourages: [{ skillId: REACT_ID, reason: "Awkward pairing" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [VUE_ID])).toStrictEqual({
      status: "discouraged",
      reason: "Awkward pairing",
    });
  });

  it("should name the conflicting skill rather than a discourage reason for a conflict", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason: "Incompatible architectures" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [VUE_ID])).toStrictEqual({
      status: "incompatible",
      reason: "conflicts with Vue Composition Api",
    });
  });

  it("should leave an unmet requirement to its own explanation rather than the cell advisory", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Framework required" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    expect(getCellState(REACT_ID, [])).toStrictEqual({ status: "normal" });

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
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(firstElement(result.errors).type).toBe("conflict");
  });

  it("should return error for missing requirements", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs B" }],
    });
    const skillB = createMockSkill(VUE_ID);
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    const result = validateSelection([REACT_ID]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "missingRequirement")).toBe(true);
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
    expect(result.valid).toBe(false);
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

  describe("an empty selection", () => {
    it("should leave a skill with no relationships plain", () => {
      const skill = createMockSkill(REACT_ID);
      const matrix = createMockMatrix(skill);
      initializeMatrix(matrix);

      expect(getCellState(REACT_ID, [])).toStrictEqual({ status: "normal" });
    });

    it("should not rule out a skill with unmet requirements (requirements are separate)", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs B" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      expect(getCellState(REACT_ID, []).status).toBe("normal");
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

  describe("a declared discourages rule with nothing selected", () => {
    it("should discourage nothing until the other side of the rule is selected", () => {
      const skillA = createMockSkill(REACT_ID);
      const skillB = createMockSkill(VUE_ID, {
        discourages: [{ skillId: REACT_ID, reason: "Prefer the alternative" }],
      });
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      expect(getCellState(REACT_ID, [])).toStrictEqual({ status: "normal" });
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

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(firstElement(result.errors).type).toBe("conflict");
      expect(firstElement(result.errors).message).toContain(
        "React conflicts with Vue Composition Api",
      );
      expect(firstElement(result.errors).message).toContain("These cannot work together");
      expect(firstElement(result.errors).skills).toContain(REACT_ID);
      expect(firstElement(result.errors).skills).toContain(VUE_ID);
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

      expect(result.valid).toBe(false);
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

      expect(result.valid).toBe(false);
      expect(firstElement(result.errors).type).toBe("conflict");
    });

    it("documents: validateSelection depends on conflict declaration order", () => {
      // NOTE: validateSelection only checks skillA.conflictsWith where skillA
      // comes BEFORE the conflicting skill in the selection array.
      // This is a limitation — the primary protection is getCellState() which
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

  describe("a cell whose conflicting skill is selected", () => {
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

    it("should be marked incompatible", () => {
      expect(getCellState(REACT_ID, [VUE_ID]).status).toBe("incompatible");
    });

    it("should name the skill it conflicts with", () => {
      expect(getCellState(REACT_ID, [VUE_ID])).toStrictEqual({
        status: "incompatible",
        reason: "conflicts with Vue Composition Api",
      });
    });
  });
});

describe("an undeclared category two skills disagree about", () => {
  // The domain is taken from whichever skill the glob reached FIRST, and a directory walk's order
  // is nobody's decision. Two skills sharing an undeclared category while declaring different
  // domains file the second under a domain its own metadata contradicts, and it feeds six product
  // readers of `getCategoryDomain`.
  //
  // The WARNING is asserted and never the resulting domain: pinning the domain pins glob order, so
  // an unrelated reordering of the fixture would redden a test about something else entirely.
  //
  // Driven through `mergeMatrixWithSkills`, which is where the synthesis happens —
  // `createMockMatrix` hands back a matrix that is already built and never reaches it.
  function mergeSkillsDeclaring(...domains: readonly Domain[]): void {
    vi.mocked(warn).mockClear();

    mergeMatrixWithSkills(
      {},
      { conflicts: [], discourages: [], requires: [], alternatives: [] },
      domains.map((domain, index) =>
        createMockExtractedSkill(`${UNDECLARED}-${index}` as SkillId, {
          category: UNDECLARED,
          domain,
          slug: `undeclared-${index}` as SkillSlug,
        }),
      ),
    );
  }

  function whatItSaid(): string {
    return vi
      .mocked(warn)
      .mock.calls.map(([message]) => String(message))
      .join("\n");
  }

  it("warns, naming the category and both skills", () => {
    mergeSkillsDeclaring("web", "api");

    expect(whatItSaid()).toContain(UNDECLARED);
    expect(whatItSaid()).toContain(`${UNDECLARED}-0`);
    expect(whatItSaid()).toContain(`${UNDECLARED}-1`);
  });

  // The control. Without it the assertion above is satisfied by a build that warns on every
  // synthesized category, which buries the disagreement in noise rather than reporting it.
  it("stays silent when the two agree", () => {
    mergeSkillsDeclaring("web", "web");

    expect(whatItSaid()).not.toContain(UNDECLARED);
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

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(firstElement(result.errors).type).toBe("missingRequirement");
      expect(firstElement(result.errors).skills).toContain(REACT_ID);
      expect(firstElement(result.errors).skills).toContain(VUE_ID);
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

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(firstElement(result.errors).type).toBe("missingRequirement");
      // Should include both missing dependencies
      expect(firstElement(result.errors).skills).toContain(VUE_ID);
      expect(firstElement(result.errors).skills).toContain(ZUSTAND_ID);
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

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(firstElement(result.errors).type).toBe("missingRequirement");
      expect(firstElement(result.errors).message).toContain("one of");
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

      expect(result.valid).toBe(false);
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

      expect(firstElement(result.errors).skills).toStrictEqual([REACT_ID, VUE_ID]);
    });

    it("should include skill display name in error message", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs B" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      const result = validateSelection([REACT_ID]);

      expect(firstElement(result.errors).message).toContain("React");
      expect(firstElement(result.errors).message).toContain("Vue Composition Api");
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

      expect(firstElement(result.errors).message).toContain("Vue Composition Api");
      expect(firstElement(result.errors).message).toContain("Zustand");
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

    it("should leave the cell advisory alone (requirements are separate from conflicts)", () => {
      const skillA = createMockSkill(REACT_ID, {
        requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "Needs framework" }],
      });
      const skillB = createMockSkill(VUE_ID);
      const matrix = createMockMatrix(skillA, skillB);
      initializeMatrix(matrix);

      expect(getCellState(REACT_ID, []).status).toBe("normal");
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

    // `reason` is REQUIRED by `requireRuleSchema` and `default-rules.test.ts` enforces that every
    // built-in rule carries one, so every marketplace author is compelled to write it. Nothing read
    // it until 2026-08-23. Both siblings render theirs — `discourages[].reason` in the grid,
    // `conflicts[].reason` through `reportValidationErrors`.
    it("carries the rule author's own reason beside the synthesised one", () => {
      initializeMatrix(
        createMockMatrix(
          createMockSkill(REACT_ID, {
            requires: [
              { skillIds: [VUE_ID], needsAny: false, reason: "the router is built on it" },
            ],
          }),
          createMockSkill(VUE_ID),
        ),
      );

      expect(getUnmetRequirementsReason(REACT_ID, [])).toBe(
        "requires Vue Composition Api — the router is built on it",
      );
    });

    it("omits the separator for a rule whose reason is empty", () => {
      initializeMatrix(
        createMockMatrix(
          createMockSkill(REACT_ID, {
            requires: [{ skillIds: [VUE_ID], needsAny: false, reason: "" }],
          }),
          createMockSkill(VUE_ID),
        ),
      );

      expect(getUnmetRequirementsReason(REACT_ID, [])).toBe("requires Vue Composition Api");
    });

    // The cell WRAPS rather than elides, so an unbounded reason grows the tag, grows the frame and
    // pushes the top of the wizard off the terminal. The shipped catalogue's longest reason is 242
    // characters and its React Router entry alone cost four lines before this budget existed.
    it("clips a reason too long for the cell, keeping the synthesised half whole", () => {
      const longReason = "x".repeat(200);
      initializeMatrix(
        createMockMatrix(
          createMockSkill(REACT_ID, {
            requires: [{ skillIds: [VUE_ID], needsAny: false, reason: longReason }],
          }),
          createMockSkill(VUE_ID),
        ),
      );

      const said = getUnmetRequirementsReason(REACT_ID, []) ?? "";

      expect(said).toContain("requires Vue Composition Api — ");
      expect(said).not.toContain(longReason);
      expect(said.endsWith("\u2026")).toBe(true);
      expect(said.length).toBeLessThan("requires Vue Composition Api — ".length + 70);
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

    it("should carry no cell advisory for an unmet requirement (requirements are separate)", () => {
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

      expect(getCellState(REACT_ID, [])).toStrictEqual({ status: "normal" });
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

      expect(result.valid).toBe(false);
      expect(firstElement(result.errors).type).toBe("missingRequirement");
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

/**
 * The grid never asks who would break if a skill were dropped — it re-reads the
 * selection it is left with, and a skill whose requirement is no longer met is
 * dimmed and annotated with what it still needs. So the three arms that answer
 * differently after a removal are stated as the selections a removal produces.
 */
describe("a skill left behind by a removal", () => {
  it("should report the requirement as unmet once the skill it named is gone", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      requires: [{ skillIds: [REACT_ID], needsAny: false, reason: "Needs A" }],
    });
    const matrix = createMockMatrix(skillA, skillB);
    initializeMatrix(matrix);

    expect(hasUnmetRequirements(VUE_ID, [REACT_ID, VUE_ID])).toBe(false);
    expect(hasUnmetRequirements(VUE_ID, [VUE_ID])).toBe(true);
    expect(getUnmetRequirementsReason(VUE_ID, [VUE_ID])).toContain("React");
  });

  it("should report an OR requirement as unmet once its sole satisfier is gone", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID, {
      requires: [{ skillIds: [REACT_ID, VUE_ID], needsAny: true, reason: "Needs one" }],
    });
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    expect(hasUnmetRequirements(ZUSTAND_ID, [ZUSTAND_ID])).toBe(true);
  });

  it("should leave an OR requirement met while another satisfier survives the removal", () => {
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID);
    const skillC = createMockSkill(ZUSTAND_ID, {
      requires: [{ skillIds: [REACT_ID, VUE_ID], needsAny: true, reason: "Needs one" }],
    });
    const matrix = createMockMatrix(skillA, skillB, skillC);
    initializeMatrix(matrix);

    expect(hasUnmetRequirements(ZUSTAND_ID, [VUE_ID, ZUSTAND_ID])).toBe(false);
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
        // Boundary casts: generated IDs and slugs for a volume test, outside both unions
        return [
          id,
          createMockSkill(id, { category: "api-performance", slug: `perf-skill${i}` as SkillSlug }),
        ];
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

  it("should answer only the fields the build grid reads", () => {
    const skillA = createMockSkill(REACT_ID, {
      category: "web-framework",
      alternatives: [
        { skillId: VUE_ID, purpose: "Alternative framework" },
        { skillId: ZUSTAND_ID, purpose: "Another alternative" },
      ],
      discourages: [{ skillId: VUE_ID, reason: "Awkward pairing" }],
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

    const result = getAvailableSkills("web-framework", [REACT_ID]);

    // The whole option, not a field of it: an advisory this function computes and
    // no screen reads is the defect these keys' absence pins.
    expect(result.find((o) => o.id === VUE_ID)).toStrictEqual({
      id: VUE_ID,
      selected: false,
      hasUnmetRequirements: false,
    });
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

  it("should carry the author's own words when a selected skill discourages this one", () => {
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

    expect(getCellState(VUE_ID, [REACT_ID])).toStrictEqual({
      status: "discouraged",
      reason: "Not ideal pairing",
    });
  });

  it("should prefer the conflict over a discourage rule naming the same pair", () => {
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

    expect(getCellState(VUE_ID, [REACT_ID])).toStrictEqual({
      status: "incompatible",
      reason: "conflicts with React",
    });
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
    expect(result.valid).toBe(false);
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
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.type === "conflict")).toBe(true);
    // Also reports missing requirement for C
    expect(result.errors.some((e) => e.type === "missingRequirement")).toBe(true);
  });
});

describe("validateConflicts", () => {
  it("should return no errors for empty selections", () => {
    initializeMatrix(EMPTY_MATRIX);

    const errors = validateConflicts([]);
    expect(errors).toStrictEqual([]);
  });

  it("should return no errors for a single skill", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    const errors = validateConflicts([REACT_ID]);
    expect(errors).toStrictEqual([]);
  });

  it("should return no errors when skills do not conflict", () => {
    initializeMatrix(WEB_PAIR_MATRIX);

    const errors = validateConflicts([REACT_ID, ZUSTAND_ID]);
    expect(errors).toStrictEqual([]);
  });

  it("should detect conflict declared on first skill against second", () => {
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason: "Choose one framework" }],
    });
    const skillB = createMockSkill(VUE_ID);
    initializeMatrix(createMockMatrix(skillA, skillB));

    const errors = validateConflicts([REACT_ID, VUE_ID]);
    expect(errors).toHaveLength(1);
    expect(firstElement(errors).type).toBe("conflict");
    expect(firstElement(errors).skills).toStrictEqual([REACT_ID, VUE_ID]);
  });

  it("should not detect conflict when declaration is only on second skill (order-dependent)", () => {
    // validateConflicts only checks skillA.conflictsWith for skillB where i < j
    // If the conflict is declared on B against A, and A comes first, it won't find it
    const skillA = createMockSkill(REACT_ID);
    const skillB = createMockSkill(VUE_ID, {
      conflictsWith: [{ skillId: REACT_ID, reason: "Choose one framework" }],
    });
    initializeMatrix(createMockMatrix(skillA, skillB));

    const errors = validateConflicts([REACT_ID, VUE_ID]);
    // B declares conflict with A, but since A (index 0) is checked first against B (index 1),
    // and A has no conflicts, nothing is found. Then B is never the "outer" loop skill
    // because j starts at i+1, so B's conflicts are not checked.
    expect(errors).toHaveLength(0);
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

    const errors = validateConflicts([REACT_ID, VUE_ID, ZUSTAND_ID]);
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.type === "conflict")).toBe(true);
  });

  it("should skip skills not found in the matrix gracefully", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    // VUE_ID is not in the matrix — should not throw, just skip
    const errors = validateConflicts([REACT_ID, VUE_ID]);
    expect(errors).toStrictEqual([]);
  });

  it("should include conflict reason in error message", () => {
    const reason = "Only one framework per project";
    const skillA = createMockSkill(REACT_ID, {
      conflictsWith: [{ skillId: VUE_ID, reason }],
    });
    const skillB = createMockSkill(VUE_ID);
    initializeMatrix(createMockMatrix(skillA, skillB));

    const errors = validateConflicts([REACT_ID, VUE_ID]);
    expect(firstElement(errors).message).toContain(reason);
  });
});

describe("validateRequirements", () => {
  it("should return no errors for empty selections", () => {
    initializeMatrix(EMPTY_MATRIX);

    const errors = validateRequirements([], new Set());
    expect(errors).toStrictEqual([]);
  });

  it("should return no errors for skill with no requirements", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    const errors = validateRequirements([REACT_ID], new Set([REACT_ID]));
    expect(errors).toStrictEqual([]);
  });

  it("should return error when AND requirement is not satisfied", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID], needsAny: false, reason: "Needs state" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    initializeMatrix(createMockMatrix(skillA, skillC));

    const errors = validateRequirements([REACT_ID], new Set([REACT_ID]));
    expect(errors).toHaveLength(1);
    expect(firstElement(errors).type).toBe("missingRequirement");
    expect(firstElement(errors).skills).toContain(REACT_ID);
    expect(firstElement(errors).skills).toContain(ZUSTAND_ID);
  });

  it("should return no error when AND requirement is fully satisfied", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID], needsAny: false, reason: "Needs state" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    initializeMatrix(createMockMatrix(skillA, skillC));

    const selectedSet = new Set<SkillId>([REACT_ID, ZUSTAND_ID]);
    const errors = validateRequirements([REACT_ID, ZUSTAND_ID], selectedSet);
    expect(errors).toStrictEqual([]);
  });

  it("should return error listing all missing skills for multi-skill AND requirement", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID, HONO_ID], needsAny: false, reason: "Needs both" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    const skillD = createMockSkill(HONO_ID);
    initializeMatrix(createMockMatrix(skillA, skillC, skillD));

    const errors = validateRequirements([REACT_ID], new Set([REACT_ID]));
    expect(errors).toHaveLength(1);
    // Should include both missing IDs
    expect(firstElement(errors).skills).toContain(ZUSTAND_ID);
    expect(firstElement(errors).skills).toContain(HONO_ID);
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
    const errors = validateRequirements([REACT_ID, ZUSTAND_ID], selectedSet);
    expect(errors).toHaveLength(1);
    expect(firstElement(errors).skills).toContain(HONO_ID);
    expect(firstElement(errors).skills).not.toContain(ZUSTAND_ID);
  });

  it("should return error when OR requirement has no satisfying skill selected", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID, HONO_ID], needsAny: true, reason: "Needs one of these" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    const skillD = createMockSkill(HONO_ID);
    initializeMatrix(createMockMatrix(skillA, skillC, skillD));

    const errors = validateRequirements([REACT_ID], new Set([REACT_ID]));
    expect(errors).toHaveLength(1);
    expect(firstElement(errors).type).toBe("missingRequirement");
  });

  it("should return no error when OR requirement has at least one satisfying skill", () => {
    const skillA = createMockSkill(REACT_ID, {
      requires: [{ skillIds: [ZUSTAND_ID, HONO_ID], needsAny: true, reason: "Needs one of these" }],
    });
    const skillC = createMockSkill(ZUSTAND_ID);
    const skillD = createMockSkill(HONO_ID);
    initializeMatrix(createMockMatrix(skillA, skillC, skillD));

    const selectedSet = new Set<SkillId>([REACT_ID, HONO_ID]);
    const errors = validateRequirements([REACT_ID, HONO_ID], selectedSet);
    expect(errors).toStrictEqual([]);
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
    const errors = validateRequirements([REACT_ID, VUE_ID], selectedSet);
    expect(errors).toHaveLength(2);
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

    const errors = validateRequirements([REACT_ID], new Set([REACT_ID]));
    // Two separate requirement groups, both unmet
    expect(errors).toHaveLength(2);
  });

  it("should skip skills not found in the matrix", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    // VUE_ID is not in the matrix — should not throw
    const errors = validateRequirements([VUE_ID], new Set([VUE_ID]));
    expect(errors).toStrictEqual([]);
  });
});

describe("validateExclusivity", () => {
  it("should return no errors for empty selections", () => {
    initializeMatrix(EMPTY_MATRIX);

    const errors = validateExclusivity([]);
    expect(errors).toStrictEqual([]);
  });

  it("should return no errors for single skill in exclusive category", () => {
    const matrix = createMockMatrix(SKILLS.react, {
      categories: EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const errors = validateExclusivity([REACT_ID]);
    expect(errors).toStrictEqual([]);
  });

  it("should return error for multiple skills in exclusive category", () => {
    const skillA = createMockSkill(REACT_ID, { category: "web-framework" });
    const skillB = createMockSkill(VUE_ID, { category: "web-framework" });
    const matrix = createMockMatrix(skillA, skillB, {
      categories: EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const errors = validateExclusivity([REACT_ID, VUE_ID]);
    expect(errors).toHaveLength(1);
    expect(firstElement(errors).type).toBe("categoryExclusive");
    expect(firstElement(errors).skills).toContain(REACT_ID);
    expect(firstElement(errors).skills).toContain(VUE_ID);
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

    const errors = validateExclusivity([REACT_ID, VUE_ID]);
    expect(errors).toStrictEqual([]);
  });

  it("should skip the 'local' pseudo-category even with multiple skills", () => {
    const skillA = createMockSkill(REACT_ID, { category: "local" as CategoryPath });
    const skillB = createMockSkill(VUE_ID, { category: "local" as CategoryPath });
    initializeMatrix(createMockMatrix(skillA, skillB));

    const errors = validateExclusivity([REACT_ID, VUE_ID]);
    expect(errors).toStrictEqual([]);
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

    const errors = validateExclusivity([REACT_ID, VUE_ID, ZUSTAND_ID, HONO_ID]);
    // Only framework is exclusive, so only one error
    expect(errors).toHaveLength(1);
    expect(firstElement(errors).type).toBe("categoryExclusive");
    expect(firstElement(errors).message).toContain("Framework");
  });

  it("should skip skills not found in the matrix", () => {
    initializeMatrix(SINGLE_REACT_MATRIX);

    // VUE_ID not in matrix — should not throw
    const errors = validateExclusivity([REACT_ID, VUE_ID]);
    expect(errors).toStrictEqual([]);
  });

  it("should detect exclusivity violation with 3+ skills in same category", () => {
    const skillA = createMockSkill(REACT_ID, { category: "web-framework" });
    const skillB = createMockSkill(VUE_ID, { category: "web-framework" });
    const skillC = createMockSkill(ZUSTAND_ID, { category: "web-framework" });
    const matrix = createMockMatrix(skillA, skillB, skillC, {
      categories: EXCLUSIVE_FRAMEWORK_CATEGORIES,
    });
    initializeMatrix(matrix);

    const errors = validateExclusivity([REACT_ID, VUE_ID, ZUSTAND_ID]);
    expect(errors).toHaveLength(1);
    expect(firstElement(errors).skills).toHaveLength(3);
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

    const errors = validateExclusivity([REACT_ID, VUE_ID]);
    expect(firstElement(errors).message).toContain("Framework");
  });
});

describe("mobile and desktop framework fences", () => {
  // The real catalogue, because the subject is which rules the shipped
  // relationships declare — a mock matrix can only carry the rules somebody
  // wrote into it, so it would pin the fixture rather than the fence.
  const NATIVEWIND_ID: SkillId = "mobile-styling-nativewind";
  const DETOX_ID: SkillId = "mobile-testing-detox";
  const MAESTRO_ID: SkillId = "mobile-testing-maestro";
  const EXPO_ID: SkillId = "mobile-framework-expo";
  const ELECTRON_IPC_ID: SkillId = "desktop-ipc-electron";
  const ELECTRON_ID: SkillId = "desktop-framework-electron";
  const TAURI_MOBILE_ID: SkillId = "desktop-mobile-tauri";

  beforeEach(() => {
    initializeMatrix(BUILT_IN_MATRIX);
  });

  it("reports a mobile skill picked without either mobile framework as unmet", () => {
    expect(hasUnmetRequirements(NATIVEWIND_ID, [NATIVEWIND_ID])).toBe(true);
    expect(missingHalf(getUnmetRequirementsReason(NATIVEWIND_ID, [NATIVEWIND_ID]))).toBe(
      "requires React Native or Expo",
    );
  });

  it("clears the mobile fence once either framework joins the selection", () => {
    expect(hasUnmetRequirements(NATIVEWIND_ID, [NATIVEWIND_ID, EXPO_ID])).toBe(false);
  });

  it("counts Tauri's mobile target on its own as an app for Maestro to drive", () => {
    expect(missingHalf(getUnmetRequirementsReason(MAESTRO_ID, [MAESTRO_ID]))).toBe(
      "requires React Native, Expo or Tauri Mobile",
    );
    expect(hasUnmetRequirements(MAESTRO_ID, [MAESTRO_ID, TAURI_MOBILE_ID])).toBe(false);
  });

  it("fences a desktop skill to the framework whose APIs it teaches", () => {
    expect(missingHalf(getUnmetRequirementsReason(ELECTRON_IPC_ID, [ELECTRON_IPC_ID]))).toBe(
      "requires Electron",
    );
    expect(hasUnmetRequirements(ELECTRON_IPC_ID, [ELECTRON_IPC_ID, ELECTRON_ID])).toBe(false);
  });

  it("lets the two mobile E2E runners be selected together, since they layer", () => {
    expect(validateExclusivity([DETOX_ID, MAESTRO_ID])).toStrictEqual([]);
  });
});

describe("api and cross-cutting skill fences", () => {
  // The real catalogue, for the same reason the mobile and desktop block above
  // uses it: the subject is which rules the shipped relationships declare.
  const MERCURIUS_ID: SkillId = "api-graphql-mercurius";
  const FASTIFY_ID: SkillId = "api-framework-fastify";
  const NEXTAUTH_ID: SkillId = "api-auth-nextauth";
  const NEXTJS_ID: SkillId = "web-meta-framework-nextjs";
  const BULLMQ_ID: SkillId = "api-queue-bullmq";
  const REDIS_ID: SkillId = "api-database-redis";
  const UPSTASH_ID: SkillId = "api-database-upstash";
  const VERCEL_KV_ID: SkillId = "api-database-vercel-kv";
  const BETTER_AUTH_ID: SkillId = "api-auth-better-auth-drizzle-hono";
  const DRIZZLE_ID: SkillId = "api-database-drizzle";
  const COMPOSABLE_COMPONENTS_ID: SkillId = "meta-design-composable-components";
  const WEB_REVIEWING_ID: SkillId = "meta-reviewing-web-reviewing";

  beforeEach(() => {
    initializeMatrix(BUILT_IN_MATRIX);
  });

  it("fences Mercurius to Fastify, the server it registers as a plugin on", () => {
    expect(missingHalf(getUnmetRequirementsReason(MERCURIUS_ID, [MERCURIUS_ID]))).toBe(
      "requires Fastify",
    );
    expect(hasUnmetRequirements(MERCURIUS_ID, [MERCURIUS_ID, HONO_ID])).toBe(true);
    expect(hasUnmetRequirements(MERCURIUS_ID, [MERCURIUS_ID, FASTIFY_ID])).toBe(false);
  });

  it("fences Auth.js to the Next.js surface the skill teaches", () => {
    expect(missingHalf(getUnmetRequirementsReason(NEXTAUTH_ID, [NEXTAUTH_ID]))).toBe(
      "requires Next.js",
    );
    expect(hasUnmetRequirements(NEXTAUTH_ID, [NEXTAUTH_ID, NEXTJS_ID])).toBe(false);
  });

  it("accepts either Redis-compatible server for BullMQ, and neither of them alone is Vercel KV", () => {
    expect(missingHalf(getUnmetRequirementsReason(BULLMQ_ID, [BULLMQ_ID]))).toBe(
      "requires Redis or Upstash",
    );
    expect(hasUnmetRequirements(BULLMQ_ID, [BULLMQ_ID, UPSTASH_ID])).toBe(false);
    expect(hasUnmetRequirements(BULLMQ_ID, [BULLMQ_ID, REDIS_ID])).toBe(false);
    expect(hasUnmetRequirements(BULLMQ_ID, [BULLMQ_ID, VERCEL_KV_ID])).toBe(true);
  });

  it("requires both halves of what the Better Auth skill teaches, not either one", () => {
    expect(missingHalf(getUnmetRequirementsReason(BETTER_AUTH_ID, [BETTER_AUTH_ID]))).toBe(
      "requires Drizzle and Hono",
    );
    expect(
      missingHalf(getUnmetRequirementsReason(BETTER_AUTH_ID, [BETTER_AUTH_ID, DRIZZLE_ID])),
    ).toBe("requires Hono");
    expect(missingHalf(getUnmetRequirementsReason(BETTER_AUTH_ID, [BETTER_AUTH_ID, HONO_ID]))).toBe(
      "requires Drizzle",
    );
    expect(hasUnmetRequirements(BETTER_AUTH_ID, [BETTER_AUTH_ID, DRIZZLE_ID, HONO_ID])).toBe(false);
  });

  it("binds the two React-surfaced cross-cutting skills to React", () => {
    expect(
      missingHalf(getUnmetRequirementsReason(COMPOSABLE_COMPONENTS_ID, [COMPOSABLE_COMPONENTS_ID])),
    ).toBe("requires React");
    expect(
      hasUnmetRequirements(COMPOSABLE_COMPONENTS_ID, [COMPOSABLE_COMPONENTS_ID, REACT_ID]),
    ).toBe(false);

    expect(missingHalf(getUnmetRequirementsReason(WEB_REVIEWING_ID, [WEB_REVIEWING_ID]))).toBe(
      "requires React",
    );
    expect(hasUnmetRequirements(WEB_REVIEWING_ID, [WEB_REVIEWING_ID, REACT_ID])).toBe(false);
  });
});

describe("the merged API framework category", () => {
  beforeEach(() => {
    initializeMatrix(BUILT_IN_MATRIX);
  });

  it("resolves Elysia in the same category as the four frameworks it competes with", () => {
    expect(idsIn("api-api")).toStrictEqual([
      "api-framework-elysia",
      "api-framework-express",
      "api-framework-fastify",
      "api-framework-hono",
      "api-framework-nestjs",
    ]);
  });

  it("no longer defines the duplicate category Elysia used to sit in", () => {
    expect("api-framework" in BUILT_IN_MATRIX.categories).toBe(false);
  });
});

/** Category membership, ordered so the assertion does not pin readdir order. */
const idsIn = (category: CategoryPath): string[] =>
  getSkillsByCategory(category)
    .map((skill) => skill.id)
    .sort();

/**
 * Every skill the resolver reports incompatible against a selection, over
 * whatever catalogue is currently loaded.
 */
const incompatibleAgainst = (selection: SkillId[]): SkillId[] =>
  allSkills()
    .map((skill) => skill.id)
    .filter((skillId) => getCellState(skillId, selection).status === "incompatible");

describe("a selection that excludes nothing", () => {
  const SHADCN_ID: SkillId = "web-ui-shadcn-ui";

  // The real catalogue: the subject is what the shipped relationships rule
  // out, and every one of these answers was a whitelist verdict until the
  // 2026-08-07 ruling deleted `compatibleWith`.
  beforeEach(() => {
    initializeMatrix(BUILT_IN_MATRIX);
  });

  it("rules nothing out for a universal skill that conflicts with no framework", () => {
    expect(incompatibleAgainst([TAILWIND_ID])).toStrictEqual([]);
  });

  it("never judges a skill against itself", () => {
    expect(getCellState(SHADCN_ID, [SHADCN_ID]).status).not.toBe("incompatible");
    expect(incompatibleAgainst([SHADCN_ID])).toStrictEqual([]);
  });

  it("rules nothing out for a selection the catalogue declares nothing about", () => {
    initializeMatrix(CATALOGUE_WITH_LOCAL_SKILL_MATRIX);

    expect(incompatibleAgainst([LOCAL_HOUSE_STYLE_ID])).toStrictEqual([]);
  });
});

describe("the split shared categories", () => {
  const TURBOREPO_ID: SkillId = "shared-monorepo-turborepo";
  const NX_ID: SkillId = "shared-monorepo-nx";
  const PNPM_WORKSPACES_ID: SkillId = "shared-monorepo-pnpm-workspaces";
  const BIOME_ID: SkillId = "shared-tooling-biome";
  const ESLINT_PRETTIER_ID: SkillId = "shared-tooling-eslint-prettier";

  beforeEach(() => {
    initializeMatrix(BUILT_IN_MATRIX);
  });

  it("groups the two task runners on their own, leaving the workspace manager behind", () => {
    expect(idsIn("shared-task-runner")).toStrictEqual([
      "shared-monorepo-nx",
      "shared-monorepo-turborepo",
    ]);
    expect(idsIn("shared-monorepo")).toStrictEqual(["shared-monorepo-pnpm-workspaces"]);
  });

  it("groups the two lint-and-format tools on their own, leaving the rest of the tooling behind", () => {
    expect(idsIn("shared-lint")).toStrictEqual([
      "shared-tooling-biome",
      "shared-tooling-eslint-prettier",
    ]);
    expect(idsIn("shared-tooling")).toStrictEqual([
      "meta-config-stack-detect",
      "shared-tooling-changesets",
      "shared-tooling-git-hooks",
      "shared-tooling-typescript-config",
    ]);
  });

  it("makes each new category a pick-one, so the radio carries the fence", () => {
    expect(BUILT_IN_MATRIX.categories["shared-task-runner"]?.exclusive).toBe(true);
    expect(BUILT_IN_MATRIX.categories["shared-lint"]?.exclusive).toBe(true);
  });

  it("reports a category error for either co-selected pair", () => {
    expect(validateExclusivity([TURBOREPO_ID, NX_ID])).toStrictEqual([
      {
        type: "categoryExclusive",
        message:
          'Category "Task Runner" only allows one selection, but multiple selected: Turborepo, Nx',
        skills: [TURBOREPO_ID, NX_ID],
      },
    ]);
    expect(validateExclusivity([BIOME_ID, ESLINT_PRETTIER_ID])).toStrictEqual([
      {
        type: "categoryExclusive",
        message:
          'Category "Lint & Format" only allows one selection, but multiple selected: Biome, ESLint & Prettier',
        skills: [BIOME_ID, ESLINT_PRETTIER_ID],
      },
    ]);
  });

  it("keeps pnpm workspaces composable with either task runner", () => {
    expect(validateSelection([PNPM_WORKSPACES_ID, TURBOREPO_ID]).errors).toStrictEqual([]);
    expect(validateSelection([PNPM_WORKSPACES_ID, NX_ID]).errors).toStrictEqual([]);
  });
});
