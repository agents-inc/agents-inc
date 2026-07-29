import React, { useCallback, useMemo } from "react";
import { Box, Text, useInput, type Key } from "ink";
import type { BoundSkillCandidate, SkillAlias, SkillId, SkillScope } from "../../types/index.js";
import { CLI_COLORS, SOURCE_DISPLAY_NAMES, SOURCE_HEADER_NAMES, UI_SYMBOLS } from "../../consts.js";
import { getSkillById } from "../../lib/matrix/matrix-provider.js";
import { useFocusedListItem } from "../hooks/use-focused-list-item.js";
import { useSectionScroll } from "../hooks/use-section-scroll.js";
import { useSourceGridSearchModal } from "../hooks/use-source-grid-search-modal.js";
import { KEY_SPACE } from "./hotkeys.js";
import { ScrollAffordance } from "./scroll-affordance.js";
import { SearchModal } from "./search-modal.js";

const SEARCH_PILL_LABEL = "\u2315 Search";

const SKILL_NAME_WIDTH = 24;
const SOURCE_COL_WIDTH = 18;
const SCOPE_COL_WIDTH = 11;

/**
 * Sources always clips-and-signals rather than bleeding, even at the very short viewports the wizard
 * still renders at (the Sources step is squeezed by the tab bar, dropdown card and footer): a single
 * clipped row plus the overflow affordance beats a bled grid. Distinct from the grid views that fall
 * back to a flex layout below SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS.
 */
const SOURCE_GRID_MIN_VIEWPORT_ROWS = 1;

/**
 * The pinned column header and the overflow affordance each cost one row of the clipped viewport.
 * Below this height there is no room for the header AND a readable pair of content rows, so the
 * column labels yield to content — a header row = column labels (1) + content (2) + affordance (1).
 */
const SOURCE_GRID_HEADER_MIN_HEIGHT = 4;

export type SourceOption = {
  id: string;
  selected: boolean;
  installed: boolean;
};

export type SourceRow = {
  skillId: SkillId;
  options: SourceOption[];
  scope?: SkillScope;
  readOnly?: boolean;
  /**
   * Saved skill deselected this session — still shown so the user can see what saving removes,
   * but inert. Distinct from `readOnly`, which means "locked because it is installed globally".
   */
  disabled?: boolean;
  /**
   * Skill selected this session but absent from the hydration snapshot (D-258). Renders inline in
   * its normal position with the info panel's added marker (`+`) in green, and stays a normal
   * selectable/editable row — unlike `disabled`/`readOnly`, an added row is NOT inert.
   */
  added?: boolean;
};

/** Rows the user cannot act on: globally locked (`readOnly`) or pending removal (`disabled`). */
export function isRowInert(row: SourceRow): boolean {
  return !!row.readOnly || !!row.disabled;
}

/**
 * Status marker before the skill name. Lock = "installed globally, not yours to change here".
 * The removal marker + red colour and the added marker + green colour mirror the info panel's
 * removed/added-diff treatment (DIFF_PREFIX/DIFF_COLOR in skill-agent-summary.tsx) so a
 * pending-removal or added row reads the same on both surfaces. The marker (not the colour) is
 * what carries the meaning in no-color terminals.
 */
function rowStatusGlyph(row: SourceRow): string {
  if (row.readOnly) return `${UI_SYMBOLS.LOCK} `;
  if (row.disabled) return `${UI_SYMBOLS.REMOVED} `;
  if (row.added) return `${UI_SYMBOLS.ADDED} `;
  return "";
}

/** Skill-name colour matching the info panel's diff palette: red = pending removal, green = added. */
function rowLabelColor(row: SourceRow): string {
  if (row.disabled) return CLI_COLORS.ERROR;
  if (row.added) return CLI_COLORS.SUCCESS;
  return CLI_COLORS.NEUTRAL;
}

export type SourceGridProps = {
  rows: SourceRow[];
  /** Available height in terminal lines for the scrollable viewport. 0 = no constraint. */
  availableHeight?: number;
  onSelect: (skillId: SkillId, sourceId: string) => void;
  onSearch?: (alias: SkillAlias) => Promise<BoundSkillCandidate[]>;
  onBind?: (candidate: BoundSkillCandidate) => void;
  onSearchStateChange?: (active: boolean) => void;
  /** Optional initial focus row (default: 0). Use with React `key` to reset. */
  defaultFocusedRow?: number;
  /** Optional initial focus col (default: 0). Use with React `key` to reset. */
  defaultFocusedCol?: number;
  /** Optional callback fired whenever the focused position changes */
  onFocusChange?: (row: number, col: number) => void;
};

