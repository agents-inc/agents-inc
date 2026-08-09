import chalk from "chalk";
import { render } from "ink-testing-library";
import { describe, expect, it, afterEach, beforeEach, vi } from "vitest";
import { SourceGrid, type SourceGridProps, type SourceRow, type SourceOption } from "./source-grid";
import type { SkillId, SkillScope } from "../../types";
import { CLI_COLORS, INSTALL_MODE_CELL_LABELS, INSTALL_MODES, UI_SYMBOLS } from "../../consts";
import { getSkillById, initializeMatrix } from "../../lib/matrix/matrix-provider";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { createMockSkill } from "../../lib/__tests__/factories/skill-factories";
import { createMockMatrix } from "../../lib/__tests__/factories/matrix-factories";
import { WEB_TRIO_MATRIX } from "../../lib/__tests__/mock-data/mock-matrices";
import { elementAt } from "../../lib/__tests__/helpers/element-at.js";
import {
  ARROW_UP,
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  SPACE,
  RENDER_DELAY_MS,
  INPUT_DELAY_MS,
  delay,
} from "../../lib/__tests__/test-constants";

/** chalk's truecolor level — the 24-bit mode that emits the hex colours CLI_COLORS declares. */
const TRUECOLOR_CHALK_LEVEL = 3;

/** The two install-mode cells every row carries, with `selectedMode` marked. */
const installModeCells = (selectedMode: SourceOption["mode"]): SourceOption[] =>
  INSTALL_MODES.map((mode) => ({ mode, selected: mode === selectedMode }));

