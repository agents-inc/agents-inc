import React, { useCallback } from "react";
import { Box, Text, useInput } from "ink";
import type { BoundSkillCandidate, SkillAlias, SkillId } from "../../types/index.js";
import { CLI_COLORS, SOURCE_DISPLAY_NAMES, UI_SYMBOLS } from "../../consts.js";
import { getSkillById } from "../../lib/matrix/matrix-provider.js";
import { useFocusedListItem } from "../hooks/use-focused-list-item.js";
import { useSectionScroll } from "../hooks/use-section-scroll.js";
import { useSourceGridSearchModal } from "../hooks/use-source-grid-search-modal.js";
import { SearchModal } from "./search-modal.js";

const SEARCH_PILL_LABEL = "\u2315 Search";

const SKILL_NAME_WIDTH = 24;
const SOURCE_COL_WIDTH = 18;
const SCOPE_COL_WIDTH = 11;

const SOURCE_HEADER_NAMES: Record<string, string> = {
  eject: "Local",
  "agents-inc": "Plugin",
  public: "Public",
};

export type SourceOption = {
  id: string;
  displayName?: string;
  selected: boolean;
  installed: boolean;
};

export type SourceRow = {
  skillId: SkillId;
  options: SourceOption[];
  scope?: "global" | "project";
  readOnly?: boolean;
};

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
  return option.displayName ?? SOURCE_DISPLAY_NAMES[option.id] ?? option.id;
}

const SourceTag: React.FC<{ option: SourceOption; isFocused: boolean; readOnly?: boolean }> = ({
  option,
  isFocused,
  readOnly,
}) => {
  if (readOnly) {
    const prefix = option.selected ? `${UI_SYMBOLS.SELECTED} ` : `${UI_SYMBOLS.CHEVRON_SPACER} `;
    return (
      <Box width={SOURCE_COL_WIDTH}>
        <Text dimColor>
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
  const effectiveFocused = row.readOnly ? false : isFocused;
  const effectiveShowSearchPill = row.readOnly ? false : showSearchPill;

  return (
    <Box flexDirection="row">
      <Box width={SKILL_NAME_WIDTH}>
        {effectiveFocused ? (
          <Text color={CLI_COLORS.WHITE} backgroundColor={CLI_COLORS.LABEL_BG}>
            {row.readOnly ? `${UI_SYMBOLS.LOCK} ` : ""}
            {` ${getSkillById(row.skillId).displayName} `}
          </Text>
        ) : (
          <Text color={CLI_COLORS.NEUTRAL} dimColor={row.readOnly}>
            {row.readOnly ? `${UI_SYMBOLS.LOCK} ` : ""}
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

/** First row index at or cyclically after `startRow` that is not readOnly; `startRow` when all are. */
function firstNonReadOnlyRow(rows: SourceRow[], startRow: number): number {
  const cyclicRowOrder = rows.map((_, offset) => (startRow + offset) % rows.length);
  return cyclicRowOrder.find((row) => !rows[row]?.readOnly) ?? startRow;
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

  const skipRow = useCallback((row: number): boolean => !!rows[row]?.readOnly, [rows]);

  const effectiveDefaultRow = firstNonReadOnlyRow(rows, defaultFocusedRow);

  const { focusedRow, focusedCol, moveFocus } = useFocusedListItem(rows.length, getColCount, {
    wrap: true,
    onChange: onFocusChange,
    initialRow: effectiveDefaultRow,
    initialCol: defaultFocusedCol,
    skipRow,
  });

  const { setSectionRef, scrollEnabled, scrollTopPx } = useSectionScroll({
    sectionCount: rows.length,
    focusedIndex: focusedRow,
    availableHeight,
  });

  useInput(
    useCallback(
      (
        input: string,
        key: {
          leftArrow: boolean;
          rightArrow: boolean;
          upArrow: boolean;
          downArrow: boolean;
          return: boolean;
        },
      ) => {
        if (input === " ") {
          const currentRow = rows[focusedRow];
          if (!currentRow || currentRow.readOnly) return;
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

        if (key.leftArrow) {
          moveFocus("left");
        } else if (key.rightArrow) {
          moveFocus("right");
        } else if (key.upArrow) {
          moveFocus("up");
        } else if (key.downArrow) {
          moveFocus("down");
        }
      },
      [rows, focusedRow, focusedCol, onSelect, showSearchPill, handleSearchTrigger, moveFocus],
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
  const headerElement = (
    <Box flexDirection="row" marginBottom={scopeGroups.length > 0 ? 0 : 1} {...noShrink}>
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
      {...(scrollEnabled ? { height: availableHeight } : { flexGrow: 1 })}
    >
      <Box flexDirection="column" overflow="hidden" flexGrow={1}>
        <Box flexDirection="column" marginTop={scrollTopPx > 0 ? -scrollTopPx : 0} {...noShrink}>
          {headerElement}
          {sectionElements}
        </Box>
      </Box>
      {searchModalElement}
    </Box>
  );
};
