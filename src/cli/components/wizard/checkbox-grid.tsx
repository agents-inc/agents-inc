import { Box, Text, useInput } from "ink";
import React, { useState } from "react";
import { CLI_COLORS, UI_SYMBOLS } from "../../consts.js";
import { useRowScroll } from "../hooks/use-row-scroll.js";
import { KEY_SPACE } from "./hotkeys.js";

export type CheckboxItem<T extends string = string> = {
  id: T;
  label: string;
  description: string;
};

export type CheckboxGridProps<T extends string = string> = {
  subtitle?: string;
  items: CheckboxItem<T>[];
  selectedIds: T[];
  /** Available height in terminal lines for the scrollable viewport. 0 = no constraint. */
  availableHeight?: number;
  onToggle: (id: T) => void;
  onContinue: () => void;
  onBack: () => void;
  /** Message shown when nothing is selected */
  emptyMessage?: string;
};

export const CheckboxGrid = <T extends string = string>({
  subtitle,
  items,
  selectedIds,
  availableHeight = 0,
  onToggle,
  onContinue,
  onBack,
  emptyMessage = "Please select at least one item",
}: CheckboxGridProps<T>): React.ReactElement => {
  // Items + continue option at the end
  const totalItems = items.length + 1;
  const [focusedIndex, setFocusedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }

    if (key.upArrow || input === "k") {
      setFocusedIndex((prev) => (prev <= 0 ? totalItems - 1 : prev - 1));
      return;
    }

    if (key.downArrow || input === "j") {
      setFocusedIndex((prev) => (prev >= totalItems - 1 ? 0 : prev + 1));
      return;
    }

    if (key.return) {
      onContinue();
      return;
    }

    if (input === KEY_SPACE) {
      const item = items[focusedIndex];
      if (item) {
        onToggle(item.id);
      }
    }
  });

  // The Domains grid clips silently: `useRowScroll` exposes no hidden-line
  // counts and this view renders no `ScrollAffordance`, by owner decision — see
  // the hook's doc comment.
  // When focus is on continue (past items), scroll to show last items
  const effectiveRow = focusedIndex >= items.length ? items.length - 1 : focusedIndex;
  const { scrollEnabled, scrollTop } = useRowScroll({
    focusedIndex: effectiveRow,
    itemCount: items.length,
    availableHeight,
  });

  const itemElements = items.map((item, index) => {
    const isFocused = index === focusedIndex;
    const isSelected = selectedIds.includes(item.id);
    const checkbox = isSelected ? "[\u2713]" : "[ ]";
    const pointer = isFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER;

    return (
      <Text key={item.id}>
        <Text color={isFocused ? CLI_COLORS.PRIMARY : undefined}>{pointer}</Text>
        <Text color={isSelected || isFocused ? CLI_COLORS.PRIMARY : undefined} bold={isFocused}>
          {" "}
          {checkbox} {item.label}
        </Text>
        {item.description && (
          <Text dimColor>
            {"  "}
            {item.description}
          </Text>
        )}
      </Text>
    );
  });

  const footerElement =
    selectedIds.length > 0 ? (
      <Text>
        {"\n"}Selected: <Text color={CLI_COLORS.WARNING}>{selectedIds.join(", ")}</Text>
      </Text>
    ) : emptyMessage ? (
      <Text dimColor>
        {"\n"}
        {emptyMessage}
      </Text>
    ) : null;

  return (
    <Box flexDirection="column">
      {subtitle && <Text dimColor>{subtitle}</Text>}
      <Box
        flexDirection="column"
        {...(scrollEnabled && { height: availableHeight, overflow: "hidden" as const })}
      >
        <Box
          flexDirection="column"
          marginTop={scrollTop > 0 ? -scrollTop : 0}
          {...(scrollEnabled && { flexShrink: 0 })}
        >
          {itemElements}
        </Box>
      </Box>
      {footerElement}
    </Box>
  );
};
