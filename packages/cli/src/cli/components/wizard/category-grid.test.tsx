import { render } from "ink-testing-library";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  CategoryGrid,
  type CategoryGridProps,
  type CategoryRow,
  type CategoryOption,
} from "./category-grid";
import type { SkillId, Category } from "../../types";
import {
  ARROW_UP,
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  TAB,
  RENDER_DELAY_MS,
  INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { CATEGORY_GRID_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";

const createOption = (id: SkillId, overrides: Partial<CategoryOption> = {}): CategoryOption => ({
  id,
  state: { status: "normal" },
  selected: false,
  ...overrides,
});

const createCategory = (
  id: Category,
  displayName: string,
  options: CategoryOption[],
  overrides: Partial<CategoryRow> = {},
): CategoryRow => ({
  id,
  displayName,
  exclusive: true,
  options,
  ...overrides,
});

const defaultCategories: CategoryRow[] = [
  createCategory("web-framework", "Framework", [
    createOption("web-framework-react"),
    createOption("web-framework-vue-composition-api"),
    createOption("web-framework-angular-standalone"),
    createOption("web-framework-solidjs"),
  ]),
  createCategory("web-styling", "Styling", [
    createOption("web-styling-scss-modules", { selected: true }),
    createOption("web-styling-tailwind"),
    createOption("web-styling-cva"),
    createOption("web-meta-framework-nuxt"),
  ]),
  createCategory("web-client-state", "Client State", [
    createOption("web-state-zustand"),
    createOption("web-state-jotai"),
    createOption("web-state-redux-toolkit", {
      state: { status: "discouraged", reason: "Complex for most apps" },
    }),
    createOption("web-state-mobx"),
  ]),
  createCategory("web-server-state", "Server State", [
    createOption("web-server-state-react-query", { selected: true }),
    createOption("web-data-fetching-swr"),
    createOption("web-data-fetching-graphql-apollo"),
  ]),
  createCategory("api-analytics", "Analytics", [createOption("api-analytics-posthog-analytics")]),
];

const categoriesWithFramework: CategoryRow[] = [
  createCategory("web-framework", "Framework", [
    createOption("web-framework-react", {
      selected: true, // Framework selected
    }),
    createOption("web-framework-vue-composition-api"),
    createOption("web-framework-angular-standalone"),
    createOption("web-framework-solidjs"),
  ]),
  createCategory("web-styling", "Styling", [
    createOption("web-styling-scss-modules"),
    createOption("web-styling-tailwind"),
    createOption("web-styling-cva"),
    createOption("web-meta-framework-nuxt"),
  ]),
  createCategory("web-client-state", "Client State", [
    createOption("web-state-zustand"),
    createOption("web-state-jotai"),
    createOption("web-state-redux-toolkit", {
      state: { status: "discouraged", reason: "Complex for most apps" },
    }),
    createOption("web-state-mobx"),
  ]),
];

const manyCategories: CategoryRow[] = [
  createCategory("web-framework", "Category 0", [
    createOption("web-framework-react"),
    createOption("web-framework-vue-composition-api"),
    createOption("web-framework-angular-standalone"),
  ]),
  createCategory("web-styling", "Category 1", [
    createOption("web-styling-tailwind"),
    createOption("web-styling-scss-modules"),
    createOption("web-styling-cva"),
  ]),
  createCategory("web-client-state", "Category 2", [
    createOption("web-state-zustand"),
    createOption("web-state-jotai"),
    createOption("web-state-mobx"),
  ]),
  createCategory("web-server-state", "Category 3", [
    createOption("web-server-state-react-query"),
    createOption("web-data-fetching-swr"),
    createOption("web-data-fetching-graphql-apollo"),
  ]),
  createCategory("web-forms", "Category 4", [
    createOption("web-forms-react-hook-form"),
    createOption("web-forms-vee-validate"),
    createOption("web-forms-zod-validation"),
  ]),
  createCategory("web-testing", "Category 5", [
    createOption("web-testing-vitest"),
    createOption("web-testing-playwright-e2e"),
    createOption("web-testing-cypress-e2e"),
  ]),
  createCategory("web-mocking", "Category 6", [
    createOption("web-mocks-msw"),
    createOption("web-testing-react-testing-library"),
    createOption("web-testing-vue-test-utils"),
  ]),
  createCategory("web-i18n", "Category 7", [
    createOption("web-i18n-next-intl"),
    createOption("web-i18n-react-intl"),
    createOption("web-i18n-vue-i18n"),
  ]),
];

const navCategories: CategoryRow[] = [
  createCategory("web-framework", "Category 0", [createOption("web-framework-react")]),
  createCategory("web-styling", "Category 1", [createOption("web-styling-tailwind")]),
  createCategory("web-client-state", "Category 2", [createOption("web-state-zustand")]),
  createCategory("web-server-state", "Category 3", [createOption("web-server-state-react-query")]),
  createCategory("web-forms", "Category 4", [createOption("web-forms-react-hook-form")]),
  createCategory("web-testing", "Category 5", [createOption("web-testing-vitest")]),
];

const defaultProps: CategoryGridProps = {
  categories: defaultCategories,
  defaultFocusedRow: 0,
  defaultFocusedCol: 0,
  showLabels: false,
  onToggle: vi.fn(),
  onFocusChange: vi.fn(),
  onToggleLabels: vi.fn(),
};

const renderGrid = (props: Partial<CategoryGridProps> = {}) => {
  return render(<CategoryGrid {...defaultProps} {...props} />);
};

describe("CategoryGrid component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(CATEGORY_GRID_MATRIX);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    initializeMatrix(BUILT_IN_MATRIX);
  });

  describe("rendering", () => {
    it("should render all categories as sections", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Framework");
      expect(output).toContain("Styling");
      expect(output).toContain("Client State");
      expect(output).toContain("Server State");
      expect(output).toContain("Analytics");
    });

    it("should render all options in each category", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      // Framework options
      expect(output).toContain("React");
      expect(output).toContain("Vue");
      expect(output).toContain("Angular");
      expect(output).toContain("SolidJS");
      // Styling options
      expect(output).toContain("SCSS Modules");
      expect(output).toContain("Tailwind");
    });

    it("should paint each category header as its name and nothing else", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      // Subject guard for the negatives: these two headers are painted in THIS frame, so a
      // clean absence below is a statement about the header rather than about an empty grid.
      expect(output).toContain("Framework");
      expect(output).toContain("Styling");
      expect(output).not.toContain("Framework *");
      expect(output).not.toContain("Styling *");
    });

    it("should handle empty categories array", () => {
      const { lastFrame, unmount } = renderGrid({ categories: [] });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("No categories to display");
    });

    it("should render section underlines", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      // Unicode horizontal line character used for underlines
      expect(output).toContain("\u2500");
    });
  });

  describe("visual states", () => {
    it("should show selected options with display name", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      // scss-mod and react-query are selected in defaultCategories
      expect(output).toContain("SCSS Modules");
      expect(output).toContain("React Query");
    });

    it("should show unselected options with display name", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      // Unselected options should display their names from the store
      expect(output).toContain("Vue");
      expect(output).toContain("Angular");
    });

    it("should NOT show warning indicator for discouraged options (uses color instead)", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      // Should NOT contain warning (⚠) for discouraged
      expect(output).not.toContain("\u26A0");
    });

    it("should show discouraged options with warning styling", () => {
      const categories: CategoryRow[] = [
        createCategory("web-testing", "Test", [
          createOption("web-forms-react-hook-form"),
          createOption("web-forms-vee-validate", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      // Discouraged options should show display name
      expect(output).toContain("Vee Validate");
    });

    it("should render selected skills with display name", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", { selected: true }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React Hook Form");
    });

    it("should render unselected skills with display name", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", {
            state: { status: "normal" },
            selected: false,
          }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React Hook Form");
    });

    it("should render discouraged skills with display name", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React Hook Form");
    });

    it("should render discouraged+selected skills with display name", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
            selected: true,
          }),
          createOption("web-forms-vee-validate", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
            selected: false,
          }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React Hook Form");
      expect(output).toContain("Vee Validate");
    });

    it("should render discouraged skills with display name from store", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React Hook Form");
    });

    it("should render both selected and unselected skills with display names", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", { selected: true }),
          createOption("web-forms-vee-validate", { selected: false }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React Hook Form");
      expect(output).toContain("Vee Validate");
    });

    it("should render skill display name regardless of selection state", () => {
      const categories1: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", { selected: false }),
        ]),
      ];

      const { lastFrame: frame1, unmount: unmount1 } = renderGrid({ categories: categories1 });
      const output1 = frame1();
      unmount1();

      // Second render: same option selected
      const categories2: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", { selected: true }),
        ]),
      ];

      const { lastFrame: frame2, unmount: unmount2 } = renderGrid({ categories: categories2 });
      cleanup = unmount2;
      const output2 = frame2();

      // Both states should render the display name
      expect(output1).toContain("React Hook Form");
      expect(output2).toContain("React Hook Form");
    });
  });

  describe("locked sections", () => {
    it("should show all categories including locked ones", () => {
      // No framework selected, so non-framework sections should be locked but visible
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Framework");
      expect(output).toContain("Styling");
      expect(output).toContain("Client State");
    });

    it("should unlock sections when framework is selected", () => {
      const { lastFrame, unmount } = renderGrid({
        categories: categoriesWithFramework,
      });
      cleanup = unmount;

      const output = lastFrame();
      // All sections should be visible and navigable
      expect(output).toContain("Framework");
      expect(output).toContain("Styling");
      expect(output).toContain("Client State");
    });

    it("should not lock any sections when no framework category exists", () => {
      const categoriesNoFramework: CategoryRow[] = [
        createCategory("web-styling", "Styling", [
          createOption("web-styling-scss-modules"),
          createOption("web-styling-tailwind"),
        ]),
        createCategory("web-client-state", "State", [createOption("web-state-zustand")]),
      ];

      const { lastFrame, unmount } = renderGrid({
        categories: categoriesNoFramework,
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Styling");
      expect(output).toContain("State");
    });
  });

  describe("initial focus dispatch", () => {
    it("dispatches onFocusedSkillChange for the initially focused cell on mount without navigation", async () => {
      const onFocusedSkillChange = vi.fn();
      const { unmount } = renderGrid({
        categories: categoriesWithFramework,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusedSkillChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Row 0 / col 0 in categoriesWithFramework is web-framework-react — the store
      // must learn the visually focused cell on mount, before any arrow key.
      expect(onFocusedSkillChange).toHaveBeenCalledWith("web-framework-react");
    });
  });

  describe("focus indicator", () => {
    it("should render focused option with display name", () => {
      const { lastFrame, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
      });
      cleanup = unmount;

      const output = lastFrame();
      // Focused option should be visible (background highlighting is visual-only)
      expect(output).toContain("React");
    });

    it("should render correctly when focusedRow changes", () => {
      const { lastFrame: frame1, unmount: unmount1 } = renderGrid({
        categories: categoriesWithFramework,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
      });
      const output1 = frame1();
      unmount1();

      const { lastFrame: frame2, unmount: unmount2 } = renderGrid({
        categories: categoriesWithFramework,
        defaultFocusedRow: 1,
        defaultFocusedCol: 0,
      });
      cleanup = unmount2;
      const output2 = frame2();

      // Both should render the focused category options
      expect(output1).toContain("Framework");
      expect(output2).toContain("Styling");
    });

    it("should highlight focused category name", () => {
      const { lastFrame, unmount } = renderGrid({
        categories: categoriesWithFramework,
        defaultFocusedRow: 1,
        defaultFocusedCol: 0,
      });
      cleanup = unmount;

      const output = lastFrame();
      // Styling row should be focused (index 1)
      expect(output).toContain("Styling");
    });
  });

  describe("keyboard navigation - arrow keys", () => {
    it("should call onFocusChange when pressing left arrow", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 1,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS * 2);
      stdin.write(ARROW_LEFT);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 0);
    });

    it("should call onFocusChange when pressing right arrow", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_RIGHT);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 1);
    });

    it("should call onFocusChange when pressing up arrow (wraps to last row)", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      // Should wrap to last row (4) since no sections are locked
      expect(onFocusChange).toHaveBeenCalledWith(4, 0);
    });

    it("should navigate between sections when unlocked", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        categories: categoriesWithFramework,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      // Should move to row 1 (Styling) since framework is selected
      expect(onFocusChange).toHaveBeenCalledWith(1, 0);
    });

    it("should wrap horizontally when pressing left at first column", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_LEFT);
      await delay(INPUT_DELAY_MS);

      // Should wrap to last column (index 3 for framework with 4 options)
      expect(onFocusChange).toHaveBeenCalledWith(0, 3);
    });

    it("should wrap horizontally when pressing right at last column", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 3, // Last option in framework
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_RIGHT);
      await delay(INPUT_DELAY_MS);

      // Should wrap to first column
      expect(onFocusChange).toHaveBeenCalledWith(0, 0);
    });

    it("should wrap vertically when all sections are unlocked", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        categories: categoriesWithFramework,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      // Should wrap to last row (index 2 for 3 categories)
      expect(onFocusChange).toHaveBeenCalledWith(2, 0);
    });
  });

  describe("keyboard navigation - vim keys", () => {
    it("should move left with h key", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 1,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write("h");
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 0);
    });

    it("should move right with l key", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write("l");
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 1);
    });

    it("should move up with k key", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        categories: categoriesWithFramework,
        defaultFocusedRow: 1,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write("k");
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 0);
    });

    it("should move down with j key", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        categories: categoriesWithFramework,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write("j");
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(1, 0);
    });
  });

  describe("selection toggle", () => {
    it("should call onToggle when pressing space on a normal option", async () => {
      const onToggle = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 1, // vue (normal state)
        onToggle,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(" "); // Space
      await delay(INPUT_DELAY_MS);

      expect(onToggle).toHaveBeenCalledWith("web-framework", "web-framework-vue-composition-api");
    });

    it("should call onToggle when pressing space on a selected option", async () => {
      const onToggle = vi.fn();
      const categories: CategoryRow[] = [
        createCategory("web-framework", "Framework", [
          createOption("web-framework-react", { selected: true }),
          createOption("web-framework-vue-composition-api"),
        ]),
      ];
      const { stdin, unmount } = renderGrid({
        categories,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0, // react (selected)
        onToggle,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(" ");
      await delay(INPUT_DELAY_MS);

      expect(onToggle).toHaveBeenCalledWith("web-framework", "web-framework-react");
    });

    it("should call onToggle for discouraged options (still selectable)", async () => {
      const onToggle = vi.fn();
      const categories: CategoryRow[] = [
        createCategory("web-testing", "Test", [
          createOption("web-forms-react-hook-form", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
          createOption("web-forms-vee-validate", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
        ]),
      ];

      const { stdin, unmount } = renderGrid({
        categories,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onToggle,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(" ");
      await delay(INPUT_DELAY_MS);

      expect(onToggle).toHaveBeenCalled();
    });

    it("should keep focus on initial row when no sections are locked", async () => {
      const onFocusChange = vi.fn();
      const { unmount } = renderGrid({
        defaultFocusedRow: 1,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);

      // Focus stays on row 1 since no sections are locked
      expect(onFocusChange).not.toHaveBeenCalled();
    });
  });

  describe("discouraged options navigation", () => {
    it("should navigate to discouraged options when navigating right", async () => {
      const onFocusChange = vi.fn();
      const categories: CategoryRow[] = [
        createCategory("web-testing", "Test", [
          createOption("web-forms-react-hook-form"),
          createOption("web-forms-vee-validate", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
          createOption("web-forms-zod-validation"),
        ]),
      ];

      // Options stay in original order: [opt1, opt2(discouraged), opt3]
      const { stdin, unmount } = renderGrid({
        categories,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_RIGHT);
      await delay(INPUT_DELAY_MS);

      // Navigating right from index 0 goes to index 1 (opt2, discouraged but hoverable)
      expect(onFocusChange).toHaveBeenCalledWith(0, 1);
    });

    it("should navigate to discouraged options when navigating left", async () => {
      const onFocusChange = vi.fn();
      const categories: CategoryRow[] = [
        createCategory("web-testing", "Test", [
          createOption("web-forms-react-hook-form"),
          createOption("web-forms-vee-validate", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
          createOption("web-forms-zod-validation"),
        ]),
      ];

      // Options stay in original order: [opt1, opt2(discouraged), opt3]
      const { stdin, unmount } = renderGrid({
        categories,
        defaultFocusedRow: 0,
        defaultFocusedCol: 2, // Start at opt3 (index 2)
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_LEFT);
      await delay(INPUT_DELAY_MS);

      // Discouraged options are hoverable — navigates to index 1 (opt2)
      expect(onFocusChange).toHaveBeenCalledWith(0, 1);
    });

    it("should navigate between all-discouraged options in a row", async () => {
      const onFocusChange = vi.fn();
      const categories: CategoryRow[] = [
        createCategory("web-testing", "Test", [
          createOption("web-forms-react-hook-form", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
          createOption("web-forms-vee-validate", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
        ]),
      ];

      const { stdin, unmount } = renderGrid({
        categories,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_RIGHT);
      await delay(INPUT_DELAY_MS);

      // Discouraged options are hoverable — navigates to index 1
      expect(onFocusChange).toHaveBeenCalledWith(0, 1);
    });
  });

  describe("exclusive categories", () => {
    it("should render exclusive category correctly", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      // All default categories are exclusive, should render normally
      expect(output).toContain("Framework");
    });

    // Note: The actual exclusivity logic (only one selection) is handled
    // by the parent component via onToggle. CategoryGrid just displays
    // the current state.
  });

  describe("tab navigation", () => {
    it("should jump to next section when pressing Tab", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        categories: categoriesWithFramework,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(TAB);
      await delay(INPUT_DELAY_MS);

      // Should jump to next section (row 1)
      expect(onFocusChange).toHaveBeenCalledWith(1, 0);
    });

    it("should jump to next section on Tab", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(TAB);
      await delay(INPUT_DELAY_MS);

      // Should jump to next section since no sections are locked
      expect(onFocusChange).toHaveBeenCalledWith(1, 0);
    });
  });

  describe("compatibility labels toggle", () => {
    it("should call onToggleLabels when pressing d key", async () => {
      const onToggleLabels = vi.fn();
      const { stdin, unmount } = renderGrid({
        onToggleLabels,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write("d");
      await delay(INPUT_DELAY_MS);

      expect(onToggleLabels).toHaveBeenCalled();
    });

    it("should not show label for selected skills when showLabels is true", () => {
      const { lastFrame, unmount } = renderGrid({ showLabels: true });
      cleanup = unmount;

      const output = lastFrame();
      // Selected skills show no label — selection is visually obvious from color
      expect(output).not.toContain("(selected)");
    });

    it("should show Discouraged label when showLabels is true and skill is focused", () => {
      // Use categoriesWithFramework so Client State section is unlocked
      // Redux (discouraged) is at row 2, col 2
      const { lastFrame, unmount } = renderGrid({
        categories: categoriesWithFramework,
        showLabels: true,
        defaultFocusedRow: 2,
        defaultFocusedCol: 2,
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("(discouraged: Complex for most apps)");
    });

    it("should hide compatibility labels when showLabels is false", () => {
      const { lastFrame, unmount } = renderGrid({ showLabels: false });
      cleanup = unmount;

      const output = lastFrame();
      // Labels should not be visible when toggle is off. The opening paren is
      // deliberately unclosed: the annotation now carries `: <reason>` before its
      // own `)`, so matching the closed word would pass on a label that leaked.
      expect(output).not.toContain("(selected)");
      expect(output).not.toContain("(discouraged");
    });

    it("should show discouraged label for focused discouraged option when showLabels is true", () => {
      const categories: CategoryRow[] = [
        createCategory("web-testing", "Test", [
          createOption("web-forms-vee-validate", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
          createOption("web-forms-react-hook-form"),
        ]),
      ];

      // First option is focused by default — make it the discouraged one
      const { lastFrame, unmount } = renderGrid({ categories, showLabels: true });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("(discouraged: Prefer the alternative)");
    });
  });

  describe("the reason behind an advisory verdict", () => {
    it("should name what a skill conflicts with rather than only that it is incompatible", () => {
      const categories: CategoryRow[] = [
        createCategory("web-framework", "Framework", [
          createOption("web-framework-react", {
            state: { status: "incompatible", reason: "conflicts with Vue Composition Api" },
          }),
          createOption("web-framework-solidjs"),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories, showLabels: true });
      cleanup = unmount;

      expect(lastFrame()).toContain("(incompatible: conflicts with Vue Composition Api)");
    });

    it("should carry the author's own words for a discouraged skill", () => {
      const categories: CategoryRow[] = [
        createCategory("web-client-state", "Client State", [
          createOption("web-state-redux-toolkit", {
            state: { status: "discouraged", reason: "Complex for most apps" },
          }),
          createOption("web-state-zustand"),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories, showLabels: true });
      cleanup = unmount;

      expect(lastFrame()).toContain("(discouraged: Complex for most apps)");
    });

    it("should state an unreachable requirement in full rather than abbreviating it", () => {
      const categories: CategoryRow[] = [
        createCategory("web-framework", "Framework", [
          createOption("web-framework-react", {
            state: {
              status: "incompatible",
              reason:
                "requires Vue Composition Api or SolidJS (all conflict with current selection)",
            },
          }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories, showLabels: true });
      cleanup = unmount;

      // The widest cell the shipped catalogue can produce still renders whole: the
      // tag grows to fit and neighbours wrap, exactly as unmetRequirementsReason does.
      expect(lastFrame()).toContain(
        "(incompatible: requires Vue Composition Api or SolidJS (all conflict with current selection))",
      );
    });

    it("should leave an unfocused cell to its colour rather than painting every reason at once", () => {
      const categories: CategoryRow[] = [
        createCategory("web-framework", "Framework", [
          createOption("web-framework-react"),
          createOption("web-framework-vue-composition-api", {
            state: { status: "incompatible", reason: "conflicts with React" },
          }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories, showLabels: true });
      cleanup = unmount;

      expect(lastFrame()).not.toContain("conflicts with React");
    });
  });

  describe("option ordering", () => {
    it("should preserve original order regardless of state", () => {
      const categories: CategoryRow[] = [
        createCategory("web-client-state", "State", [
          createOption("web-state-jotai"),
          createOption("web-state-zustand"),
          createOption("web-state-redux-toolkit", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
          createOption("web-state-mobx"),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame()!;
      const jotaiIdx = output.indexOf("Jotai");
      const zustandIdx = output.indexOf("Zustand");
      const reduxIdx = output.indexOf("Redux");
      const mobxIdx = output.indexOf("MobX");

      // Order should match the input array, not be sorted by state
      expect(jotaiIdx).toBeLessThan(zustandIdx);
      expect(zustandIdx).toBeLessThan(reduxIdx);
      expect(reduxIdx).toBeLessThan(mobxIdx);
    });

    it("should not change order when a skill is selected", () => {
      const categoriesBefore: CategoryRow[] = [
        createCategory("web-client-state", "State", [
          createOption("web-state-jotai"),
          createOption("web-state-zustand"),
          createOption("web-state-redux-toolkit"),
        ]),
      ];

      const categoriesAfter: CategoryRow[] = [
        createCategory("web-client-state", "State", [
          createOption("web-state-jotai"),
          createOption("web-state-zustand", { selected: true }),
          createOption("web-state-redux-toolkit"),
        ]),
      ];

      const { lastFrame: frameBefore, unmount: unmountBefore } = renderGrid({
        categories: categoriesBefore,
      });
      const outputBefore = frameBefore()!;
      unmountBefore();

      const { lastFrame: frameAfter, unmount: unmountAfter } = renderGrid({
        categories: categoriesAfter,
      });
      cleanup = unmountAfter;
      const outputAfter = frameAfter()!;

      // Verify order is preserved: Jotai < Zustand < Redux in both
      expect(outputBefore.indexOf("Jotai")).toBeLessThan(outputBefore.indexOf("Zustand"));
      expect(outputBefore.indexOf("Zustand")).toBeLessThan(outputBefore.indexOf("Redux"));
      expect(outputAfter.indexOf("Jotai")).toBeLessThan(outputAfter.indexOf("Zustand"));
      expect(outputAfter.indexOf("Zustand")).toBeLessThan(outputAfter.indexOf("Redux"));
    });

    it("should not change order when a skill state changes from normal to discouraged", () => {
      const categoriesBefore: CategoryRow[] = [
        createCategory("web-client-state", "State", [
          createOption("web-state-jotai"),
          createOption("web-state-zustand"),
          createOption("web-state-redux-toolkit"),
        ]),
      ];

      const categoriesAfter: CategoryRow[] = [
        createCategory("web-client-state", "State", [
          createOption("web-state-jotai"),
          createOption("web-state-zustand", {
            state: { status: "discouraged", reason: "Prefer the alternative" },
          }),
          createOption("web-state-redux-toolkit"),
        ]),
      ];

      const { lastFrame: frameBefore, unmount: unmountBefore } = renderGrid({
        categories: categoriesBefore,
      });
      const outputBefore = frameBefore()!;
      unmountBefore();

      const { lastFrame: frameAfter, unmount: unmountAfter } = renderGrid({
        categories: categoriesAfter,
      });
      cleanup = unmountAfter;
      const outputAfter = frameAfter()!;

      // Zustand stays in the middle even after becoming discouraged
      expect(outputBefore.indexOf("Jotai")).toBeLessThan(outputBefore.indexOf("Zustand"));
      expect(outputBefore.indexOf("Zustand")).toBeLessThan(outputBefore.indexOf("Redux"));
      expect(outputAfter.indexOf("Jotai")).toBeLessThan(outputAfter.indexOf("Zustand"));
      expect(outputAfter.indexOf("Zustand")).toBeLessThan(outputAfter.indexOf("Redux"));
    });
  });

  describe("edge cases", () => {
    it("should handle single category", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Single Category", [createOption("web-forms-react-hook-form")]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Single Category");
      expect(output).toContain("React Hook Form");
    });

    it("should handle single option in category", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Single", [createOption("web-forms-react-hook-form")]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React Hook Form");
    });

    it("should handle category with many options (flows naturally)", () => {
      const manySkillIds: SkillId[] = [
        "web-framework-react",
        "web-framework-vue-composition-api",
        "web-framework-angular-standalone",
        "web-framework-solidjs",
        "web-meta-framework-nuxt",
        "web-meta-framework-remix",
        "web-meta-framework-nextjs",
        "web-styling-tailwind",
        "web-styling-scss-modules",
      ];
      const options = manySkillIds.map((id) => createOption(id));
      const categories: CategoryRow[] = [createCategory("web-mocking", "Many Options", options)];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Many Options");
      // All options should be present (no fixed row limit)
      expect(output).toContain("React");
      expect(output).toContain("SCSS Modules");
    });

    it("should handle long display names", () => {
      const categories: CategoryRow[] = [
        createCategory("web-i18n", "Long Labels", [
          createOption("web-i18n-next-intl"),
          createOption("web-i18n-react-intl"),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      // Display names should be rendered (flowing layout handles long names)
      expect(output).toContain("Next Intl");
    });

    it("should handle categories with different option counts", () => {
      const categories: CategoryRow[] = [
        createCategory("web-framework", "Category 1", [
          createOption("web-forms-react-hook-form"),
          createOption("web-forms-vee-validate"),
        ]),
        createCategory("web-styling", "Category 2", [createOption("web-forms-zod-validation")]),
        createCategory("web-client-state", "Category 3", [
          createOption("web-testing-vitest"),
          createOption("web-testing-playwright-e2e"),
          createOption("web-testing-react-testing-library"),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Category 1");
      expect(output).toContain("Category 2");
      expect(output).toContain("Category 3");
    });
  });

  describe("column adjustment", () => {
    it("should adjust focusedCol when changing to row with fewer options", async () => {
      const onFocusChange = vi.fn();
      const categories: CategoryRow[] = [
        createCategory("web-framework", "Framework", [
          createOption("web-forms-react-hook-form", { selected: true }), // Framework selected
          createOption("web-forms-vee-validate"),
          createOption("web-forms-zod-validation"),
        ]),
        createCategory("web-styling", "Category 2", [createOption("web-testing-vitest")]),
      ];

      const { stdin, unmount } = renderGrid({
        categories,
        defaultFocusedRow: 0,
        defaultFocusedCol: 2, // Last option in first row
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      // Should move to row 1, and col should be clamped to 0 (only option)
      expect(onFocusChange).toHaveBeenCalledWith(1, 0);
    });
  });

  describe("installed skills", () => {
    it("should render installed skill with display name (no checkmark icon)", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", { installed: true }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).not.toContain("✓");
      expect(output).toContain("React Hook Form");
    });

    it("should render installed and selected skill with display name only", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", {
            installed: true,
            selected: true,
          }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).not.toContain("✓");
      expect(output).toContain("React Hook Form");
    });

    it("should render local installed skill without L badge or checkmark", () => {
      const categories: CategoryRow[] = [
        createCategory("web-forms", "Forms", [
          createOption("web-forms-react-hook-form", { local: true, installed: true }),
        ]),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).not.toContain("✓");
      expect(output).toContain("React Hook Form");
    });
  });

  describe("natural flow (no virtual scroll)", () => {
    it("should render all categories without scroll indicators", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Framework");
      expect(output).toContain("Styling");
      expect(output).toContain("Client State");
      expect(output).toContain("Server State");
      expect(output).toContain("Analytics");
      expect(output).not.toContain("more categories");
    });

    it("should render all categories even with many entries", () => {
      const { lastFrame, unmount } = renderGrid({
        categories: manyCategories,
      });
      cleanup = unmount;

      const output = lastFrame();
      for (const category of manyCategories) {
        expect(output).toContain(category.displayName);
      }
      expect(output).not.toContain("more categories");
    });

    it("should keep focused category visible when navigating down", async () => {
      const onFocusChange = vi.fn();

      const { stdin, lastFrame, unmount } = renderGrid({
        categories: navCategories,
        defaultFocusedRow: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      const output = lastFrame();
      expect(output).toContain("Category 3");
    });
  });

  describe("selection counter", () => {
    it("should show 'X of 1' for exclusive categories with no selection", () => {
      const categories = [
        createCategory(
          "web-framework",
          "Framework",
          [createOption("web-framework-react"), createOption("web-framework-vue-composition-api")],
          { exclusive: true },
        ),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("(0 of 1)");
    });

    it("should show '1 of 1' for exclusive categories with one selection", () => {
      const categories = [
        createCategory(
          "web-framework",
          "Framework",
          [
            createOption("web-framework-react", { selected: true }),
            createOption("web-framework-vue-composition-api"),
          ],
          { exclusive: true },
        ),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("(1 of 1)");
    });

    it("should not show counter for non-exclusive categories", () => {
      const categories = [
        createCategory(
          "web-testing",
          "Testing",
          [
            createOption("web-testing-vitest", { selected: true }),
            createOption("web-testing-playwright-e2e", { selected: true }),
            createOption("web-testing-cypress-e2e"),
          ],
          { exclusive: false },
        ),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).not.toContain("selected)");
      expect(output).not.toContain("of 1)");
    });

    it("should only show counter for exclusive categories in mixed layout", () => {
      const categories = [
        createCategory(
          "web-framework",
          "Framework",
          [
            createOption("web-framework-react", { selected: true }),
            createOption("web-framework-vue-composition-api"),
          ],
          { exclusive: true },
        ),
        createCategory(
          "web-testing",
          "Testing",
          [
            createOption("web-testing-vitest", { selected: true }),
            createOption("web-testing-playwright-e2e", { selected: true }),
            createOption("web-testing-cypress-e2e"),
          ],
          { exclusive: false },
        ),
      ];

      const { lastFrame, unmount } = renderGrid({ categories });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("(1 of 1)");
      expect(output).not.toContain("selected)");
    });
  });
});
