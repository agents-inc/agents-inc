import { describe, it, expect, vi } from "vitest";

import { createMockExtractedSkill } from "../__tests__/factories/skill-factories.js";
import { FRAMEWORK_CATEGORY } from "../__tests__/mock-data/mock-categories.js";
import {
  MERGE_BASIC_MATRIX,
  CONFLICT_MATRIX,
  ALTERNATIVES_MATRIX,
  REQUIRES_MATRIX,
  EMPTY_MATRIX_CONFIG,
  UNRESOLVED_CONFLICT_MATRIX,
  PARTIAL_REQUIRES_ALL_MATRIX,
  PARTIAL_REQUIRES_ANY_MATRIX,
  RESOLVED_REQUIRES_ALL_MATRIX,
  UNREACHABLE_REQUIRES_MATRIX,
  UNRESOLVABLE_SLUG,
} from "../__tests__/mock-data/mock-matrices.js";
import type { MockMatrixConfig } from "../__tests__/factories/matrix-factories.js";
import { firstElement } from "../__tests__/helpers/element-at.js";

vi.mock("../../utils/logger");

import {
  mergeMatrixWithSkills,
  relationshipsForSource,
  synthesizeCategory,
} from "./skill-resolution";
import { verbose, warn } from "../../utils/logger";
import type {
  CategoryPath,
  Category,
  RelationshipDefinitions,
  SkillId,
  SkillSlug,
} from "../../types";

const DUPLICATED_ID: SkillId = "web-framework-react";
const FIRST_SKILL_PATH = "skills/web-framework-react/";
const SECOND_SKILL_PATH = "skills/web-framework-react-copy/";

const COLLIDING_SLUG: SkillSlug = "react";