type SearchPillProps = {
  isFocused: boolean;
};

const SearchPill: React.FC<SearchPillProps> = ({ isFocused }) => {
  return (
    <Box marginRight={1}>
      <Text dimColor={!isFocused} bold={isFocused}>
        {SEARCH_PILL_LABEL}
      </Text>
    </Box>
  );
};

type SourceSectionProps = {
  row: SourceRow;
  isFocused: boolean;
  focusedOptionIndex: number;
  showSearchPill: boolean;
};

function formatSourceLabel(option: SourceOption): string {
  return SOURCE_DISPLAY_NAMES[option.id] ?? option.id;
}

const SourceTag: React.FC<{
  option: SourceOption;
  isFocused: boolean;
  readOnly?: boolean;
  disabled?: boolean;
}> = ({ option, isFocused, readOnly, disabled }) => {
  if (readOnly || disabled) {
    const prefix = option.selected ? `${UI_SYMBOLS.SELECTED} ` : `${UI_SYMBOLS.CHEVRON_SPACER} `;
    // Pending-removal rows render red (matching the info panel); locked global rows stay dimmed.
    return (
      <Box width={SOURCE_COL_WIDTH}>
        <Text color={disabled ? CLI_COLORS.ERROR : undefined} dimColor={!disabled}>
          {prefix}
          {formatSourceLabel(option)}
        </Text>
      </Box>
    );
  }

  const textColor = option.selected ? CLI_COLORS.PRIMARY : CLI_COLORS.WHITE;
  const isBold = isFocused || option.selected;
  const prefix = isFocused ? `${UI_SYMBOLS.CHEVRON} ` : `${UI_SYMBOLS.CHEVRON_SPACER} `;

  return (
    <Box width={SOURCE_COL_WIDTH}>
      <Text color={textColor} bold={isBold} dimColor={!option.selected && !isFocused}>
        {prefix}
        {formatSourceLabel(option)}
      </Text>
    </Box>
  );
};

const SourceSection: React.FC<SourceSectionProps> = ({
  row,
  isFocused,
  focusedOptionIndex,
  showSearchPill,
}) => {
  const searchPillIndex = row.options.length;
  const isInert = isRowInert(row);
  const effectiveFocused = isInert ? false : isFocused;
  const effectiveShowSearchPill = isInert ? false : showSearchPill;
  // Unlike removal, an added row stays a normal editable row — only its marker/colour differ.
  const statusGlyph = rowStatusGlyph(row);

  return (
    <Box flexDirection="row">
      <Box width={SKILL_NAME_WIDTH}>
        {effectiveFocused ? (
          <Text color={CLI_COLORS.WHITE} backgroundColor={CLI_COLORS.LABEL_BG}>
            {statusGlyph}
            {` ${getSkillById(row.skillId).displayName} `}
          </Text>
        ) : (
          <Text color={rowLabelColor(row)} dimColor={!!row.readOnly}>
            {statusGlyph}
            {getSkillById(row.skillId).displayName}
          </Text>
        )}
      </Box>

      <Box flexDirection="row" flexWrap="wrap">
        {row.options.map((option, index) => (
          <SourceTag
            key={option.id}
            option={option}
            isFocused={effectiveFocused && index === focusedOptionIndex}
            readOnly={row.readOnly}
            disabled={row.disabled}
          />
        ))}
        {effectiveShowSearchPill && (
          <SearchPill isFocused={effectiveFocused && focusedOptionIndex === searchPillIndex} />
        )}
      </Box>
    </Box>
  );
};

/** Total navigable columns for a row (options + search pill if applicable) */
const getNavigableCount = (row: SourceRow, showSearchPill: boolean): number => {
  return row.options.length + (showSearchPill ? 1 : 0);
};

type ScopeGroup = {
  label: string;
  rows: { row: SourceRow; originalIndex: number }[];
};

/** First focusable row index at or cyclically after `startRow`; `startRow` when every row is inert. */
function firstFocusableRowIndex(rows: SourceRow[], startRow: number): number {
  const cyclicRowOrder = rows.map((_, offset) => (startRow + offset) % rows.length);
  return (
    cyclicRowOrder.find((row) => {
      const candidate = rows[row];
      return candidate && !isRowInert(candidate);
    }) ?? startRow
  );
}

