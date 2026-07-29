import { render } from "ink-testing-library";
import { indexBy } from "remeda";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { StepBuild, type StepBuildProps } from "./step-build";
import { validateBuildStep } from "../../lib/wizard/index";
import { orderDomains } from "./utils";
import type { CategoryRow as GridCategoryRow } from "./category-grid";
import type {
  CategoryDefinition,
  Domain,
  ResolvedSkill,
  Category,
  CategorySelections,
  SkillId,
} from "../../types";
import {
  ENTER,
  ESCAPE,
  RENDER_DELAY_MS,
  INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";
import { SKILLS } from "../../lib/__tests__/test-fixtures";
import { createMockSkill } from "../../lib/__tests__/factories/skill-factories";
import { buildCategoryMap, createMockMatrix } from "../../lib/__tests__/factories/matrix-factories";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import {
  WEB_FRAMEWORK_CATEGORY,
  WEB_STYLING_CATEGORY,
  WEB_STATE_CATEGORY,
  API_FRAMEWORK_CATEGORY,
  API_DATABASE_CATEGORY,
  CLI_FRAMEWORK_CATEGORY,
} from "../../lib/__tests__/mock-data/mock-categories.js";

const buildTestMatrix = (categories: CategoryDefinition[], skills: ResolvedSkill[]) =>
  createMockMatrix(...skills, {
    categories: buildCategoryMap(indexBy(categories, (c) => c.id)),
  });

const defaultMatrix = buildTestMatrix(
  [
    WEB_FRAMEWORK_CATEGORY,
    WEB_STYLING_CATEGORY,
    WEB_STATE_CATEGORY,
    API_FRAMEWORK_CATEGORY,
    API_DATABASE_CATEGORY,
  ],
  [
    SKILLS.react,
    SKILLS.vue,
    SKILLS.tailwind,
    SKILLS.scss,
    SKILLS.zustand,
    SKILLS.hono,
    SKILLS.drizzle,
  ],
);

const defaultProps: StepBuildProps = {
  domain: "web",
  selectedDomains: ["web"],
  selections: {},
  allSelections: [],
  showLabels: false,
  filterIncompatible: false,
  onToggle: vi.fn(),
  onToggleLabels: vi.fn(),
  onToggleFilterIncompatible: vi.fn(),
  onContinue: vi.fn(),
  onBack: vi.fn(),
};

const renderStepBuild = (props: Partial<StepBuildProps> = {}) => {
  return render(<StepBuild {...defaultProps} {...props} />);
};

describe("StepBuild component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(defaultMatrix);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  describe("rendering", () => {
    it("should render CategoryGrid with correct categories for domain", () => {
      // For web domain with framework-first flow, initially only shows Framework
      // To see other categories, need a framework selection
      const { lastFrame, unmount } = renderStepBuild({
        selections: { "web-framework": ["web-framework-react"] }, // Framework selected to show other categories
      });
      cleanup = unmount;

      const output = lastFrame();
      // Web domain should show Framework, Styling, Client State (when framework selected)
      expect(output).toContain("Framework");
      expect(output).toContain("Styling");
      expect(output).toContain("Client State");
      // Should NOT show API categories
      expect(output).not.toContain("API Framework");
      expect(output).not.toContain("Database");
    });

    it("should render API categories when domain is api", () => {
      const { lastFrame, unmount } = renderStepBuild({
        domain: "api",
      });
      cleanup = unmount;

      const output = lastFrame();
      // API domain should show API Framework, Database
      expect(output).toContain("API Framework");
      expect(output).toContain("Database");
      // Should NOT show Web categories
      expect(output).not.toContain("Styling");
      expect(output).not.toContain("Client State");
    });

    it("should render skills as options", () => {
      // Need framework selected to see other categories in web domain
      const { lastFrame, unmount } = renderStepBuild({
        selections: { "web-framework": ["web-framework-react"] },
      });
      cleanup = unmount;

      const output = lastFrame();
      // Framework skills
      expect(output).toContain("React");
      expect(output).toContain("Vue");
      // Styling skills (visible after framework selected)
      expect(output).toContain("Tailwind");
      expect(output).toContain("Scss Modules");
    });

    it("should show required indicator (*) for required categories", () => {
      const { lastFrame, unmount } = renderStepBuild();
      cleanup = unmount;

      const output = lastFrame();
      // Framework and Styling are required
      expect(output).toContain("*");
    });

    it("should render categories for the domain", () => {
      const { lastFrame, unmount } = renderStepBuild({
        selections: { "web-framework": ["web-framework-react"] },
      });
      cleanup = unmount;

      const output = lastFrame();
      // Should render the domain categories
      expect(output).toContain("Framework");
      expect(output).toContain("Styling");
    });
  });

  describe("domain header", () => {
    it("should render domain categories when multiple domains selected", () => {
      const { lastFrame, unmount } = renderStepBuild({
        selectedDomains: ["web", "api"],
      });
      cleanup = unmount;

      const output = lastFrame();
      // ViewTitle removed; verify domain content renders (title shown by wizard-layout)
      expect(output).toContain("Framework");
    });

    it("should render domain categories when only one selected", () => {
      const { lastFrame, unmount } = renderStepBuild({
        selectedDomains: ["web"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Framework");
    });

    it("should render correct categories for final domain", () => {
      const { lastFrame, unmount } = renderStepBuild({
        selectedDomains: ["web", "api"],
        domain: "api",
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("API Framework");
    });

    it("should render correct categories for domain", () => {
      const { lastFrame, unmount } = renderStepBuild({
        selectedDomains: ["web", "api", "cli"],
        domain: "api",
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("API Framework");
    });

    it("should display domains in canonical order regardless of selection order", () => {
      // Domains selected in reverse order: CLI, Mobile, API, Web
      expect(orderDomains(["cli", "mobile", "api", "web"])).toStrictEqual([
        "web",
        "api",
        "mobile",
        "cli",
      ]);
    });

    it("should preserve canonical order with partial domain selection", () => {
      // Only CLI and Web selected, in reverse order
      expect(orderDomains(["cli", "web"])).toStrictEqual(["web", "cli"]);
    });

    it("should place custom domains before built-in domains", () => {
      expect(orderDomains(["web", "gaming" as Domain, "api", "devops" as Domain])).toStrictEqual([
        "devops",
        "gaming",
        "web",
        "api",
      ]);
    });
  });

  describe("category filtering", () => {
    it("should filter categories correctly by domain", () => {
      // Web domain with framework selected (to bypass framework-first filter)
      const { lastFrame: webFrame, unmount: webUnmount } = renderStepBuild({
        domain: "web",
        selections: { "web-framework": ["web-framework-react"] },
      });
      const webOutput = webFrame();
      webUnmount();

      // API domain (no framework-first filter for API)
      const { lastFrame: apiFrame, unmount: apiUnmount } = renderStepBuild({
        domain: "api",
      });
      cleanup = apiUnmount;
      const apiOutput = apiFrame();

      // Web should have Framework, Styling, Client State (with framework selected)
      expect(webOutput).toContain("Framework");
      expect(webOutput).toContain("Styling");
      expect(webOutput).toContain("Client State");
      expect(webOutput).not.toContain("API Framework");

      // API should have API Framework, Database
      expect(apiOutput).toContain("API Framework");
      expect(apiOutput).toContain("Database");
      expect(apiOutput).not.toContain("Styling");
    });

    it("should sort categories by order", () => {
      // Need framework selected to see all categories
      const { lastFrame, unmount } = renderStepBuild({
        selections: { "web-framework": ["web-framework-react"] },
      });
      cleanup = unmount;

      const output = lastFrame();
      // Framework (order 0) should appear before Styling (order 1)
      // and Styling before Client State (order 2)
      const frameworkIndex = output?.indexOf("Framework") ?? -1;
      const stylingIndex = output?.indexOf("Styling") ?? -1;
      const stateIndex = output?.indexOf("Client State") ?? -1;

      expect(frameworkIndex).toBeLessThan(stylingIndex);
      expect(stylingIndex).toBeLessThan(stateIndex);
    });
  });

  describe("option states", () => {
    it("should show selected options correctly", () => {
      const { lastFrame, unmount } = renderStepBuild({
        allSelections: ["web-framework-react"],
        selections: { "web-framework": ["web-framework-react"] },
      });
      cleanup = unmount;

      const output = lastFrame();
      // Should show selected option (no circle symbol anymore, uses background)
      // Just verify the selected label is present
      expect(output).toContain("React");
    });

    it("should pass showLabels to CategoryGrid", () => {
      const { lastFrame, unmount } = renderStepBuild({
        showLabels: true,
      });
      cleanup = unmount;

      const output = lastFrame();
      // Labels toggle is now shown globally in wizard-layout
      // Verify component renders without error
      expect(output).toBeDefined();
    });
  });

  describe("keyboard navigation", () => {
    it("should call onContinue when Enter is pressed with valid selections", async () => {
      const onContinue = vi.fn();
      // Provide selections for required categories to pass validation
      const { stdin, unmount } = renderStepBuild({
        onContinue,
        selections: {
          "web-framework": ["web-framework-react"],
          "web-styling": ["web-styling-tailwind"],
        },
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onContinue).toHaveBeenCalled();
    });

    it("should call onBack when Escape is pressed", async () => {
      const onBack = vi.fn();
      const { stdin, unmount } = renderStepBuild({ onBack });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(onBack).toHaveBeenCalled();
    });

    it("should pass toggle callback to CategoryGrid", async () => {
      const onToggle = vi.fn();
      const { stdin, unmount } = renderStepBuild({
        onToggle,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      // Space should trigger toggle
      stdin.write(" ");
      await delay(INPUT_DELAY_MS);

      expect(onToggle).toHaveBeenCalled();
    });
  });

  describe("toggle callbacks", () => {
    it("should pass onToggleLabels to CategoryGrid", async () => {
      const onToggleLabels = vi.fn();
      const { stdin, unmount } = renderStepBuild({ onToggleLabels });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write("d"); // 'd' key toggles compatibility labels
      await delay(INPUT_DELAY_MS);

      expect(onToggleLabels).toHaveBeenCalled();
    });

    it("should not call onToggleFilterIncompatible when F is pressed while the feature flag is off", async () => {
      // FEATURE_FLAGS.FILTER_INCOMPATIBLE defaults off, so the F hotkey is a no-op.
      const onToggleFilterIncompatible = vi.fn();
      const { stdin, unmount } = renderStepBuild({ onToggleFilterIncompatible });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write("f");
      await delay(INPUT_DELAY_MS);

      expect(onToggleFilterIncompatible).not.toHaveBeenCalled();
    });
  });

  describe("edge cases", () => {
    it("should handle domain with no categories", () => {
      const { lastFrame, unmount } = renderStepBuild({
        domain: "mobile", // No mobile categories in test matrix
      });
      cleanup = unmount;

      const output = lastFrame();
      // Should show empty state message from CategoryGrid
      expect(output).toContain("No categories to display");
    });

    it("should handle unknown domain gracefully", () => {
      const { lastFrame, unmount } = renderStepBuild({
        domain: "shared",
      });
      cleanup = unmount;

      const output = lastFrame();
      // Should render without crashing
      expect(output).toBeDefined();
    });

    it("should handle empty allSelections", () => {
      const { lastFrame, unmount } = renderStepBuild({
        allSelections: [],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Framework");
    });

    it("should handle allSelections with skills from other domains", () => {
      const { lastFrame, unmount } = renderStepBuild({
        domain: "web",
        allSelections: ["api-framework-hono", "api-database-drizzle"], // API skills in test matrix
        selections: { "web-framework": ["web-framework-react"] }, // Need framework to see other categories
      });
      cleanup = unmount;

      const output = lastFrame();
      // Should still render web categories
      expect(output).toContain("Framework");
      expect(output).toContain("Styling");
    });
  });

  describe("multi-domain scenarios", () => {
    it("should render web categories in multi-domain flow", () => {
      const { lastFrame, unmount } = renderStepBuild({
        domain: "web",
        selectedDomains: ["web", "api"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Framework");
    });

    it("should render API categories for last domain in multi-domain flow", () => {
      const { lastFrame, unmount } = renderStepBuild({
        domain: "api",
        selectedDomains: ["web", "api"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("API Framework");
    });

    it("should render correct domain categories in three-domain flow", () => {
      // Add cli category to matrix
      const cliFrameworkCategory = { ...CLI_FRAMEWORK_CATEGORY, required: true, order: 0 };
      // Boundary cast: fictional skill ID for testing CLI domain display
      const commanderSkill = createMockSkill("cli-framework-commander" as SkillId, {
        displayName: "commander",
      });

      const matrixWithCli = buildTestMatrix(
        [
          WEB_FRAMEWORK_CATEGORY,
          WEB_STYLING_CATEGORY,
          WEB_STATE_CATEGORY,
          API_FRAMEWORK_CATEGORY,
          API_DATABASE_CATEGORY,
          cliFrameworkCategory,
        ],
        [
          SKILLS.react,
          SKILLS.vue,
          SKILLS.tailwind,
          SKILLS.scss,
          SKILLS.zustand,
          SKILLS.hono,
          SKILLS.drizzle,
          commanderSkill,
        ],
      );

      initializeMatrix(matrixWithCli);
      const { lastFrame, unmount } = renderStepBuild({
        domain: "api",
        selectedDomains: ["web", "api", "cli"],
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("API Framework");
    });
  });

  describe("header and selection count", () => {
    it("should render categories for the current domain", () => {
      const { lastFrame, unmount } = renderStepBuild();
      cleanup = unmount;

      const output = lastFrame();
      // ViewTitle removed; verify domain content renders (title shown by wizard-layout)
      expect(output).toContain("Framework");
    });

    it("should render categories for API domain", () => {
      const { lastFrame, unmount } = renderStepBuild({
        domain: "api",
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("API Framework");
    });
  });

  describe("keyboard help text", () => {
    it("should respond to d key for toggling compatibility labels", async () => {
      const onToggleLabels = vi.fn();
      const { stdin, unmount } = renderStepBuild({ onToggleLabels });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write("d");
      await delay(INPUT_DELAY_MS);

      expect(onToggleLabels).toHaveBeenCalled();
    });
  });

  describe("validateBuildStep", () => {
    it("should return valid when required categories have selections", () => {
      const categories: GridCategoryRow[] = [
        {
          id: "web-framework",
          displayName: "Framework",
          required: true,
          exclusive: true,
          options: [{ id: "web-framework-react", state: { status: "normal" }, selected: true }],
        },
      ];
      const selections: CategorySelections = { "web-framework": ["web-framework-react"] };

      const result = validateBuildStep(categories, selections);
      expect(result.valid).toBe(true);
      expect(result.message).toBeUndefined();
    });

    it("should return advisory message when required category has no selection", () => {
      const categories: GridCategoryRow[] = [
        {
          id: "web-framework",
          displayName: "Framework",
          required: true,
          exclusive: true,
          options: [{ id: "web-framework-react", state: { status: "normal" }, selected: false }],
        },
      ];
      const selections: CategorySelections = {};

      const result = validateBuildStep(categories, selections);
      expect(result.valid).toBe(true);
      expect(result.message).toContain("Framework");
    });

    it("should return valid when optional categories have no selections", () => {
      const categories: GridCategoryRow[] = [
        {
          id: "web-client-state",
          displayName: "State Management",
          required: false,
          exclusive: true,
          options: [
            {
              id: "web-state-zustand",
              state: { status: "normal" },
              selected: false,
            },
          ],
        },
      ];
      const selections: CategorySelections = {};

      const result = validateBuildStep(categories, selections);
      expect(result.valid).toBe(true);
    });

    it("should return advisory message for first missing required category", () => {
      const categories: GridCategoryRow[] = [
        {
          id: "web-framework",
          displayName: "Framework",
          required: true,
          exclusive: true,
          options: [],
        },
        {
          id: "web-styling",
          displayName: "Styling",
          required: true,
          exclusive: true,
          options: [],
        },
      ];
      const selections: CategorySelections = {};

      const result = validateBuildStep(categories, selections);
      expect(result.valid).toBe(true);
      expect(result.message).toContain("Framework"); // Should be the first one
    });
  });

  describe("validation on continue", () => {
    it("should call onContinue even without required selection (advisory only)", async () => {
      const onContinue = vi.fn();
      const { stdin, unmount } = renderStepBuild({
        onContinue,
        selections: {},
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Press Enter to continue without selecting required framework
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      // Validation is advisory — onContinue is always called
      expect(onContinue).toHaveBeenCalled();
    });

    it("should call onContinue when validation passes", async () => {
      const onContinue = vi.fn();
      const { stdin, unmount } = renderStepBuild({
        onContinue,
        selections: {
          "web-framework": ["web-framework-react"],
          "web-styling": ["web-styling-tailwind"],
        },
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Press Enter to continue with required selections
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(onContinue).toHaveBeenCalled();
    });
  });
});
