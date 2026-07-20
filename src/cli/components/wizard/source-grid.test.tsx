import { render } from "ink-testing-library";
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { SourceGrid, type SourceGridProps, type SourceRow, type SourceOption } from "./source-grid";
import type { BoundSkillCandidate, SkillId, SkillScope } from "../../types";
import { UI_SYMBOLS } from "../../consts";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { createMockSkill } from "../../lib/__tests__/factories/skill-factories";
import { createMockMatrix } from "../../lib/__tests__/factories/matrix-factories";
import { WEB_TRIO_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import {
  ARROW_UP,
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ENTER,
  SPACE,
  ESCAPE,
  RENDER_DELAY_MS,
  INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";

const createSourceOption = (id: string, overrides: Partial<SourceOption> = {}): SourceOption => ({
  id,
  selected: false,
  installed: false,
  ...overrides,
});

const createSourceRow = (
  skillId: SkillId,
  options: SourceOption[],
  scope?: SkillScope,
  readOnly?: boolean,
): SourceRow => ({
  skillId,
  options,
  scope,
  ...(readOnly ? { readOnly } : {}),
});

const defaultRows: SourceRow[] = [
  createSourceRow("web-framework-react", [createSourceOption("public", { selected: true })]),
  createSourceRow("web-state-zustand", [createSourceOption("public", { selected: true })]),
  createSourceRow("web-testing-vitest", [createSourceOption("public", { selected: true })]),
];

const multiSourceRows: SourceRow[] = [
  createSourceRow("web-framework-react", [
    createSourceOption("public", { selected: true }),
    createSourceOption("acme-corp"),
  ]),
  createSourceRow("web-state-zustand", [
    createSourceOption("public", { selected: true }),
    createSourceOption("acme-corp"),
    createSourceOption("internal"),
  ]),
];

const defaultProps: SourceGridProps = {
  rows: defaultRows,
  defaultFocusedRow: 0,
  defaultFocusedCol: 0,
  onSelect: vi.fn(),
  onFocusChange: vi.fn(),
};

const renderGrid = (props: Partial<SourceGridProps> = {}) => {
  return render(<SourceGrid {...defaultProps} {...props} />);
};

describe("SourceGrid component", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    initializeMatrix(WEB_TRIO_MATRIX);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    initializeMatrix(BUILT_IN_MATRIX);
  });

  describe("rendering", () => {
    it("should render all skill rows", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React");
      expect(output).toContain("Zustand");
      expect(output).toContain("Vitest");
    });

    it("should render source option labels", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Public");
    });

    it("should render multiple source options per row", () => {
      const { lastFrame, unmount } = renderGrid({ rows: multiSourceRows });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Public");
      expect(output).toContain("acme-corp");
    });

    it("should handle empty rows array", () => {
      const { lastFrame, unmount } = renderGrid({ rows: [] });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("No skills to display");
    });

    it("should render single row", () => {
      const rows: SourceRow[] = [
        createSourceRow("web-framework-react", [createSourceOption("public", { selected: true })]),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React");
      expect(output).toContain("Public");
    });
  });

  describe("scope-grouped rendering", () => {
    it("should render scope labels when rows have mixed scopes", () => {
      const rows: SourceRow[] = [
        createSourceRow(
          "web-framework-react",
          [createSourceOption("public", { selected: true })],
          "global",
        ),
        createSourceRow(
          "web-state-zustand",
          [createSourceOption("public", { selected: true })],
          "project",
        ),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Global");
      expect(output).toContain("Project");
    });

    it("should render flat (no scope labels) when all rows share the same scope", () => {
      const rows: SourceRow[] = [
        createSourceRow(
          "web-framework-react",
          [createSourceOption("public", { selected: true })],
          "global",
        ),
        createSourceRow(
          "web-state-zustand",
          [createSourceOption("public", { selected: true })],
          "global",
        ),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).not.toContain("Global");
      expect(output).not.toContain("Project");
    });

    it("should render flat when no rows have scope set", () => {
      const rows: SourceRow[] = [
        createSourceRow("web-framework-react", [createSourceOption("public", { selected: true })]),
        createSourceRow("web-state-zustand", [createSourceOption("public", { selected: true })]),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).not.toContain("Global");
      expect(output).not.toContain("Project");
    });

    it("should show global rows before project rows", () => {
      const rows: SourceRow[] = [
        createSourceRow(
          "web-state-zustand",
          [createSourceOption("public", { selected: true })],
          "project",
        ),
        createSourceRow(
          "web-framework-react",
          [createSourceOption("public", { selected: true })],
          "global",
        ),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      const output = lastFrame()!;
      const globalPos = output.indexOf("React");
      const projectPos = output.indexOf("Zustand");
      expect(globalPos).toBeGreaterThan(-1);
      expect(projectPos).toBeGreaterThan(-1);
      expect(globalPos).toBeLessThan(projectPos);
    });
  });

  describe("keyboard navigation - vertical", () => {
    it("should move down with arrow down", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(1, 0);
    });

    it("should move up with arrow up", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 1,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 0);
    });

    it("should wrap down to first row from last row", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 2, // Last row (Vitest)
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 0);
    });

    it("should wrap up to last row from first row", async () => {
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

      expect(onFocusChange).toHaveBeenCalledWith(2, 0);
    });

    it("should clamp column when moving to row with fewer options", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: multiSourceRows,
        defaultFocusedRow: 1, // Zustand has 3 options
        defaultFocusedCol: 2, // Internal (index 2)
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_UP);
      await delay(INPUT_DELAY_MS);

      // Vertical navigation clamps column to last valid index
      expect(onFocusChange).toHaveBeenCalledWith(0, 1);
    });
  });

  describe("keyboard navigation - horizontal", () => {
    it("should move right with arrow right", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: multiSourceRows,
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

    it("should move left with arrow left", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: multiSourceRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 1,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_LEFT);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 0);
    });

    it("should wrap right to first column from last column", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: multiSourceRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 1, // Last option in React row
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_RIGHT);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 0);
    });

    it("should wrap left to last column from first column", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: multiSourceRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_LEFT);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenCalledWith(0, 1);
    });
  });

  describe("selection", () => {
    it("should call onSelect when pressing space", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onSelect,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(" ");
      await delay(INPUT_DELAY_MS);

      expect(onSelect).toHaveBeenCalledWith("web-framework-react", "public");
    });

    it("should call onSelect with correct skill and source IDs", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: multiSourceRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 1, // Acme Corp
        onSelect,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(" ");
      await delay(INPUT_DELAY_MS);

      expect(onSelect).toHaveBeenCalledWith("web-framework-react", "acme-corp");
    });

    it("should call onSelect on second row", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: multiSourceRows,
        defaultFocusedRow: 1,
        defaultFocusedCol: 2, // Internal
        onSelect,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(" ");
      await delay(INPUT_DELAY_MS);

      expect(onSelect).toHaveBeenCalledWith("web-state-zustand", "internal");
    });
  });

  describe("edge cases", () => {
    it("should handle single option per row", async () => {
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

      // Should wrap to 0 (only one option)
      expect(onFocusChange).toHaveBeenCalledWith(0, 0);
    });

    it("should handle many rows", () => {
      const skillIds: SkillId[] = [
        "web-framework-react",
        "web-framework-vue-composition-api",
        "web-styling-tailwind",
        "web-styling-scss-modules",
        "web-state-zustand",
        "web-state-mobx",
        "web-testing-vitest",
        "web-testing-playwright-e2e",
        "web-server-state-react-query",
        "web-tooling-vite" as SkillId,
      ];
      const skills = Object.fromEntries(skillIds.map((id) => [id, createMockSkill(id)]));
      initializeMatrix(createMockMatrix(skills));

      const rows: SourceRow[] = skillIds.map((id) =>
        createSourceRow(id, [createSourceOption("public", { selected: true })]),
      );

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React");
      expect(output).toContain("Vite");
    });
  });

  describe("search pill", () => {
    const mockSearch = vi.fn<(alias: string) => Promise<BoundSkillCandidate[]>>();
    const mockBind = vi.fn();
    const mockSearchStateChange = vi.fn();

    const searchCandidates: BoundSkillCandidate[] = [
      {
        id: "web-framework-react-pro" as SkillId,
        sourceUrl: "github:awesome-dev/skills",
        sourceName: "awesome-dev",
        alias: "react",
      },
      {
        id: "web-framework-react-strict" as SkillId,
        sourceUrl: "github:team-xyz/skills",
        sourceName: "team-xyz",
        alias: "react",
      },
    ];

    afterEach(() => {
      mockSearch.mockReset();
      mockBind.mockReset();
      mockSearchStateChange.mockReset();
    });

    it("should render search pill at end of each row when onSearch is provided", () => {
      const { lastFrame, unmount } = renderGrid({
        onSearch: mockSearch,
      });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("Search");
    });

    it("should not render search pill when onSearch is not provided", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).not.toContain("Search");
    });

    it("should navigate to search pill with arrow right", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: defaultRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0, // On the only option (Public)
        onFocusChange,
        onSearch: mockSearch,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_RIGHT);
      await delay(INPUT_DELAY_MS);

      // Public is at index 0, search pill at index 1
      expect(onFocusChange).toHaveBeenCalledWith(0, 1);
    });

    it("should not call onSelect when space is pressed on search pill", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: defaultRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 1, // Search pill position (after Public)
        onSelect,
        onSearch: mockSearch,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(" ");
      await delay(INPUT_DELAY_MS);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("should trigger search on Space when search pill is focused", async () => {
      mockSearch.mockResolvedValue(searchCandidates);

      const { stdin, unmount } = renderGrid({
        rows: defaultRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 1, // Search pill position
        onSearch: mockSearch,
        onSearchStateChange: mockSearchStateChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      expect(mockSearch).toHaveBeenCalledWith("react");
      expect(mockSearchStateChange).toHaveBeenCalledWith(true);
    });

    it("should render modal with results after search completes", async () => {
      mockSearch.mockResolvedValue(searchCandidates);

      const { stdin, lastFrame, unmount } = renderGrid({
        rows: defaultRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 1,
        onSearch: mockSearch,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      // Wait for async search to resolve
      await delay(RENDER_DELAY_MS);

      const output = lastFrame();
      expect(output).toContain("react");
      expect(output).toContain("awesome-dev");
      expect(output).toContain("team-xyz");
    });

    it("should close modal on Escape without binding", async () => {
      mockSearch.mockResolvedValue(searchCandidates);

      const { stdin, lastFrame, unmount } = renderGrid({
        rows: defaultRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 1,
        onSearch: mockSearch,
        onBind: mockBind,
        onSearchStateChange: mockSearchStateChange,
      });
      cleanup = unmount;

      // Open modal
      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(RENDER_DELAY_MS);

      // Close modal
      stdin.write(ESCAPE);
      await delay(INPUT_DELAY_MS);

      expect(mockBind).not.toHaveBeenCalled();
      expect(mockSearchStateChange).toHaveBeenLastCalledWith(false);

      const output = lastFrame();
      expect(output).not.toContain("awesome-dev");
    });

    it("should not respond to grid navigation while modal is open", async () => {
      mockSearch.mockResolvedValue(searchCandidates);
      const onFocusChange = vi.fn();

      const { stdin, unmount } = renderGrid({
        rows: defaultRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 1,
        onSearch: mockSearch,
        onFocusChange,
      });
      cleanup = unmount;

      // Open modal
      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(RENDER_DELAY_MS);

      // Try grid navigation while modal is open
      onFocusChange.mockClear();
      stdin.write(ARROW_LEFT);
      await delay(INPUT_DELAY_MS);
      stdin.write(ARROW_RIGHT);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).not.toHaveBeenCalled();
    });

    it("should bind result on Enter in modal", async () => {
      mockSearch.mockResolvedValue(searchCandidates);

      const { stdin, unmount } = renderGrid({
        rows: defaultRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 1,
        onSearch: mockSearch,
        onBind: mockBind,
        onSearchStateChange: mockSearchStateChange,
      });
      cleanup = unmount;

      // Open modal with Space
      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(RENDER_DELAY_MS);

      // Bind first result
      stdin.write(ENTER);
      await delay(INPUT_DELAY_MS);

      expect(mockBind).toHaveBeenCalledWith(searchCandidates[0]);
      expect(mockSearchStateChange).toHaveBeenLastCalledWith(false);
    });
  });

  describe("read-only rows", () => {
    const readOnlyRows: SourceRow[] = [
      createSourceRow(
        "web-framework-react",
        [createSourceOption("public", { selected: true }), createSourceOption("eject")],
        "global",
        true,
      ),
      createSourceRow(
        "web-state-zustand",
        [createSourceOption("public", { selected: true })],
        "project",
      ),
    ];

    it("should render read-only rows with lock indicator", () => {
      const { lastFrame, unmount } = renderGrid({ rows: readOnlyRows });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain(UI_SYMBOLS.LOCK);
    });

    it("should render read-only rows with dimmed styling", () => {
      const { lastFrame, unmount } = renderGrid({ rows: readOnlyRows });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("React");
      expect(output).toContain("Zustand");
    });

    it("should show selected source indicator on read-only rows", () => {
      const { lastFrame, unmount } = renderGrid({ rows: readOnlyRows });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain(UI_SYMBOLS.SELECTED);
    });

    it("should not fire onSelect for read-only rows (defense-in-depth guard)", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: readOnlyRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onSelect,
      });
      cleanup = unmount;

      // defaultFocusedRow 0 is readOnly, so focus adjusts to row 1
      // Pressing space on non-readOnly row 1 fires onSelect for that row
      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      expect(onSelect).toHaveBeenCalledWith("web-state-zustand", "public");
    });

    it("should skip read-only rows during navigation", async () => {
      const threeRows: SourceRow[] = [
        createSourceRow(
          "web-framework-react",
          [createSourceOption("public", { selected: true })],
          "global",
          true,
        ),
        createSourceRow(
          "web-state-zustand",
          [createSourceOption("public", { selected: true })],
          "project",
        ),
        createSourceRow(
          "web-testing-vitest",
          [createSourceOption("public", { selected: true })],
          "global",
          true,
        ),
      ];

      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: threeRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      // Initial focus skips readOnly row 0, lands on row 1
      await delay(RENDER_DELAY_MS);

      // Pressing down from row 1 should skip readOnly row 2 and wrap back to row 1
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenLastCalledWith(1, 0);
    });

    it("should allow selection on non-read-only rows after navigating past read-only", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: readOnlyRows,
        defaultFocusedRow: 1,
        defaultFocusedCol: 0,
        onSelect,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      expect(onSelect).toHaveBeenCalledWith("web-state-zustand", "public");
    });

    it("should not show search pill on read-only rows", () => {
      const mockSearch = vi.fn<(alias: string) => Promise<BoundSkillCandidate[]>>();
      const { lastFrame, unmount } = renderGrid({
        rows: [
          createSourceRow(
            "web-framework-react",
            [createSourceOption("public", { selected: true })],
            "global",
            true,
          ),
        ],
        onSearch: mockSearch,
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("React");
      expect(output).not.toContain("Search");
    });

    it("should not show focus highlight on read-only rows", () => {
      const allReadOnlyRows: SourceRow[] = [
        createSourceRow(
          "web-framework-react",
          [createSourceOption("public", { selected: true })],
          "global",
          true,
        ),
        createSourceRow(
          "web-state-zustand",
          [createSourceOption("public", { selected: true })],
          "global",
          true,
        ),
      ];

      const { lastFrame, unmount } = renderGrid({
        rows: allReadOnlyRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
      });
      cleanup = unmount;

      const output = lastFrame()!;
      // Read-only rows should not have the chevron focus indicator
      expect(output).not.toContain(UI_SYMBOLS.CHEVRON);
    });

    it("should render re-scoped skill in both global and project groups", () => {
      const reSccopedRows: SourceRow[] = [
        createSourceRow(
          "web-framework-react",
          [createSourceOption("eject"), createSourceOption("public", { selected: true })],
          "global",
          true,
        ),
        createSourceRow(
          "web-framework-react",
          [createSourceOption("eject"), createSourceOption("public", { selected: true })],
          "project",
        ),
      ];

      const { lastFrame, unmount } = renderGrid({ rows: reSccopedRows });
      cleanup = unmount;

      const output = lastFrame()!;
      // Should show both scope section headers
      expect(output).toContain("Global");
      expect(output).toContain("Project");
      // React should appear twice (once per scope group)
      const reactMatches = output.split("React").length - 1;
      expect(reactMatches).toBe(2);
      // Global copy should have lock indicator
      expect(output).toContain(UI_SYMBOLS.LOCK);
    });
  });
});