// Boundary cast: a fixture slug outside the generated SkillSlug union
const CUSTOM_TOOL_SLUG = "custom-tool" as SkillSlug;

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
          displayName: "React",
          description: "React framework",
          author: "@vince",
          category: "web-framework",
          conflictsWith: [],
          requires: [],
          alternatives: [],
          discourages: [],
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

      const react = merged.skills["web-framework-react"];
      expect(react!.requires).toStrictEqual([]);
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
    });
  });

  describe("partial requirements", () => {
    function mergeRequiresFixture(config: MockMatrixConfig) {
      return mergeMatrixWithSkills(config.categories, config.relationships, [
        createMockExtractedSkill("web-state-zustand"),
        createMockExtractedSkill("web-framework-react"),
        createMockExtractedSkill("web-testing-vitest"),
      ]);
    }

    it("drops an all-of requirement when one of the skills it needs is missing", () => {
      const merged = mergeRequiresFixture(PARTIAL_REQUIRES_ALL_MATRIX);

      expect(
        merged.skills["web-state-zustand"]?.requires,
        "an AND over fewer skills than the author wrote is not the author's rule",
      ).toStrictEqual([]);
    });

    it("drops an either-or requirement when one of its alternatives is missing", () => {
      const merged = mergeRequiresFixture(PARTIAL_REQUIRES_ANY_MATRIX);

      expect(
        merged.skills["web-state-zustand"]?.requires,
        "an OR over fewer alternatives than the author wrote rules out selections they allowed",
      ).toStrictEqual([]);
    });

    it("keeps a requirement whose every need resolves", () => {
      const merged = mergeRequiresFixture(RESOLVED_REQUIRES_ALL_MATRIX);

      expect(merged.skills["web-state-zustand"]?.requires).toStrictEqual([
        {
          skillIds: ["web-framework-react", "web-testing-vitest"],
          needsAny: false,
          reason: firstElement(RESOLVED_REQUIRES_ALL_MATRIX.relationships.requires).reason,
        },
      ]);
    });

    it("names the slug that cost the rule", () => {
      mergeRequiresFixture(PARTIAL_REQUIRES_ALL_MATRIX);

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`Unresolved slug '${UNRESOLVABLE_SLUG}'`),
      );
    });
  });

  describe("unresolved slugs", () => {
    it("reports a slug the rules name that no skill carries", () => {
      const merged = mergeMatrixWithSkills(
        UNRESOLVED_CONFLICT_MATRIX.categories,
        UNRESOLVED_CONFLICT_MATRIX.relationships,
        [createMockExtractedSkill("web-framework-react")],
      );

      expect(merged.unresolvedSlugs).toStrictEqual([UNRESOLVABLE_SLUG]);
    });

    it("reports a slug once however many skills the rule naming it reaches", () => {
      const merged = mergeMatrixWithSkills(
        UNRESOLVED_CONFLICT_MATRIX.categories,
        UNRESOLVED_CONFLICT_MATRIX.relationships,
        [
          createMockExtractedSkill("web-framework-react"),
          createMockExtractedSkill("web-testing-vitest"),
        ],
      );

      expect(
        merged.unresolvedSlugs,
        "one typo is one finding, whatever the resolution pass cost to discover it",
      ).toStrictEqual([UNRESOLVABLE_SLUG]);
    });

    it("reports a rule whose own skill is missing along with what it needs", () => {
      const rule = firstElement(UNREACHABLE_REQUIRES_MATRIX.relationships.requires);
      const merged = mergeMatrixWithSkills(
        UNREACHABLE_REQUIRES_MATRIX.categories,
        UNREACHABLE_REQUIRES_MATRIX.relationships,
        [createMockExtractedSkill("web-framework-react")],
      );

      expect(merged.unresolvedSlugs).toStrictEqual([rule.skill, ...rule.needs]);
    });

    it("carries no unresolved slugs when every rule reference resolves", () => {
      const merged = mergeMatrixWithSkills(
        CONFLICT_MATRIX.categories,
        CONFLICT_MATRIX.relationships,
        [
          createMockExtractedSkill("web-framework-react"),
          createMockExtractedSkill("web-framework-vue-composition-api"),
        ],
      );

      expect(merged.unresolvedSlugs).toBeUndefined();
    });
  });

  describe("duplicate identity", () => {
    function mergeTwoSkillsSharingAnId() {
      return mergeMatrixWithSkills(
        EMPTY_MATRIX_CONFIG.categories,
        EMPTY_MATRIX_CONFIG.relationships,
        [
          createMockExtractedSkill(DUPLICATED_ID, {
            path: FIRST_SKILL_PATH,
            slug: COLLIDING_SLUG,
          }),
          createMockExtractedSkill(DUPLICATED_ID, {
            path: SECOND_SKILL_PATH,
            slug: COLLIDING_SLUG,
          }),
        ],
      );
    }

    it("keeps the first of two skills declaring the same id", () => {
      const merged = mergeTwoSkillsSharingAnId();

      expect(
        merged.skills[DUPLICATED_ID]?.path,
        "the second skill declaring an id must not silently overwrite the first",
      ).toBe(FIRST_SKILL_PATH);
    });

    it("names the duplicated id and the ignored location", () => {
      mergeTwoSkillsSharingAnId();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`Duplicate skill id '${DUPLICATED_ID}'`),
      );
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(SECOND_SKILL_PATH));
    });

    it("keeps the first mapping and warns when two skills claim the same slug", () => {
      const merged = mergeMatrixWithSkills(
        EMPTY_MATRIX_CONFIG.categories,
        EMPTY_MATRIX_CONFIG.relationships,
        [
          createMockExtractedSkill("web-framework-react", { slug: COLLIDING_SLUG }),
          createMockExtractedSkill("web-framework-vue-composition-api", {
            slug: COLLIDING_SLUG,
          }),
        ],
      );

      expect(merged.slugMap.slugToId[COLLIDING_SLUG]).toBe("web-framework-react");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`Duplicate slug '${COLLIDING_SLUG}'`),
      );
    });

    it("resolves both skills when two distinct ids share nothing", () => {
      const merged = mergeMatrixWithSkills(
        EMPTY_MATRIX_CONFIG.categories,
        EMPTY_MATRIX_CONFIG.relationships,
        [
          createMockExtractedSkill("web-framework-react"),
          createMockExtractedSkill("web-framework-vue-composition-api"),
        ],
      );

      expect(Object.keys(merged.skills)).toStrictEqual([
        "web-framework-react",
        "web-framework-vue-composition-api",
      ]);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("auto-synthesis", () => {
    it("synthesizes missing categories for skills with unknown category", () => {
      // Boundary cast: intentionally custom category not in built-in union
      const skill = createMockExtractedSkill("web-custom-tool" as SkillId, {
        category: "devops-iac" as CategoryPath,
        domain: "web",
        slug: CUSTOM_TOOL_SLUG,
      });

      const merged = mergeMatrixWithSkills({}, EMPTY_MATRIX_CONFIG.relationships, [skill]);

      // Boundary cast: accessing synthesized custom category key
      const synthesized = merged.categories["devops-iac" as Category];
      expect(synthesized).toStrictEqual(
        expect.objectContaining({
          displayName: "Devops Iac",
          exclusive: false,
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
        slug: CUSTOM_TOOL_SLUG,
      });

      const merged = mergeMatrixWithSkills({}, EMPTY_MATRIX_CONFIG.relationships, [skill]);

      expect(merged.categories["devops-iac" as Category]!.domain).toBe("api");
    });

    it("passes skill domain to synthesized category regardless of prefix", () => {
      const skill = createMockExtractedSkill("web-custom-tool" as SkillId, {
        // Boundary cast: intentionally custom category not in built-in union
        category: "web-custom" as CategoryPath,
        domain: "cli",
        slug: CUSTOM_TOOL_SLUG,
      });

      const merged = mergeMatrixWithSkills({}, EMPTY_MATRIX_CONFIG.relationships, [skill]);

      expect(merged.categories["web-custom" as Category]!.domain).toBe("cli");
    });

    it("synthesized category uses skill domain even for unknown prefixes", () => {
      // Boundary cast: intentionally custom category not in built-in union
      const skill = createMockExtractedSkill("web-custom-tool" as SkillId, {
        category: "devops-iac" as CategoryPath,
        domain: "shared",
        slug: CUSTOM_TOOL_SLUG,
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

// Boundary cast: a slug no skill carries, outside the generated union
const GHOST_SLUG = "ghost-skill" as SkillSlug;
// Boundary cast: a category no definition declares, outside the generated union
const UNDECLARED_CATEGORY = "web-house-rules" as CategoryPath;

const NO_RELATIONSHIPS = { conflicts: [], discourages: [], requires: [], alternatives: [] };

describe("skill-resolution — what a merge says and carries", () => {
  it("names the rule kind and the skill a slug failed to resolve for", () => {
    mergeMatrixWithSkills(
      EMPTY_MATRIX_CONFIG.categories,
      {
        conflicts: [{ skills: ["react", GHOST_SLUG], reason: "r" }],
        discourages: [{ skills: ["react", GHOST_SLUG], reason: "r" }],
        requires: [
          { skill: GHOST_SLUG, needs: ["react"], reason: "r" },
          { skill: "react", needs: [GHOST_SLUG], reason: "r" },
        ],
        alternatives: [{ purpose: "p", skills: ["react", GHOST_SLUG] }],
      },
      [createMockExtractedSkill("web-framework-react")],
    );

    for (const context of [
      "conflicts",
      "discourages",
      "alternatives",
      "requires.skill",
      "requires.needs",
    ]) {
      expect(warn).toHaveBeenCalledWith(
        `Unresolved slug '${GHOST_SLUG}' in web-framework-react ${context} — skipping`,
      );
    }
  });

  it("relates a skill only to the members of groups it is in, each member once", () => {
    const merged = mergeMatrixWithSkills(
      EMPTY_MATRIX_CONFIG.categories,
      {
        ...NO_RELATIONSHIPS,
        conflicts: [
          { skills: ["react", "vue-composition-api"], reason: "first" },
          { skills: ["react", "zustand"], reason: "second" },
          { skills: ["vue-composition-api", "hono"], reason: "not react's" },
        ],
      },
      [
        createMockExtractedSkill("web-framework-react"),
        createMockExtractedSkill("web-framework-vue-composition-api"),
        createMockExtractedSkill("web-state-zustand"),
        createMockExtractedSkill("api-framework-hono"),
      ],
    );

    expect(merged.skills["web-framework-react"]?.conflictsWith).toStrictEqual([
      { skillId: "web-framework-vue-composition-api", reason: "first" },
      { skillId: "web-state-zustand", reason: "second" },
    ]);
  });

  it("keeps an either-or requirement either-or", () => {
    const merged = mergeMatrixWithSkills(
      EMPTY_MATRIX_CONFIG.categories,
      {
        ...NO_RELATIONSHIPS,
        requires: [
          {
            skill: "zustand",
            needs: ["react", "vue-composition-api"],
            needsAny: true,
            reason: "either",
          },
        ],
      },
      [
        createMockExtractedSkill("web-state-zustand"),
        createMockExtractedSkill("web-framework-react"),
        createMockExtractedSkill("web-framework-vue-composition-api"),
      ],
    );

    expect(merged.skills["web-state-zustand"]?.requires).toStrictEqual([
      {
        skillIds: ["web-framework-react", "web-framework-vue-composition-api"],
        needsAny: true,
        reason: "either",
      },
    ]);
  });

  it("carries usage guidance and the custom flag only where the metadata declares them", () => {
    const merged = mergeMatrixWithSkills(EMPTY_MATRIX_CONFIG.categories, NO_RELATIONSHIPS, [
      createMockExtractedSkill("web-framework-react", {
        usageGuidance: "Use when building React UIs.",
        custom: true,
      }),
      createMockExtractedSkill("web-framework-vue-composition-api"),
    ]);

    expect(merged.skills["web-framework-react"]).toMatchObject({
      usageGuidance: "Use when building React UIs.",
      custom: true,
    });
    const vue = merged.skills["web-framework-vue-composition-api"];
    expect(vue).toBeDefined();
    expect(Object.keys(vue ?? {})).not.toContain("usageGuidance");
    expect(Object.keys(vue ?? {})).not.toContain("custom");
  });

  it("warns about a slug two skills share only when the ids differ", () => {
    mergeMatrixWithSkills(EMPTY_MATRIX_CONFIG.categories, NO_RELATIONSHIPS, [
      createMockExtractedSkill(DUPLICATED_ID, { path: FIRST_SKILL_PATH, slug: COLLIDING_SLUG }),
      createMockExtractedSkill(DUPLICATED_ID, { path: SECOND_SKILL_PATH, slug: COLLIDING_SLUG }),
    ]);

    expect(vi.mocked(warn).mock.calls).toStrictEqual([
      [
        `Duplicate skill id '${DUPLICATED_ID}': already resolved from '${FIRST_SKILL_PATH}', ignoring '${SECOND_SKILL_PATH}'`,
      ],
    ]);
  });

  it("files an undeclared category under the first skill's domain and names the one that disagrees", () => {
    const merged = mergeMatrixWithSkills(EMPTY_MATRIX_CONFIG.categories, NO_RELATIONSHIPS, [
      createMockExtractedSkill("web-framework-react", {
        category: UNDECLARED_CATEGORY,
        domain: "web",
      }),
      createMockExtractedSkill("api-framework-hono", {
        category: UNDECLARED_CATEGORY,
        domain: "api",
      }),
    ]);

    expect(
      Object.values(merged.categories).find((category) => category.id === UNDECLARED_CATEGORY)
        ?.domain,
    ).toBe("web");
    expect(warn).toHaveBeenCalledWith(
      `Category '${UNDECLARED_CATEGORY}' has no definition, so its domain was taken from the first skill naming it — 'web-framework-react' (web). 'api-framework-hono' declares 'api' and will be filed under 'web'. Declare the category in the marketplace's own config, or make the two skills agree.`,
    );
    expect(verbose).toHaveBeenCalledWith(
      `Auto-synthesized category '${UNDECLARED_CATEGORY}' for skill 'web-framework-react'`,
    );
  });

  it("says nothing when the skills sharing an undeclared category agree on its domain", () => {
    mergeMatrixWithSkills(EMPTY_MATRIX_CONFIG.categories, NO_RELATIONSHIPS, [
      createMockExtractedSkill("web-framework-react", {
        category: UNDECLARED_CATEGORY,
        domain: "web",
      }),
      createMockExtractedSkill("web-framework-vue-composition-api", {
        category: UNDECLARED_CATEGORY,
        domain: "web",
      }),
    ]);

    expect(warn).not.toHaveBeenCalled();
  });

  it("synthesizes a placeholder definition and says it did", () => {
    expect(synthesizeCategory("web-framework", "web")).toStrictEqual({
      id: "web-framework",
      displayName: "Web Framework",
      description: "Auto-generated category for web-framework",
      domain: "web",
      exclusive: false,
      order: 999,
    });
    expect(verbose).toHaveBeenCalledWith(
      "Category 'web-framework' has no definition in skill-categories.ts — using auto-generated placeholder",
    );
  });
});

describe("relationshipsForSource", () => {
  it("keeps no built-in rule a lone shipped skill would be the only member of", () => {
    expect(relationshipsForSource([createMockExtractedSkill("web-framework-react")])).toStrictEqual(
      NO_RELATIONSHIPS,
    );
  });

  it("drops a built-in requirement whose needs this source ships none of", () => {
    expect(
      relationshipsForSource([createMockExtractedSkill("web-state-zustand")]).requires,
    ).toStrictEqual([]);
  });

  it("narrows a built-in requirement to the needs this source ships", () => {
    const { requires } = relationshipsForSource([
      createMockExtractedSkill("web-state-zustand"),
      createMockExtractedSkill("web-framework-react"),
    ]);

    expect(requires.map(({ skill, needs }) => ({ skill, needs }))).toStrictEqual([
      { skill: "zustand", needs: ["react"] },
    ]);
  });

  it("puts the source's own rules of every kind ahead of the built-ins", () => {
    const own: RelationshipDefinitions = {
      conflicts: [{ skills: [GHOST_SLUG, "react"], reason: "own conflict" }],
      discourages: [{ skills: [GHOST_SLUG, "react"], reason: "own discourage" }],
      requires: [{ skill: GHOST_SLUG, needs: ["react"], reason: "own require" }],
      alternatives: [{ purpose: "own alternative", skills: [GHOST_SLUG, "react"] }],
    };

    const merged = relationshipsForSource([createMockExtractedSkill("web-framework-react")], {
      version: "1.0.0",
      relationships: own,
    });

    expect(merged).toStrictEqual(own);
  });
});
