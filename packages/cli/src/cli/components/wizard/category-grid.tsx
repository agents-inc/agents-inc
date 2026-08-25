import React, { useCallback, useEffect } from "react";

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
  /** Optional initial focus row (default: 0). Use with React `key` to reset. */
  defaultFocusedRow?: number;
  /** Optional initial focus col (default: 0). Use with React `key` to reset. */
  defaultFocusedCol?: number;
  /** Optional callback fired whenever the focused position changes */
  onFocusChange?: (row: number, col: number) => void;
  /** Optional callback fired with the resolved SkillId of the focused cell */
  onFocusedSkillChange?: (skillId: SkillId | null) => void;
};

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

/**
 * The verdict word and the reason behind it — `(incompatible: conflicts with Vue
 * Composition Api)`. Every advisory state but `normal` carries a reason, so the
 * status discriminant narrows to the two that have one to state.
 *
 * The word leads rather than the reason: it is the only carrier of the verdict
 * once colour is off, a `discourages` rule's reason is free-form author prose
 * that need not identify itself as a discouragement, and `CELL_ANNOTATION` in
 * `e2e/pages/steps/build-step.ts` anchors cell-label parsing on that keyword.
 *
 * Nothing is elided. A long reason grows the tag and wraps inside its border,
 * which is what `unmetRequirementsReason` above already does.
 */
const advisoryAnnotation = (state: OptionState): string | null =>
  state.status === "normal" ? null : `(${state.status}: ${state.reason})`;

const getCompatibilityLabel = (option: CategoryOption): string | null => {
  if (option.selected && option.hasUnmetRequirements && option.unmetRequirementsReason) {
    return `(${option.unmetRequirementsReason})`;
  }
  if (option.selected) return null;
  if (option.requiredBy) return `(required by ${option.requiredBy})`;
  return advisoryAnnotation(option.state);
};

const STATUS_COLORS: Partial<Record<OptionState["status"], string>> = {
  incompatible: CLI_COLORS.ERROR,
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
            {` ${category.displayName}${selectionCounter ? ` ${selectionCounter}` : ""} `}
          </Text>
        ) : (
          <>
            <Text color={CLI_COLORS.NEUTRAL}>{category.displayName}</Text>
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
    },
    [showLabels, onToggleLabels, onFocusChange],
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
  });

  // Report the focused cell's skill on mount and whenever it changes — including
  // category reshapes that shift the cell without a navigation event. useFocusedListItem
  // only fires onChange during navigation, so the initially highlighted cell would
  // otherwise never reach the store, leaving focusedSkillId out of sync with the visual
  // focus and making the `s` scope hotkey no-op until the first arrow key.
  const focusedSkillId = categories[focusedRow]?.options[focusedCol]?.id ?? null;
  useEffect(() => {
    onFocusedSkillChange?.(focusedSkillId);
  }, [focusedSkillId, onFocusedSkillChange]);

  // `hiddenAbove` / `hiddenBelow` are discarded ON PURPOSE — the build grid has
  // no `ScrollAffordance` and is not getting one (owner decision). On a grid
  // this dense a half-cut card already says "there is more"; a counted hint
  // would be noise, and it would cost the viewport a row to say what the
  // clipped card says for free. Do not add one on the strength of the counts
  // merely being available here.
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
