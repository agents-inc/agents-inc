import React, { useCallback } from "react";

import { Box, Text } from "ink";

import { CLI_COLORS } from "../../consts.js";
import { getSkillById } from "../../lib/matrix/matrix-provider.js";
import type { Category, OptionState, SkillId, SkillScope } from "../../types/index.js";
import { useCategoryGridInput } from "../hooks/use-category-grid-input.js";
import { useFocusedListItem } from "../hooks/use-focused-list-item.js";
import { useSectionScroll } from "../hooks/use-section-scroll.js";

export type CategoryOption = {
  id: SkillId;
  state: OptionState;
  selected: boolean;
  local?: boolean;
  installed?: boolean;
  scope?: SkillScope;
  /** Secondary scope badge shown alongside primary (e.g. after G->P toggle, excluded tombstone) */
  secondaryScope?: SkillScope;
  source?: string;
  /** True when selected but has unmet dependency requirements (shown dimmed) */
  hasUnmetRequirements?: boolean;
  /** Explains unmet requirements (shown in label when D pressed) */
  unmetRequirementsReason?: string;
  /** Display name of the skill that requires this one (e.g. "Next.js") */
  requiredBy?: string;
};

export type CategoryRow = {
  id: Category;
  displayName: string;
  required: boolean;
  exclusive: boolean;
  options: CategoryOption[];
};

export type CategoryGridProps = {
  categories: CategoryRow[];
  /** Available height in terminal lines for the scrollable viewport. 0 = no constraint. */
  availableHeight?: number;
  showLabels: boolean;
  onToggle: (categoryId: Category, technologyId: SkillId) => void;
  onToggleLabels: () => void;
  onToggleFilterIncompatible?: () => void;
  /** Optional initial focus row (default: 0). Use with React `key` to reset. */
  defaultFocusedRow?: number;
  /** Optional initial focus col (default: 0). Use with React `key` to reset. */
  defaultFocusedCol?: number;
  /** Optional callback fired whenever the focused position changes */
  onFocusChange?: (row: number, col: number) => void;
  /** Optional callback fired with the resolved SkillId of the focused cell */
  onFocusedSkillChange?: (skillId: SkillId | null) => void;
};

const SYMBOL_REQUIRED = "*";

/** Next option index stepping cyclically from `currentIndex`; empty rows stay put. */
const wrapOptionIndex = (length: number, currentIndex: number, direction: 1 | -1): number => {
  if (length === 0) return currentIndex;
  return (currentIndex + direction + length) % length;
};

type SkillTagProps = {
  option: CategoryOption;
  isFocused: boolean;
  showLabels: boolean;
};

const getCompatibilityLabel = (option: CategoryOption): string | null => {
  if (option.selected && option.hasUnmetRequirements && option.unmetRequirementsReason) {
    return `(${option.unmetRequirementsReason})`;
  }
  if (option.selected) return null;
  if (option.requiredBy) return `(required by ${option.requiredBy})`;
  if (option.state.status === "incompatible") return "(incompatible)";
  if (option.state.status === "recommended") return "(recommended)";
  if (option.state.status === "discouraged") return "(discouraged)";
  return null;
};

const STATUS_COLORS: Partial<Record<OptionState["status"], string>> = {
  incompatible: CLI_COLORS.ERROR,
  recommended: CLI_COLORS.GRAY_1,
  discouraged: CLI_COLORS.WARNING,
};

/** Selected wins, then advisory status; `fallback` covers the plain "normal" state. */
function resolveTagColor(option: CategoryOption, fallback: string): string {
  if (option.selected) return CLI_COLORS.PRIMARY;
  return STATUS_COLORS[option.state.status] ?? fallback;
}

const SkillTag: React.FC<SkillTagProps> = ({ option, isFocused, showLabels }) => {
  const textColor = resolveTagColor(option, CLI_COLORS.DIM);
  const hasRequiredBy = option.selected && !!option.requiredBy;
  const hasUnmetDeps = option.selected && !!option.hasUnmetRequirements;
  const isDimmed = hasUnmetDeps || hasRequiredBy;
  const showCompatibility = hasRequiredBy || hasUnmetDeps || (showLabels && isFocused);
  const compatibilityLabel = showCompatibility ? getCompatibilityLabel(option) : null;

  return (
    <Box
      marginRight={1}
      borderColor={isFocused ? resolveTagColor(option, CLI_COLORS.UNFOCUSED) : textColor}
      borderDimColor={!isFocused}
      borderStyle="single"
      flexShrink={0}
      paddingLeft={1}
      flexDirection="row"
    >
      <>
        {option.scope && (
          <>
            {[option.scope, option.secondaryScope].filter(Boolean).map((badgeScope, i) => (
              <Text key={i} color={CLI_COLORS.WARNING} backgroundColor={CLI_COLORS.LABEL_BG}>
                {badgeScope === "global" ? " G " : " P "}
              </Text>
            ))}
            <Text> </Text>
          </>
        )}
        <Text color={textColor} bold dimColor={isDimmed}>
          {getSkillById(option.id).displayName}{" "}
        </Text>
        {compatibilityLabel && (
          <Text color={textColor} dimColor>
            {compatibilityLabel}{" "}
          </Text>
        )}
      </>
    </Box>
  );
};

