import React, { useCallback } from "react";
import { Box, Text } from "ink";
import { CLI_COLORS, UI_SYMBOLS } from "../../consts.js";
import { useKeyboardNavigation } from "../hooks/use-keyboard-navigation.js";

export type SelectListItem<T> = {
  value: T;
  label: string;
};

export type SelectListProps<T> = {
  items: readonly SelectListItem<T>[];
  onSelect: (value: T) => void;
  onCancel?: (() => void) | undefined;
  renderItem?: ((item: SelectListItem<T>, isFocused: boolean) => React.ReactNode) | undefined;
  active?: boolean | undefined;
};

export function SelectList<T>({
  items,
  onSelect,
  onCancel,
  renderItem,
  active,
}: SelectListProps<T>): React.ReactElement {
  const handleEnter = useCallback(
    (index: number) => {
      const item = items[index];
      if (item) {
        onSelect(item.value);
      }
    },
    [items, onSelect],
  );

  const { focusedIndex } = useKeyboardNavigation(
    items.length,
    { onEnter: handleEnter, ...(onCancel !== undefined && { onEscape: onCancel }) },
    { vimKeys: false, ...(active !== undefined && { active }) },
  );

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const isFocused = index === focusedIndex;
        const marker = isFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER;

        return (
          <Box key={index}>
            <Text bold={isFocused} {...(isFocused && { color: CLI_COLORS.PRIMARY })}>
              {marker}{" "}
            </Text>
            {renderItem ? (
              renderItem(item, isFocused)
            ) : (
              <Text bold={isFocused} {...(isFocused && { color: CLI_COLORS.PRIMARY })}>
                {item.label}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
