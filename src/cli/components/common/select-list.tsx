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
  onCancel?: () => void;
  renderItem?: (item: SelectListItem<T>, isFocused: boolean) => React.ReactNode;
  active?: boolean;
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
      if (items.length > 0 && items[index]) {
        onSelect(items[index].value);
      }
    },
    [items, onSelect],
  );

  const { focusedIndex } = useKeyboardNavigation(
    items.length,
    { onEnter: handleEnter, onEscape: onCancel },
    { vimKeys: false, active },
  );

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const isFocused = index === focusedIndex;
        const marker = isFocused ? UI_SYMBOLS.CHEVRON : UI_SYMBOLS.CHEVRON_SPACER;

        return (
          <Box key={index}>
            <Text bold={isFocused} color={isFocused ? CLI_COLORS.PRIMARY : undefined}>
              {marker}{" "}
            </Text>
            {renderItem ? (
              renderItem(item, isFocused)
            ) : (
              <Text bold={isFocused} color={isFocused ? CLI_COLORS.PRIMARY : undefined}>
                {item.label}
              </Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