type CategorySectionProps = {
  isFirst: boolean;
  category: CategoryRow;
  isFocused: boolean;
  focusedOptionIndex: number;
  showLabels: boolean;
};

const CategorySection: React.FC<CategorySectionProps> = ({
  isFirst,
  category,
  isFocused,
  focusedOptionIndex,
  showLabels,
}) => {
  const { options } = category;
  const selectedCount = options.filter((o) => o.selected).length;

  const selectionCounter = category.exclusive ? `(${selectedCount} of 1)` : null;

  return (
    <Box flexDirection="column" marginTop={isFirst ? 0 : 1}>
      <Box flexDirection="row">
        {isFocused ? (
          <Text color={CLI_COLORS.WHITE} backgroundColor={CLI_COLORS.LABEL_BG}>
            {` ${category.displayName}${category.required ? ` ${SYMBOL_REQUIRED}` : ""}${selectionCounter ? ` ${selectionCounter}` : ""} `}
          </Text>
        ) : (
          <>
            <Text color={CLI_COLORS.NEUTRAL}>{category.displayName}</Text>
            {category.required && <Text color={CLI_COLORS.NEUTRAL}> {SYMBOL_REQUIRED}</Text>}
            {selectionCounter && <Text dimColor> {selectionCounter}</Text>}
          </>
        )}
      </Box>

      <Box flexDirection="row" flexWrap="wrap" marginTop={0}>
        {options.map((option, index) => (
          <SkillTag
            key={option.id}
            option={option}
            isFocused={isFocused && index === focusedOptionIndex}
            showLabels={showLabels}
          />
        ))}
      </Box>
    </Box>
  );
};

export const CategoryGrid: React.FC<CategoryGridProps> = ({
  categories,
  availableHeight = 0,
  showLabels,
  onToggle,
  onToggleLabels,
  onToggleFilterIncompatible,
  defaultFocusedRow = 0,
  defaultFocusedCol = 0,
  onFocusChange,
  onFocusedSkillChange,
}) => {
  const getColCount = useCallback(
    (row: number): number => categories[row]?.options.length ?? 0,
    [categories],
  );

  const findValidCol = useCallback(
    (row: number, currentCol: number, direction: 1 | -1): number =>
      wrapOptionIndex(categories[row]?.options.length ?? 0, currentCol, direction),
    [categories],
  );

  const handleFocusChange = useCallback(
    (row: number, col: number) => {
      if (showLabels) onToggleLabels();
      onFocusChange?.(row, col);
      const skill = categories[row]?.options[col];
      onFocusedSkillChange?.(skill?.id ?? null);
    },
    [showLabels, onToggleLabels, onFocusChange, categories, onFocusedSkillChange],
  );

  const { focusedRow, focusedCol, setFocused, moveFocus } = useFocusedListItem(
    categories.length,
    getColCount,
    {
      wrap: true,
      findValidCol,
      onChange: handleFocusChange,
      initialRow: defaultFocusedRow,
      initialCol: defaultFocusedCol,
    },
  );

  useCategoryGridInput({
    categories,
    focusedRow,
    focusedCol,
    setFocused,
    moveFocus,
    onToggle,
    onToggleLabels,
    onToggleFilterIncompatible,
  });

  const { setSectionRef, scrollEnabled, scrollTopPx } = useSectionScroll({
    sectionCount: categories.length,
    focusedIndex: focusedRow,
    availableHeight,
  });

  if (categories.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>No categories to display.</Text>
      </Box>
    );
  }

  const noShrink = scrollEnabled ? { flexShrink: 0 } : {};

  const sectionElements = categories.map((category, index) => (
    <Box key={category.id} ref={(el) => setSectionRef(index, el)} {...noShrink}>
      <CategorySection
        category={category}
        isFocused={index === focusedRow}
        focusedOptionIndex={focusedCol}
        showLabels={showLabels}
        isFirst={index === 0}
      />
    </Box>
  ));

  return (
    <Box
      flexDirection="column"
      {...(scrollEnabled
        ? { height: availableHeight, overflow: "hidden" as const }
        : { flexGrow: 1 })}
    >
      <Box flexDirection="column" marginTop={scrollTopPx > 0 ? -scrollTopPx : 0} {...noShrink}>
        {sectionElements}
      </Box>
    </Box>
  );
};