/** Index of the last focusable (non-inert) row, or -1 when every row is inert. */
function lastFocusableRowIndex(rows: SourceRow[]): number {
  for (let i = rows.length - 1; i >= 0; i--) {
    const candidate = rows[i];
    if (candidate && !isRowInert(candidate)) return i;
  }
  return -1;
}

/** Groups rows by scope for rendering with section labels. Returns empty array when all rows share the same scope (renders flat). */
function groupRowsByScope(rows: SourceRow[]): ScopeGroup[] {
  const indexed = rows.map((row, i) => ({ row, originalIndex: i }));
  const globalRows = indexed.filter(({ row }) => row.scope === "global");
  const projectRows = indexed.filter(({ row }) => row.scope !== "global");

  if (globalRows.length === 0 || projectRows.length === 0) return [];

  return [
    { label: "Global", rows: globalRows },
    { label: "Project", rows: projectRows },
  ];
}

export const SourceGrid: React.FC<SourceGridProps> = ({
  rows,
  availableHeight = 0,
  onSelect,
  onSearch,
  onBind,
  onSearchStateChange,
  defaultFocusedRow = 0,
  defaultFocusedCol = 0,
  onFocusChange,
}) => {
  const {
    searchModal,
    searchResults,
    searchAlias,
    handleSearchTrigger,
    handleBind,
    handleCloseSearch,
  } = useSourceGridSearchModal({ rows, onSearch, onBind, onSearchStateChange });

  const showSearchPill = !!onSearch;

  const getColCount = useCallback(
    (row: number): number => {
      const rowData = rows[row];
      return rowData ? getNavigableCount(rowData, showSearchPill) : 0;
    },
    [rows, showSearchPill],
  );

  const skipRow = useCallback(
    (row: number): boolean => {
      const candidate = rows[row];
      return !!candidate && isRowInert(candidate);
    },
    [rows],
  );

  const effectiveDefaultRow = firstFocusableRowIndex(rows, defaultFocusedRow);

  const { focusedRow, focusedCol, moveFocus } = useFocusedListItem(rows.length, getColCount, {
    wrap: true,
    onChange: onFocusChange,
    initialRow: effectiveDefaultRow,
    initialCol: defaultFocusedCol,
    skipRow,
  });

  const {
    setSectionRef,
    setViewportRef,
    setContentRef,
    scrollEnabled,
    scrollTopPx,
    hiddenAbove,
    hiddenBelow,
    scrollBy,
  } = useSectionScroll({
    sectionCount: rows.length,
    focusedIndex: focusedRow,
    availableHeight,
    minViewportRows: SOURCE_GRID_MIN_VIEWPORT_ROWS,
  });

  const lastFocusableRow = useMemo(() => lastFocusableRowIndex(rows), [rows]);

  useInput(
    useCallback(
      (input: string, key: Key) => {
        if (input === KEY_SPACE) {
          const currentRow = rows[focusedRow];
          if (!currentRow || isRowInert(currentRow)) return;
          if (showSearchPill && focusedCol === currentRow.options.length) {
            void handleSearchTrigger(focusedRow);
            return;
          }
          if (focusedCol < currentRow.options.length) {
            const currentOption = currentRow.options[focusedCol];
            if (currentOption) {
              onSelect(currentRow.skillId, currentOption.id);
            }
          }
          return;
        }

        // With no focusable row (every row inert — a run of locked-global rows plus the
        // pending-removal row) there is no focus to move or to anchor overscroll on, so
        // vertical keys drive the viewport directly. Otherwise, overscroll only kicks in
        // once focus sits on the last focusable row (below it are only inert rows).
        const noFocusableRow = lastFocusableRow === -1;
        const atLastFocusableRow = focusedRow === lastFocusableRow;

        if (key.leftArrow) {
          moveFocus("left");
        } else if (key.rightArrow) {
          moveFocus("right");
        } else if (key.upArrow) {
          if (scrollEnabled && noFocusableRow && hiddenAbove > 0) {
            scrollBy(-1);
          } else {
            moveFocus("up");
          }
        } else if (key.downArrow) {
          // Keep scrolling the viewport to reveal trailing inert rows (e.g. the
          // pending-removal row) instead of wrapping. Focus never lands on them, so the
          // viewport travels past the last focusable row (or scrolls on its own when
          // nothing is focusable).
          if (scrollEnabled && (noFocusableRow || atLastFocusableRow) && hiddenBelow > 0) {
            scrollBy(1);
          } else {
            moveFocus("down");
          }
        }
      },
      [
        rows,
        focusedRow,
        focusedCol,
        onSelect,
        showSearchPill,
        handleSearchTrigger,
        moveFocus,
        scrollEnabled,
        lastFocusableRow,
        hiddenAbove,
        hiddenBelow,
        scrollBy,
      ],
    ),
    { isActive: !searchModal.isOpen },
  );

  if (rows.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No skills to display.</Text>
      </Box>
    );
  }

  const noShrink = scrollEnabled ? { flexShrink: 0 } : {};

  const scopeGroups = groupRowsByScope(rows);

  const headerSources = rows[0]?.options ?? [];
  // Drop the header's spacer row while clipping so the squeezed viewport keeps a content row for the
  // pinned column header plus the affordance; the spacer is cosmetic and only shows when not scrolling.
  const headerMarginBottom = scrollEnabled || scopeGroups.length > 0 ? 0 : 1;
  // At the shortest viewports the pinned column header would starve the content of readable rows, so
  // the labels give way — every row still shows its own source cells, only the column caption is lost.
  const showPinnedHeader = !scrollEnabled || availableHeight >= SOURCE_GRID_HEADER_MIN_HEIGHT;
  const headerElement = (
    <Box flexDirection="row" marginBottom={headerMarginBottom} {...noShrink}>
      {scopeGroups.length > 0 && <Box width={SCOPE_COL_WIDTH} />}
      <Box width={SKILL_NAME_WIDTH}>
        {scopeGroups.length > 0 && (
          <Text color={CLI_COLORS.WARNING} bold>
            Scope
          </Text>
        )}
      </Box>
      {headerSources.map((option) => (
        <Box key={option.id} width={SOURCE_COL_WIDTH}>
          <Text
            color={CLI_COLORS.WARNING}
            bold
          >{`${UI_SYMBOLS.CHEVRON_SPACER} ${SOURCE_HEADER_NAMES[option.id] ?? option.id}`}</Text>
        </Box>
      ))}
    </Box>
  );

  const sectionElements =
    scopeGroups.length > 0
      ? scopeGroups.map((group) => (
          <Box key={group.label} flexDirection="column" marginTop={1} {...noShrink}>
            {group.rows.map(({ row, originalIndex }, rowIndexInGroup) => (
              <Box
                key={`${row.skillId}-${row.scope ?? "default"}`}
                flexDirection="row"
                ref={(el) => setSectionRef(originalIndex, el)}
                {...noShrink}
              >
                <Box width={SCOPE_COL_WIDTH}>
                  {rowIndexInGroup === 0 && (
                    <Text color={CLI_COLORS.WARNING} bold>
                      {group.label}
                    </Text>
                  )}
                </Box>
                <SourceSection
                  row={row}
                  isFocused={originalIndex === focusedRow}
                  focusedOptionIndex={focusedCol}
                  showSearchPill={showSearchPill}
                />
              </Box>
            ))}
          </Box>
        ))
      : rows.map((row, rowIndex) => (
          <Box
            key={`${row.skillId}-${row.scope ?? "default"}`}
            ref={(el) => setSectionRef(rowIndex, el)}
            {...noShrink}
          >
            <SourceSection
              row={row}
              isFocused={rowIndex === focusedRow}
              focusedOptionIndex={focusedCol}
              showSearchPill={showSearchPill}
            />
          </Box>
        ));

  const searchModalElement = searchModal.isOpen && (
    <SearchModal
      results={searchResults}
      alias={searchAlias}
      onBind={handleBind}
      onClose={handleCloseSearch}
    />
  );

  return (
    <Box
      flexDirection="column"
      {...(scrollEnabled
        ? { height: availableHeight, overflow: "hidden" as const }
        : { flexGrow: 1 })}
    >
      {showPinnedHeader && headerElement}
      <Box ref={setViewportRef} flexDirection="column" overflow="hidden" flexGrow={1}>
        <Box
          ref={setContentRef}
          flexDirection="column"
          marginTop={scrollTopPx > 0 ? -scrollTopPx : 0}
          {...noShrink}
        >
          {sectionElements}
        </Box>
      </Box>
      <ScrollAffordance hiddenAbove={hiddenAbove} hiddenBelow={hiddenBelow} />
      {searchModalElement}
    </Box>
  );
};
