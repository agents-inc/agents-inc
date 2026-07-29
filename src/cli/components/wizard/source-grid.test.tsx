import chalk from "chalk";
import { render } from "ink-testing-library";
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { SourceGrid, type SourceGridProps, type SourceRow, type SourceOption } from "./source-grid";
import type { BoundSkillCandidate, SkillId, SkillScope } from "../../types";
import { CLI_COLORS, UI_SYMBOLS } from "../../consts";
import { getSkillById, initializeMatrix } from "../../lib/matrix/matrix-provider";
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

/** chalk's truecolor level — the 24-bit mode that emits the hex colours CLI_COLORS declares. */
const TRUECOLOR_CHALK_LEVEL = 3;

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

/** A saved skill deselected this session: visible, inert, pending removal on save. */
const createRemovedRow = (
  skillId: SkillId,
  options: SourceOption[],
  scope: SkillScope,
): SourceRow => ({
  ...createSourceRow(skillId, options, scope),
  disabled: true,
});

/** A skill selected this session but absent from the saved config: visible, editable, marked added. */
const createAddedRow = (
  skillId: SkillId,
  options: SourceOption[],
  scope: SkillScope,
): SourceRow => ({
  ...createSourceRow(skillId, options, scope),
  added: true,
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

  describe("removed (disabled) rows", () => {
    const removedRows: SourceRow[] = [
      createSourceRow(
        "web-framework-react",
        [createSourceOption("public", { selected: true })],
        "project",
      ),
      createRemovedRow(
        "web-testing-vitest",
        [createSourceOption("eject", { selected: true }), createSourceOption("public")],
        "project",
      ),
    ];

    it("should keep the removed skill visible", () => {
      const { lastFrame, unmount } = renderGrid({ rows: removedRows });
      cleanup = unmount;

      expect(lastFrame()).toContain("Vitest");
    });

    it("should mark the removed skill with the pending-removal marker and no lock", () => {
      const { lastFrame, unmount } = renderGrid({ rows: removedRows });
      cleanup = unmount;

      const output = lastFrame()!;
      // Same marker the info panel prints for removals, so both surfaces read consistently.
      expect(output).toContain(`${UI_SYMBOLS.REMOVED} Vitest`);
      // A lock means "installed globally, not editable here" — the wrong message for a removal.
      expect(output).not.toContain(UI_SYMBOLS.LOCK);
    });

    it("should show the persisted source indicator on the removed skill", () => {
      const { lastFrame, unmount } = renderGrid({ rows: removedRows });
      cleanup = unmount;

      expect(lastFrame()).toContain(UI_SYMBOLS.SELECTED);
    });

    it("should not fire onSelect when space is pressed with a removed row focused", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: [removedRows[1]],
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onSelect,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      expect(onSelect).not.toHaveBeenCalled();
    });

    it("should skip removed rows during navigation", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: removedRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      // Row 1 is removed, so moving down wraps straight back to the editable row 0.
      stdin.write(ARROW_DOWN);
      await delay(INPUT_DELAY_MS);

      expect(onFocusChange).toHaveBeenLastCalledWith(0, 0);
    });

    it("should not focus a removed row when it is the default focus target", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: removedRows,
        defaultFocusedRow: 1, // The removed row — focus must fall back to the editable row.
        defaultFocusedCol: 0,
        onSelect,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(SPACE);
      await delay(INPUT_DELAY_MS);

      expect(onSelect).toHaveBeenCalledWith("web-framework-react", "public");
    });

    it("should not show search pill on removed rows", () => {
      const mockSearch = vi.fn<(alias: string) => Promise<BoundSkillCandidate[]>>();
      const { lastFrame, unmount } = renderGrid({
        rows: [removedRows[1]],
        onSearch: mockSearch,
      });
      cleanup = unmount;

      const output = lastFrame()!;
      expect(output).toContain("Vitest");
      expect(output).not.toContain("Search");
    });

    it("should not show focus highlight on removed rows", () => {
      const { lastFrame, unmount } = renderGrid({
        rows: [removedRows[1]],
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
      });
      cleanup = unmount;

      expect(lastFrame()).not.toContain(UI_SYMBOLS.CHEVRON);
    });

    /**
     * A skill installed at BOTH scopes whose project copy is removed this session: the surviving
     * global install renders as a locked row and the emptied project slot as a pending-removal
     * row, so ONE skill occupies TWO rows — the shape the confirm step already prints as `-` at
     * Project plus `•` at Global. Both rows are inert, and `groupRowsByScope` labels the sections
     * because both scopes are present.
     */
    describe("collapsed dual-scope pair", () => {
      const COLLAPSED_SKILL_ID: SkillId = "web-framework-react";
      const UNTOUCHED_SKILL_ID: SkillId = "web-state-zustand";

      const collapsedPairRows: SourceRow[] = [
        createSourceRow(
          COLLAPSED_SKILL_ID,
          [createSourceOption("public", { selected: true })],
          "global",
          true,
        ),
        createRemovedRow(
          COLLAPSED_SKILL_ID,
          [createSourceOption("public", { selected: true })],
          "project",
        ),
      ];

      /**
       * Ink colourises through chalk, and chalk disables itself on vitest's non-TTY stdout — the
       * frame would come back stripped of colour, making a colour assertion unobservable. Forcing
       * truecolor for the duration of these tests renders what a user sees in a real terminal.
       */
      let previousChalkLevel: typeof chalk.level;

      beforeEach(() => {
        previousChalkLevel = chalk.level;
        chalk.level = TRUECOLOR_CHALK_LEVEL;
      });

      afterEach(() => {
        chalk.level = previousChalkLevel;
      });

      it("should render the same skill in both scope sections, locked at global and pending removal at project", () => {
        const { lastFrame, unmount } = renderGrid({ rows: collapsedPairRows });
        cleanup = unmount;

        const output = lastFrame()!;
        const skillName = getSkillById(COLLAPSED_SKILL_ID).displayName;
        // Both scope sections are labelled, and the skill name appears once under each — proven by
        // its two distinct role prefixes rather than by counting occurrences.
        expect(output).toContain("Global");
        expect(output).toContain("Project");
        expect(
          output,
          `the surviving global install must keep its lock. Frame:\n${JSON.stringify(output)}`,
        ).toContain(`${UI_SYMBOLS.LOCK} ${skillName}`);
        expect(
          output,
          `the emptied project slot must carry the removal marker. Frame:\n${JSON.stringify(output)}`,
        ).toContain(`${UI_SYMBOLS.REMOVED} ${skillName}`);
        // Neither half is an addition, and the removal half is not a second lock.
        expect(output).not.toContain(`${UI_SYMBOLS.ADDED} ${skillName}`);
      });

      it("should render the project instance of the pair in the removed-diff colour", () => {
        const { lastFrame, unmount } = renderGrid({ rows: collapsedPairRows });
        cleanup = unmount;

        const output = lastFrame()!;
        const skillName = getSkillById(COLLAPSED_SKILL_ID).displayName;
        // Same red the info panel prints removals in (DIFF_COLOR in skill-agent-summary.tsx), so
        // the pair reads as "removed here, kept there" on both surfaces. Unfocused: focus seeds on
        // the first FOCUSABLE row and every row here is inert, so no row paints its focus form.
        expect(
          output,
          `the pending-removal row must render in the removed-diff colour. Frame:\n${JSON.stringify(output)}`,
        ).toContain(chalk.hex(CLI_COLORS.ERROR)(`${UI_SYMBOLS.REMOVED} ${skillName}`));
      });

      it("should not fire onSelect when space is pressed on an all-inert collapsed pair", async () => {
        const onSelect = vi.fn();
        const { stdin, unmount } = renderGrid({
          rows: collapsedPairRows,
          defaultFocusedRow: 0,
          defaultFocusedCol: 0,
          onSelect,
        });
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);
        stdin.write(SPACE);
        await delay(INPUT_DELAY_MS);

        expect(onSelect).not.toHaveBeenCalled();
      });

      it("should not show focus highlight on either row of the collapsed pair", () => {
        const { lastFrame, unmount } = renderGrid({
          rows: collapsedPairRows,
          defaultFocusedRow: 0,
          defaultFocusedCol: 0,
        });
        cleanup = unmount;

        expect(lastFrame()).not.toContain(UI_SYMBOLS.CHEVRON);
      });

      it("should skip both rows of the collapsed pair and act on the editable row instead", async () => {
        const onSelect = vi.fn();
        const { stdin, unmount } = renderGrid({
          rows: [
            ...collapsedPairRows,
            createSourceRow(
              UNTOUCHED_SKILL_ID,
              [createSourceOption("public", { selected: true })],
              "project",
            ),
          ],
          // The locked half of the pair — focus must fall through it AND the pending-removal row.
          defaultFocusedRow: 0,
          defaultFocusedCol: 0,
          onSelect,
        });
        cleanup = unmount;

        await delay(RENDER_DELAY_MS);
        stdin.write(SPACE);
        await delay(INPUT_DELAY_MS);

        expect(onSelect).toHaveBeenCalledWith(UNTOUCHED_SKILL_ID, "public");
        expect(onSelect).not.toHaveBeenCalledWith(COLLAPSED_SKILL_ID, "public");
      });
    });
  });

  describe("added rows", () => {
    const ADDED_SKILL_ID: SkillId = "web-framework-react";

    const addedRows: SourceRow[] = [
      createAddedRow(ADDED_SKILL_ID, [createSourceOption("public", { selected: true })], "project"),
      createSourceRow(
        "web-state-zustand",
        [createSourceOption("public", { selected: true })],
        "project",
      ),
    ];

    /**
     * Ink colourises through chalk, and chalk disables itself on vitest's non-TTY stdout — every
     * frame would come back stripped of colour, making a colour assertion unobservable. Forcing
     * truecolor for the duration of these tests renders what a user sees in a real terminal.
     */
    let previousChalkLevel: typeof chalk.level;

    beforeEach(() => {
      previousChalkLevel = chalk.level;
      chalk.level = TRUECOLOR_CHALK_LEVEL;
    });

    afterEach(() => {
      chalk.level = previousChalkLevel;
    });

    it("should mark the added skill with the added marker", () => {
      const { lastFrame, unmount } = renderGrid({
        rows: addedRows,
        defaultFocusedRow: 1,
        defaultFocusedCol: 0,
      });
      cleanup = unmount;

      const output = lastFrame()!;
      // Same marker the info panel prints for additions, so both surfaces read consistently.
      expect(output).toContain(`${UI_SYMBOLS.ADDED} ${getSkillById(ADDED_SKILL_ID).displayName}`);
    });

    it("should keep the added-diff colour on the added row while it is focused", () => {
      const { lastFrame, unmount } = renderGrid({
        rows: addedRows,
        defaultFocusedRow: 0,
        defaultFocusedCol: 0,
      });
      cleanup = unmount;

      // The focused branch renders the status glyph (`+ `) followed by the focus-padded
      // name (` React `), on the focus background.
      const focusedLabel = `${UI_SYMBOLS.ADDED}  ${getSkillById(ADDED_SKILL_ID).displayName} `;
      const output = lastFrame()!;

      // Focus must stay visible (background highlight) AND the label must keep the added-diff
      // green the info panel uses (DIFF_COLOR in skill-agent-summary.tsx) — focus is not a
      // reason to lose the diff signal.
      expect(
        output,
        `a focused added row must keep its added-diff colour. Frame:\n${JSON.stringify(output)}`,
      ).toContain(chalk.bgHex(CLI_COLORS.LABEL_BG)(chalk.hex(CLI_COLORS.SUCCESS)(focusedLabel)));

      // Today's rendering: focus overrides the label colour with plain white, so the row reads
      // as an ordinary focused row and the addition becomes invisible in colour terms.
      expect(
        output,
        "a focused added row must not fall back to the plain white label colour",
      ).not.toContain(chalk.bgHex(CLI_COLORS.LABEL_BG)(chalk.hex(CLI_COLORS.WHITE)(focusedLabel)));
    });
  });
});
