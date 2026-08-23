import { describe, it, expect } from "vitest";
import { validateBuildStep, buildCategoriesForDomain } from "./build-step-logic";
import {
  BUILD_STEP_ADVISORY_STATES_MATRIX,
  BUILD_STEP_CONFLICTS_EXCLUSIVE_MATRIX,
  BUILD_STEP_CONFLICTS_NON_EXCLUSIVE_MATRIX,
  BUILD_STEP_DISPLAY_NAME_MATRIX,
  BUILD_STEP_EMPTY_FRAMEWORK_MATRIX,
  BUILD_STEP_FRAMEWORK_API_MATRIX,
  BUILD_STEP_FRAMEWORK_NON_EXCLUSIVE_MATRIX,
  BUILD_STEP_FRAMEWORK_ONLY_MATRIX,
  BUILD_STEP_LOCAL_SKILL_MATRIX,
  BUILD_STEP_NON_LOCAL_MATRIX,
  BUILD_STEP_REQUIRES_MATRIX,
  BUILD_STEP_SORTING_MATRIX,
  BUILD_STEP_WEB_MATRIX,
} from "../__tests__/mock-data/mock-matrices";
import type { CategoryRow } from "../../components/wizard/category-grid";
import { DOMAIN_ORDER } from "@workspace/matrix";
import type { SkillId, Category, Domain } from "../../types";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { getSkillById, initializeMatrix } from "../matrix/matrix-provider";
import { EXPECTED_SKILLS } from "../__tests__/expected-values";
import { buildSkillConfigs } from "../__tests__/helpers";
import { SKILLS } from "../__tests__/test-fixtures";
import { buildCategoryMap, createMockMatrix } from "../__tests__/factories/matrix-factories";
import { WEB_FRAMEWORK_CATEGORY } from "../__tests__/mock-data/mock-categories";
import { elementAt, firstElement } from "../__tests__/helpers/element-at.js";

describe("validateBuildStep", () => {
  const requiredCategory: CategoryRow = {
    id: "web-framework",
    displayName: "Framework",
    required: true,
    exclusive: true,
    options: [],
  };

  const optionalCategory: CategoryRow = {
    id: "shared-tooling",
    displayName: "Tooling",
    required: false,
    exclusive: false,
    options: [],
  };

  it("should return valid when no categories are required", () => {
    const result = validateBuildStep([optionalCategory], {});
    expect(result).toStrictEqual({ valid: true });
  });

  it("should report invalid when a required category has no selections", () => {
    const result = validateBuildStep([requiredCategory], {});
    expect(result).toStrictEqual({
      valid: false,
      message: "No skills selected in Framework (required category)",
    });
  });

  it("should return valid when required category has selections", () => {
    const result = validateBuildStep([requiredCategory], {
      "web-framework": ["web-framework-react"],
    });
    expect(result).toStrictEqual({ valid: true });
  });

  it("should name the first missing required category", () => {
    const anotherRequired: CategoryRow = {
      id: "web-client-state",
      displayName: "State Management",
      required: true,
      exclusive: true,
      options: [],
    };
    const result = validateBuildStep([requiredCategory, anotherRequired], {});
    expect(result).toStrictEqual({
      valid: false,
      message: "No skills selected in Framework (required category)",
    });
  });

  it("should handle empty categories array", () => {
    const result = validateBuildStep([], {});
    expect(result).toStrictEqual({ valid: true });
  });

  it("should return valid with no message when all required categories have selections", () => {
    const anotherRequired: CategoryRow = {
      id: "web-client-state",
      displayName: "State Management",
      required: true,
      exclusive: true,
      options: [],
    };
    const result = validateBuildStep([requiredCategory, anotherRequired], {
      "web-framework": ["web-framework-react"],
      "web-client-state": ["web-state-zustand"],
    });
    expect(result).toStrictEqual({ valid: true });
  });

  it("should skip optional categories when checking for missing selections", () => {
    const result = validateBuildStep([optionalCategory, requiredCategory], {
      "web-framework": ["web-framework-react"],
    });
    expect(result).toStrictEqual({ valid: true });
  });

  it("should treat empty array selections the same as missing key", () => {
    const result = validateBuildStep([requiredCategory], {
      "web-framework": [],
    });
    expect(result).toStrictEqual({
      valid: false,
      message: "No skills selected in Framework (required category)",
    });
  });

  it("should name the second required category when the first is satisfied", () => {
    const secondRequired: CategoryRow = {
      id: "web-styling",
      displayName: "Styling",
      required: true,
      exclusive: true,
      options: [],
    };
    const result = validateBuildStep([requiredCategory, secondRequired], {
      "web-framework": ["web-framework-react"],
    });
    expect(result).toStrictEqual({
      valid: false,
      message: "No skills selected in Styling (required category)",
    });
  });
});