const createSourceRow = (
  skillId: SkillId,
  options: SourceOption[],
  scope?: SkillScope,
  readOnly?: boolean,
): SourceRow => ({
  skillId,
  options,
  ...(scope !== undefined && { scope }),
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
  createSourceRow("web-framework-react", installModeCells("plugin")),
  createSourceRow("web-state-zustand", installModeCells("plugin")),
  createSourceRow("web-testing-vitest", installModeCells("plugin")),
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

    it("should caption both install-mode cells on every row", () => {
      const { lastFrame, unmount } = renderGrid();
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain(INSTALL_MODE_CELL_LABELS.eject);
      expect(output).toContain(INSTALL_MODE_CELL_LABELS.plugin);
    });

    it("should handle empty rows array", () => {
      const { lastFrame, unmount } = renderGrid({ rows: [] });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("No skills to display");
    });

    it("should render single row", () => {
      const rows: SourceRow[] = [
        createSourceRow("web-framework-react", installModeCells("plugin")),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React");
      expect(output).toContain(INSTALL_MODE_CELL_LABELS.plugin);
    });
  });

  describe("scope-grouped rendering", () => {
    it("should head each scope block with its own row header and caption no column", () => {
      const rows: SourceRow[] = [
        createSourceRow("web-framework-react", installModeCells("plugin"), "global"),
        createSourceRow("web-state-zustand", installModeCells("plugin"), "project"),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React");
      expect(output).toContain("Zustand");
      // The gutter's row headers are what name the scopes; a caption above them would only repeat
      // what every value in the column already says.
      expect(output).toContain("Global");
      expect(output).toContain("Project");
      expect(output).not.toContain("Scope");
    });

    it("should show global rows before project rows", () => {
      const rows: SourceRow[] = [
        createSourceRow("web-state-zustand", installModeCells("plugin"), "project"),
        createSourceRow("web-framework-react", installModeCells("plugin"), "global"),
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

    /**
     * Column geometry is the contract in a fixed-width table, and neither `toContain` nor a
     * relative-order check can express it: a name rendered one column family too far right
     * satisfies both. The whole-frame snapshot pins every column start at once — including the
     * two-column marker cell every row reserves, which is what keeps the focused row's name in the
     * same column as the unfocused row's.
     *
     * It also pins the one thing above the rows: nothing. The scope gutter heads each block on its
     * block's first row only (the rest indents under it), and no caption row sits over the grid at
     * all — the two install-mode cells caption themselves, so a header would print the same two
     * words directly above themselves.
     *
     * Rows are deliberately lock-free — the 🔒 glyph is double-width, so a locked row would make
     * the name column read as ragged for reasons that have nothing to do with the layout.
     */
    it("heads each block in the gutter and captions nothing above the rows", () => {
      const rows: SourceRow[] = [
        createSourceRow("web-framework-react", installModeCells("plugin"), "global"),
        createSourceRow("web-state-zustand", installModeCells("eject"), "project"),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      expect(lastFrame()).toMatchInlineSnapshot(`
        "
        Global       React                   ❯ Local             Plugin

        Project      Zustand                   Local             Plugin"
      `);
    });

    /**
     * The flat branch renders one block, so it has nothing to head: no gutter, and every column
     * therefore starts SCOPE_COL_WIDTH to the left of where the grouped snapshot above puts it, with
     * no separating blank line between rows. Snapshotting both branches is what makes a gutter or a
     * block separator leaking into the flat layout (or vanishing from the grouped one) a visible
     * diff.
     */
    it("renders one unseparated block in the flat layout", () => {
      const rows: SourceRow[] = [
        createSourceRow("web-framework-react", installModeCells("plugin"), "project"),
        createSourceRow("web-state-zustand", installModeCells("eject"), "project"),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      expect(lastFrame()).toMatchInlineSnapshot(`
        "  React                   ❯ Local             Plugin
          Zustand                   Local             Plugin"
      `);
    });

    /** A row with no scope at all takes the same flat branch as a single-scope grid. */
    it("renders one unseparated block when no row has a scope", () => {
      const rows: SourceRow[] = [
        createSourceRow("web-framework-react", installModeCells("plugin")),
        createSourceRow("web-state-zustand", installModeCells("eject")),
      ];

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      expect(lastFrame()).toMatchInlineSnapshot(`
        "  React                   ❯ Local             Plugin
          Zustand                   Local             Plugin"
      `);
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
  });

  describe("keyboard navigation - horizontal", () => {
    it("should move right with arrow right", async () => {
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

    it("should move left with arrow left", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
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
        defaultFocusedRow: 0,
        defaultFocusedCol: 1, // The plugin cell — the row's last
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

      expect(onSelect).toHaveBeenCalledWith("web-framework-react", "eject");
    });

    it("should report the plugin cell when it is the focused one", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 1,
        onSelect,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(" ");
      await delay(INPUT_DELAY_MS);

      expect(onSelect).toHaveBeenCalledWith("web-framework-react", "plugin");
    });

    it("should call onSelect on second row", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 1,
        defaultFocusedCol: 1,
        onSelect,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(" ");
      await delay(INPUT_DELAY_MS);

      expect(onSelect).toHaveBeenCalledWith("web-state-zustand", "plugin");
    });
  });

  describe("edge cases", () => {
    it("should wrap back to the local cell from the plugin cell", async () => {
      const onFocusChange = vi.fn();
      const { stdin, unmount } = renderGrid({
        defaultFocusedRow: 0,
        defaultFocusedCol: 1,
        onFocusChange,
      });
      cleanup = unmount;

      await delay(RENDER_DELAY_MS);
      stdin.write(ARROW_RIGHT);
      await delay(INPUT_DELAY_MS);

      // Two cells, so right from the last wraps to the first
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
        "web-tooling-vite",
      ];
      const skills = Object.fromEntries(skillIds.map((id) => [id, createMockSkill(id)]));
      initializeMatrix(createMockMatrix(skills));

      const rows: SourceRow[] = skillIds.map((id) =>
        createSourceRow(id, installModeCells("plugin")),
      );

      const { lastFrame, unmount } = renderGrid({ rows });
      cleanup = unmount;

      const output = lastFrame();
      expect(output).toContain("React");
      expect(output).toContain("Vite");
    });
  });

  describe("read-only rows", () => {
    const readOnlyRows: SourceRow[] = [
      createSourceRow("web-framework-react", installModeCells("plugin"), "global", true),
      createSourceRow("web-state-zustand", installModeCells("plugin"), "project"),
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

      expect(onSelect).toHaveBeenCalledWith("web-state-zustand", "eject");
    });

    it("should skip read-only rows during navigation", async () => {
      const threeRows: SourceRow[] = [
        createSourceRow("web-framework-react", installModeCells("plugin"), "global", true),
        createSourceRow("web-state-zustand", installModeCells("plugin"), "project"),
        createSourceRow("web-testing-vitest", installModeCells("plugin"), "global", true),
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

      expect(onSelect).toHaveBeenCalledWith("web-state-zustand", "eject");
    });

    it("should not show focus highlight on read-only rows", () => {
      const allReadOnlyRows: SourceRow[] = [
        createSourceRow("web-framework-react", installModeCells("plugin"), "global", true),
        createSourceRow("web-state-zustand", installModeCells("plugin"), "global", true),
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

    it("should render re-scoped skill once per scope group", () => {
      const reSccopedRows: SourceRow[] = [
        createSourceRow("web-framework-react", installModeCells("plugin"), "global", true),
        createSourceRow("web-framework-react", installModeCells("plugin"), "project"),
      ];

      const { lastFrame, unmount } = renderGrid({ rows: reSccopedRows });
      cleanup = unmount;

      const output = lastFrame()!;
      // React should appear twice (once per scope group)
      const reactMatches = output.split("React").length - 1;
      expect(reactMatches).toBe(2);
      // Global copy should have lock indicator
      expect(output).toContain(UI_SYMBOLS.LOCK);
    });
  });

  describe("removed (disabled) rows", () => {
    const removedRows: SourceRow[] = [
      createSourceRow("web-framework-react", installModeCells("plugin"), "project"),
      createRemovedRow("web-testing-vitest", installModeCells("eject"), "project"),
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

    it("should not fire onSelect when space is pressed with a removed row focused", async () => {
      const onSelect = vi.fn();
      const { stdin, unmount } = renderGrid({
        rows: [elementAt(removedRows, 1)],
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

      expect(onSelect).toHaveBeenCalledWith("web-framework-react", "eject");
    });

    it("should not show focus highlight on removed rows", () => {
      const { lastFrame, unmount } = renderGrid({
        rows: [elementAt(removedRows, 1)],
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
        createSourceRow(COLLAPSED_SKILL_ID, installModeCells("plugin"), "global", true),
        createRemovedRow(COLLAPSED_SKILL_ID, installModeCells("plugin"), "project"),
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
        // The skill name appears once per scope section — proven by its two distinct role prefixes
        // rather than by counting occurrences.
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
            createSourceRow(UNTOUCHED_SKILL_ID, installModeCells("plugin"), "project"),
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

        expect(onSelect).toHaveBeenCalledWith(UNTOUCHED_SKILL_ID, "eject");
        expect(onSelect).not.toHaveBeenCalledWith(COLLAPSED_SKILL_ID, "eject");
      });
    });
  });

  describe("added rows", () => {
    const ADDED_SKILL_ID: SkillId = "web-framework-react";

    const addedRows: SourceRow[] = [
      createAddedRow(ADDED_SKILL_ID, installModeCells("plugin"), "project"),
      createSourceRow("web-state-zustand", installModeCells("plugin"), "project"),
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

      // The focused branch renders the two-column marker cell (`+ `) then the name and the
      // highlight's trailing pad, on the focus background — one space between marker and name.
      const focusedLabel = `${UI_SYMBOLS.ADDED} ${getSkillById(ADDED_SKILL_ID).displayName} `;
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

  /**
   * Inert rows — `readOnly` (locked global) and `disabled` (pending removal) — express which source
   * is selected in the same vocabulary editable rows use: weight, plus brightness on the locked row
   * whose cells are otherwise dimmed. The prefix slot only ever holds a blank spacer, so the check
   * that used to live there appears nowhere in the grid; on a pending-removal row it ticked the
   * source the row was about to lose.
   */
  describe("inert row source selection", () => {
    const LOCKED_ROW: SourceRow = createSourceRow(
      "web-framework-react",
      installModeCells("plugin"),
      "global",
      true,
    );
    const REMOVAL_ROW: SourceRow = createRemovedRow(
      "web-testing-vitest",
      installModeCells("eject"),
      "project",
    );

    /** Prefix every inert source cell carries, selected or not — the blank chevron slot. */
    const INERT_PREFIX = `${UI_SYMBOLS.CHEVRON_SPACER} `;

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

    it("should carry the locked row's selection in weight and brightness, not a check", () => {
      const { lastFrame, unmount } = renderGrid({ rows: [LOCKED_ROW] });
      cleanup = unmount;

      const output = lastFrame()!;
      // Ink applies dim, then colour, then background, then bold (components/Text.js), so a bold
      // undimmed cell is the selected one and a dimmed cell is not.
      expect(
        output,
        `the locked row's selected source must render bold. Frame:\n${JSON.stringify(output)}`,
      ).toContain(chalk.bold(`${INERT_PREFIX}${INSTALL_MODE_CELL_LABELS.plugin}`));
      expect(
        output,
        `the locked row's unselected sources must stay dimmed. Frame:\n${JSON.stringify(output)}`,
      ).toContain(chalk.dim(`${INERT_PREFIX}${INSTALL_MODE_CELL_LABELS.eject}`));
      expect(output).not.toContain(UI_SYMBOLS.SELECTED);
    });

    it("should carry the pending-removal row's selection in weight while keeping its removal colour", () => {
      const { lastFrame, unmount } = renderGrid({ rows: [REMOVAL_ROW] });
      cleanup = unmount;

      const output = lastFrame()!;
      // Red says "this row is going"; bold says "this is the source it is going from". A check
      // there would say the opposite of both.
      expect(
        output,
        `the removal row's selected source must render bold in the removal colour. Frame:\n${JSON.stringify(output)}`,
      ).toContain(
        chalk.bold(chalk.hex(CLI_COLORS.ERROR)(`${INERT_PREFIX}${INSTALL_MODE_CELL_LABELS.eject}`)),
      );
      expect(
        output,
        `the removal row's unselected sources must keep the removal colour unbolded. Frame:\n${JSON.stringify(output)}`,
      ).toContain(chalk.hex(CLI_COLORS.ERROR)(`${INERT_PREFIX}${INSTALL_MODE_CELL_LABELS.plugin}`));
      expect(output).not.toContain(UI_SYMBOLS.SELECTED);
    });
  });
});