describe("buildCategoriesForDomain", () => {
  const frameworkCategory: Category = "web-framework";
  const stateCategory: Category = "web-client-state";

  // The real catalogue, because the rule is about which CAUSE produced a
  // verdict and a mock matrix can only carry causes somebody wrote into it.
  const optionIn = (domain: Domain, categoryId: Category, skillId: SkillId, selection: SkillId[]) =>
    buildCategoriesForDomain(domain, selection)
      .find((row) => row.id === categoryId)
      ?.options.find((option) => option.id === skillId);

  it("should return categories with options for the given domain", () => {
    initializeMatrix(BUILD_STEP_WEB_MATRIX);
    const result = buildCategoriesForDomain("web", []);

    expect(result).toHaveLength(2);
    expect(firstElement(result).id).toBe(frameworkCategory);
    expect(elementAt(result, 1).id).toBe(stateCategory);
  });

  it("should filter categories with no options", () => {
    initializeMatrix(BUILD_STEP_EMPTY_FRAMEWORK_MATRIX);

    const result = buildCategoriesForDomain("web", []);
    expect(result).toHaveLength(0);
  });

  it("should sort categories by order", () => {
    initializeMatrix(BUILD_STEP_WEB_MATRIX);
    const result = buildCategoriesForDomain("web", []);

    expect(firstElement(result).id).toBe(frameworkCategory);
    expect(elementAt(result, 1).id).toBe(stateCategory);
  });

  it("should show every skill in a category whatever framework is already selected", () => {
    initializeMatrix(BUILD_STEP_WEB_MATRIX);

    const result = buildCategoriesForDomain("web", ["web-framework-react"]);

    const stateRow = result.find((r) => r.id === stateCategory);
    expect(
      stateRow?.options,
      "no selection hides a sibling skill — the grid never filters on the framework",
    ).toHaveLength(2);
  });

  it("should mark installed skills", () => {
    initializeMatrix(BUILD_STEP_WEB_MATRIX);
    const installedSkillIds: SkillId[] = ["web-framework-react"];

    const result = buildCategoriesForDomain("web", [], installedSkillIds);

    const frameworkRow = result.find((r) => r.id === frameworkCategory);
    const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
    const vueOption = frameworkRow?.options.find(
      (o) => o.id === "web-framework-vue-composition-api",
    );

    expect(reactOption?.installed).toBe(true);
    expect(vueOption?.installed).toBe(false);
  });

  it("should mark all skills as not installed when no installed IDs provided", () => {
    initializeMatrix(BUILD_STEP_WEB_MATRIX);

    const result = buildCategoriesForDomain("web", []);

    const frameworkRow = result.find((r) => r.id === frameworkCategory);
    for (const option of frameworkRow!.options) {
      expect(option.installed).toBe(false);
    }
  });

  it("should set scope from skillConfigs", () => {
    initializeMatrix(BUILD_STEP_WEB_MATRIX);

    const skillConfigs = [
      ...buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      ...buildSkillConfigs(["web-state-zustand"]),
    ];

    const result = buildCategoriesForDomain("web", [], [], skillConfigs);

    const frameworkRow = result.find((r) => r.id === frameworkCategory);
    const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
    expect(reactOption?.scope).toBe("global");

    const stateRow = result.find((r) => r.id === stateCategory);
    const zustandOption = stateRow?.options.find((o) => o.id === "web-state-zustand");
    expect(zustandOption?.scope).toBe("project");
  });

  it("should leave scope undefined when skill not in skillConfigs", () => {
    initializeMatrix(BUILD_STEP_WEB_MATRIX);

    const skillConfigs = buildSkillConfigs(["web-framework-react"]);

    const result = buildCategoriesForDomain("web", [], [], skillConfigs);

    const frameworkRow = result.find((r) => r.id === frameworkCategory);
    const vueOption = frameworkRow?.options.find(
      (o) => o.id === "web-framework-vue-composition-api",
    );
    expect(vueOption?.scope).toBeUndefined();
  });

  it("should set source from skillConfigs", () => {
    initializeMatrix(BUILD_STEP_WEB_MATRIX);

    const skillConfigs = [
      ...buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      ...buildSkillConfigs(["web-state-zustand"], { origin: "agents-inc" }),
    ];

    const result = buildCategoriesForDomain("web", [], [], skillConfigs);

    const frameworkRow = result.find((r) => r.id === frameworkCategory);
    const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
    expect(reactOption?.source).toBe("eject");

    const stateRow = result.find((r) => r.id === stateCategory);
    const zustandOption = stateRow?.options.find((o) => o.id === "web-state-zustand");
    expect(zustandOption?.source).toBe("agents-inc");
  });

  it("should leave source undefined when skill not in skillConfigs", () => {
    initializeMatrix(BUILD_STEP_WEB_MATRIX);

    const skillConfigs = buildSkillConfigs(["web-framework-react"]);

    const result = buildCategoriesForDomain("web", [], [], skillConfigs);

    const frameworkRow = result.find((r) => r.id === frameworkCategory);
    const vueOption = frameworkRow?.options.find(
      (o) => o.id === "web-framework-vue-composition-api",
    );
    expect(vueOption?.source).toBeUndefined();
  });

  describe("dual-scope badges", () => {
    it("should set secondaryScope when active entry and excluded tombstone exist in different scopes", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const skillConfigs = [
        ...buildSkillConfigs(["web-framework-react"]),
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
      ];

      const result = buildCategoriesForDomain("web", [], [], skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.scope).toBe("project");
      expect(reactOption?.secondaryScope).toBe("global");
    });

    it("should leave secondaryScope undefined when only one scope entry exists", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const skillConfigs = buildSkillConfigs(["web-framework-react"]);

      const result = buildCategoriesForDomain("web", [], [], skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.scope).toBe("project");
      expect(reactOption?.secondaryScope).toBeUndefined();
    });

    it("should leave both scope and secondaryScope undefined when skill has no config entries", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const skillConfigs = buildSkillConfigs(["web-state-zustand"]);

      const result = buildCategoriesForDomain("web", [], [], skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.scope).toBeUndefined();
      expect(reactOption?.secondaryScope).toBeUndefined();
    });

    it("should leave secondaryScope undefined when active and excluded entries have the same scope", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const skillConfigs = [
        ...buildSkillConfigs(["web-framework-react"]),
        ...buildSkillConfigs(["web-framework-react"], { excluded: true }),
      ];

      const result = buildCategoriesForDomain("web", [], [], skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.scope).toBe("project");
      expect(reactOption?.secondaryScope).toBeUndefined();
    });

    it("should leave secondaryScope undefined when only an excluded tombstone exists (no active entry)", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const skillConfigs = buildSkillConfigs(["web-framework-react"], {
        scope: "global",
        excluded: true,
      });

      const result = buildCategoriesForDomain("web", [], [], skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.scope).toBeUndefined();
      expect(reactOption?.secondaryScope).toBeUndefined();
    });

    it("renders an inherited-global entry as unselected with a global badge and no secondaryScope", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      // Active global entry that the project does not select at project scope — the
      // inherited-global row that renders `[G]` read-only after a dual-scope deselect.
      const skillConfigs = buildSkillConfigs(["web-framework-react"], { scope: "global" });

      const result = buildCategoriesForDomain("web", [], [], skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.selected).toBe(false);
      expect(reactOption?.scope).toBe("global");
      expect(reactOption?.secondaryScope).toBeUndefined();
    });

    it("renders a dual-scope entry as selected with project primary and global secondary", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const skillConfigs = [
        ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
      ];

      const result = buildCategoriesForDomain("web", ["web-framework-react"], [], skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.selected).toBe(true);
      expect(reactOption?.scope).toBe("project");
      expect(reactOption?.secondaryScope).toBe("global");
    });
  });

  it("should propagate category required and exclusive flags", () => {
    initializeMatrix(BUILD_STEP_FRAMEWORK_NON_EXCLUSIVE_MATRIX);

    const result = buildCategoriesForDomain("web", []);

    expect(firstElement(result).required).toBe(true);
    expect(firstElement(result).exclusive).toBe(false);
  });

  it("should only return categories matching the requested domain", () => {
    const apiCategory: Category = "api-api";
    initializeMatrix(BUILD_STEP_FRAMEWORK_API_MATRIX);

    const webResult = buildCategoriesForDomain("web", []);
    expect(webResult).toHaveLength(1);
    expect(firstElement(webResult).id).toBe(frameworkCategory);

    const apiResult = buildCategoriesForDomain("api", []);
    expect(apiResult).toHaveLength(1);
    expect(firstElement(apiResult).id).toBe(apiCategory);
  });

  it("should return empty array when no categories match the domain", () => {
    initializeMatrix(BUILD_STEP_FRAMEWORK_ONLY_MATRIX);

    const result = buildCategoriesForDomain("api", []);
    expect(result).toHaveLength(0);
  });

  describe("selected skill state", () => {
    it("should mark skills as selected when in allSelections", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const allSelections: SkillId[] = ["web-framework-react"];
      const result = buildCategoriesForDomain("web", allSelections);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      const vueOption = frameworkRow?.options.find(
        (o) => o.id === "web-framework-vue-composition-api",
      );

      expect(reactOption?.selected).toBe(true);
      expect(vueOption?.selected).toBe(false);
    });

    it("should set requiredBy for unselected skills that are required by selected ones", () => {
      initializeMatrix(BUILD_STEP_REQUIRES_MATRIX);

      // React is selected but zustand is not
      const allSelections: SkillId[] = ["web-framework-react"];
      const result = buildCategoriesForDomain("web", allSelections);

      const stateRow = result.find((r) => r.id === stateCategory);
      const zustandOption = stateRow?.options.find((o) => o.id === "web-state-zustand");
      // zustand is not selected, so requiredBy should show the display name of the skill requiring it
      expect(zustandOption?.requiredBy).toBe("React");
    });

    it("should not set requiredBy for selected skills", () => {
      initializeMatrix(BUILD_STEP_REQUIRES_MATRIX);

      // Both selected
      const allSelections: SkillId[] = [...EXPECTED_SKILLS.WEB_DEFAULT];
      const result = buildCategoriesForDomain("web", allSelections);

      const stateRow = result.find((r) => r.id === stateCategory);
      const zustandOption = stateRow?.options.find((o) => o.id === "web-state-zustand");
      // zustand IS selected, so requiredBy should be undefined
      expect(zustandOption?.requiredBy).toBeUndefined();
    });
  });

  describe("local skills", () => {
    it("should propagate local flag from matrix skill", () => {
      initializeMatrix(BUILD_STEP_LOCAL_SKILL_MATRIX);

      const result = buildCategoriesForDomain("web", []);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.local).toBe(true);
    });

    it("should leave local undefined for non-local skills", () => {
      initializeMatrix(BUILD_STEP_NON_LOCAL_MATRIX);

      const result = buildCategoriesForDomain("web", []);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.local).toBeUndefined();
    });
  });

  describe("category displayName", () => {
    it("should use displayName from category definition", () => {
      initializeMatrix(BUILD_STEP_DISPLAY_NAME_MATRIX);

      const result = buildCategoriesForDomain("web", []);
      expect(firstElement(result).displayName).toBe("Web Framework");
    });
  });

  describe("option ordering", () => {
    it("sorts options alphabetically by displayName regardless of matrix insertion order", () => {
      // Insert Vue before React so the matrix insertion order is NON-alphabetical.
      // The sort must reorder to "React" before "Vue Composition Api" (ordinal,
      // locale-independent), never leaving the raw readdir/insertion order.
      initializeMatrix(
        createMockMatrix(SKILLS.vue, SKILLS.react, {
          categories: buildCategoryMap({ "web-framework": WEB_FRAMEWORK_CATEGORY }),
        }),
      );

      const result = buildCategoriesForDomain("web", []);
      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const displayNames = frameworkRow!.options.map((o) => getSkillById(o.id).displayName);

      expect(displayNames).toStrictEqual(["React", "Vue Composition Api"]);
    });
  });

  describe("sorting", () => {
    it("should sort categories by ascending order value", () => {
      const stylingCategory: Category = "web-styling";
      initializeMatrix(BUILD_STEP_SORTING_MATRIX);

      const result = buildCategoriesForDomain("web", []);

      expect(firstElement(result).id).toBe(stylingCategory);
      expect(elementAt(result, 1).id).toBe(frameworkCategory);
      expect(elementAt(result, 2).id).toBe(stateCategory);
    });
  });

  describe("exclusive category incompatibility suppression", () => {
    it("should neutralize incompatible state in exclusive categories", () => {
      // React and Vue conflict with each other — selecting React makes Vue incompatible
      initializeMatrix(BUILD_STEP_CONFLICTS_EXCLUSIVE_MATRIX);

      // React is selected — Vue would normally be "incompatible"
      const allSelections: SkillId[] = ["web-framework-react"];
      const result = buildCategoriesForDomain("web", allSelections);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const vueOption = frameworkRow?.options.find(
        (o) => o.id === "web-framework-vue-composition-api",
      );
      // In an exclusive category, incompatible is suppressed to normal
      expect(vueOption?.state).toStrictEqual({ status: "normal" });
    });

    it("should preserve incompatible state in non-exclusive categories", () => {
      // Zustand and Pinia conflict with each other
      initializeMatrix(BUILD_STEP_CONFLICTS_NON_EXCLUSIVE_MATRIX);

      // Zustand is selected — Pinia should remain incompatible in a non-exclusive category
      const allSelections: SkillId[] = ["web-state-zustand"];
      const result = buildCategoriesForDomain("web", allSelections);

      const stateRow = result.find((r) => r.id === stateCategory);
      const piniaOption = stateRow?.options.find((o) => o.id === "web-state-pinia");
      expect(piniaOption?.state.status).toBe("incompatible");
    });

    it("should preserve discouraged states in exclusive categories", () => {
      initializeMatrix(BUILD_STEP_ADVISORY_STATES_MATRIX);

      // No selections — React carries no advisory state
      const resultNoSelection = buildCategoriesForDomain("web", []);
      const frameworkRow = resultNoSelection.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.state.status).toBe("normal");

      // SCSS selected — Vue should be discouraged (not suppressed)
      const resultWithScss = buildCategoriesForDomain("web", ["web-styling-scss-modules"]);
      const frameworkRow2 = resultWithScss.find((r) => r.id === frameworkCategory);
      const vueOption = frameworkRow2?.options.find(
        (o) => o.id === "web-framework-vue-composition-api",
      );
      expect(vueOption?.state.status).toBe("discouraged");
    });
  });

  describe("exclusive category incompatibility narrowing", () => {
    it("keeps a requirement the selection has ruled out standing inside a pick-one category", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      const option = optionIn("web", "web-meta-framework", "web-meta-framework-nextjs", [
        "web-framework-svelte",
      ]);

      expect(option?.state).toStrictEqual({
        status: "incompatible",
        reason: "requires React which conflicts with current selection",
      });
    });

    it("leaves a sibling conflicting with the selected option offerable", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      // Picking Vue replaces React, so the conflict between them is a swap.
      const option = optionIn("web", "web-framework", "web-framework-vue-composition-api", [
        "web-framework-react",
      ]);

      expect(option?.state).toStrictEqual({ status: "normal" });
    });

    it("rules out a sibling the swap alone would not rescue", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      // Both conflict with the selected Next.js. Remix runs on the React that is
      // also selected; Nuxt needs Vue, which that same React rules out — so the
      // swap saves one and not the other.
      const selection: SkillId[] = ["web-meta-framework-nextjs", "web-framework-react"];

      expect(
        optionIn("web", "web-meta-framework", "web-meta-framework-nuxt", selection)?.state,
      ).toStrictEqual({
        status: "incompatible",
        reason: "requires Vue which conflicts with current selection",
      });
      expect(
        optionIn("web", "web-meta-framework", "web-meta-framework-remix", selection)?.state,
      ).toStrictEqual({ status: "normal" });
    });

    it("surfaces no incompatibility anywhere while nothing is selected", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      const incompatible = DOMAIN_ORDER.flatMap((domain) =>
        buildCategoriesForDomain(domain, []).flatMap((row) =>
          row.options.filter((option) => option.state.status === "incompatible").map((o) => o.id),
        ),
      );

      expect(incompatible).toStrictEqual([]);
    });
  });

  describe("category headers in the shipped catalogue", () => {
    it("renders one row per header, so no domain shows the same title twice", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      const duplicated = DOMAIN_ORDER.flatMap((domain) => {
        const titles = buildCategoriesForDomain(domain, []).map((row) => row.displayName);
        return titles.filter((title, index) => titles.indexOf(title) !== index);
      });

      expect(duplicated).toStrictEqual([]);
    });

    it("offers every API framework under the one API Framework header", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      const rows = buildCategoriesForDomain("api", []).filter(
        (row) => row.displayName === "API Framework",
      );

      expect(rows).toHaveLength(1);
      expect(firstElement(rows).id).toBe("api-api");
      expect(
        firstElement(rows)
          .options.map((option) => option.id)
          .sort(),
      ).toStrictEqual([
        "api-framework-elysia",
        "api-framework-express",
        "api-framework-fastify",
        "api-framework-hono",
        "api-framework-nestjs",
      ]);
    });
  });

  describe("framework fences in the shipped catalogue", () => {
    it("counts a rich-text editor unsatisfied until one of its React frameworks joins it", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      // Lexical's only editor bootstrap and plugin registration path is
      // @lexical/react, so picking it alone leaves a requirement outstanding.
      const alone = optionIn("web", "web-editor", "web-editor-lexical", ["web-editor-lexical"]);
      expect(alone?.hasUnmetRequirements).toBe(true);
      expect(alone?.unmetRequirementsReason).toBe("requires React, Next.js or Remix");

      const withReact = optionIn("web", "web-editor", "web-editor-lexical", [
        "web-editor-lexical",
        "web-framework-react",
      ]);
      expect(withReact?.hasUnmetRequirements).toBe(false);
    });

    it("offers each documentation framework beside the other family's base framework", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      // A docs site is its own deployable: whichever framework it renders with
      // is internal to it, so it fences neither the app's framework nor itself.
      const docusaurusAlone = optionIn("web", "web-docs", "web-meta-framework-docusaurus", [
        "web-meta-framework-docusaurus",
      ]);
      expect(docusaurusAlone?.hasUnmetRequirements).toBe(false);
      expect(
        optionIn("web", "web-docs", "web-meta-framework-docusaurus", [
          "web-framework-vue-composition-api",
        ])?.state,
      ).toStrictEqual({ status: "normal" });

      const vitepressAlone = optionIn("web", "web-docs", "web-meta-framework-vitepress", [
        "web-meta-framework-vitepress",
      ]);
      expect(vitepressAlone?.hasUnmetRequirements).toBe(false);
      expect(
        optionIn("web", "web-docs", "web-meta-framework-vitepress", ["web-framework-react"])?.state,
      ).toStrictEqual({ status: "normal" });
      expect(
        optionIn("web", "web-docs", "web-meta-framework-vitepress", ["web-meta-framework-nextjs"])
          ?.state,
      ).toStrictEqual({ status: "normal" });
    });

    it("offers Storybook in a Qwik stack and counts its requirement met there", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      // Qwik is listed on Storybook's own frameworks page, so the fence its
      // `requires` group states has to admit it.
      expect(
        optionIn("web", "web-tooling", "web-tooling-storybook", ["web-meta-framework-qwik"])?.state,
      ).toStrictEqual({ status: "normal" });

      const selected = optionIn("web", "web-tooling", "web-tooling-storybook", [
        "web-tooling-storybook",
        "web-meta-framework-qwik",
      ]);
      expect(selected?.hasUnmetRequirements).toBe(false);
    });

    it("stops accepting Remix alone as the React a client-side router needs", () => {
      initializeMatrix(BUILT_IN_MATRIX);

      // createBrowserRouter/RouterProvider are framework-owned inside a Remix
      // app, so Remix does not stand in for the React the router names. The
      // cell stays offerable — Remix is built on React, so nothing rules React
      // out — and the fence surfaces on the selected skill's own badge instead.
      expect(
        optionIn("web", "web-routing", "web-routing-react-router", ["web-meta-framework-remix"])
          ?.state,
      ).toStrictEqual({ status: "normal" });

      const withRemix = optionIn("web", "web-routing", "web-routing-react-router", [
        "web-routing-react-router",
        "web-meta-framework-remix",
      ]);
      expect(withRemix?.hasUnmetRequirements).toBe(true);
      expect(withRemix?.unmetRequirementsReason).toBe("requires React");

      const withReact = optionIn("web", "web-routing", "web-routing-react-router", [
        "web-routing-react-router",
        "web-framework-react",
      ]);
      expect(withReact?.hasUnmetRequirements).toBe(false);
    });
  });

  describe("lock icon eligibility", () => {
    it("should mark globally installed skills as lock-eligible", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const installedSkillIds: SkillId[] = ["web-framework-react"];
      const skillConfigs = buildSkillConfigs(["web-framework-react"], { scope: "global" });

      const result = buildCategoriesForDomain("web", [], installedSkillIds, skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.installed).toBe(true);
      expect(reactOption?.scope).toBe("global");
    });

    it("should not mark project-scoped installed skills as lock-eligible", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const installedSkillIds: SkillId[] = ["web-framework-react"];
      const skillConfigs = buildSkillConfigs(["web-framework-react"]);

      const result = buildCategoriesForDomain("web", [], installedSkillIds, skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.installed).toBe(true);
      expect(reactOption?.scope).toBe("project");
    });

    it("should not mark uninstalled skills as lock-eligible", () => {
      initializeMatrix(BUILD_STEP_WEB_MATRIX);

      const skillConfigs = buildSkillConfigs(["web-framework-react"], { scope: "global" });

      const result = buildCategoriesForDomain("web", [], [], skillConfigs);

      const frameworkRow = result.find((r) => r.id === frameworkCategory);
      const reactOption = frameworkRow?.options.find((o) => o.id === "web-framework-react");
      expect(reactOption?.installed).toBe(false);
    });
  });
});
