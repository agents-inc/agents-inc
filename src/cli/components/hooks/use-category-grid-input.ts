import { useCallback, useEffect, useRef } from "react";
import { useInput } from "ink";

import type { Category, SkillId } from "../../types/index.js";
import type { CategoryOption, CategoryRow } from "../wizard/category-grid.js";
import { HOTKEY_FILTER_INCOMPATIBLE, HOTKEY_TOGGLE_LABELS, isHotkey } from "../wizard/hotkeys.js";

/** Find next section index (wrapping forward) */
export const findNextIndex = (
  categories: { id: Category; options: CategoryOption[] }[],
  currentIndex: number,
): number => {
  const length = categories.length;
  if (length === 0) return currentIndex;
  return (currentIndex + 1) % length;
};

type UseCategoryGridInputOptions = {
  categories: CategoryRow[];
  focusedRow: number;
  focusedCol: number;
  setFocused: (row: number, col: number) => void;
  moveFocus: (direction: "up" | "down" | "left" | "right") => void;
  onToggle: (categoryId: Category, technologyId: SkillId) => void;
  onToggleLabels: () => void;
  onToggleFilterIncompatible?: () => void;
};

export function useCategoryGridInput({
  categories,
  focusedRow,
  focusedCol,
  setFocused,
  moveFocus,
  onToggle,
  onToggleLabels,
  onToggleFilterIncompatible,
}: UseCategoryGridInputOptions): void {
  const currentRow = categories[focusedRow];
  const currentOptions = currentRow?.options || [];

  // Adjust column when current row's options change externally (e.g. option becomes disabled)
  useEffect(() => {
    if (!currentRow) return;

    const maxCol = currentOptions.length - 1;
    if (focusedCol > maxCol) {
      const newCol = Math.max(0, maxCol);
      setFocused(focusedRow, newCol);
    }
  }, [focusedRow, currentOptions, focusedCol, setFocused, currentRow]);

  // Store the latest handler in a ref so that the useInput effect never needs to
  // re-register on the event emitter. This avoids a stale-closure race condition
  // where, after a domain switch (CategoryGrid remount via key={activeDomain}),
  // the useInput effect may not yet have re-registered the updated handler when
  // the first keypress arrives — causing the first space press to be silently lost.
  type InputKey = {
    leftArrow: boolean;
    rightArrow: boolean;
    upArrow: boolean;
    downArrow: boolean;
    tab: boolean;
    shift: boolean;
  };

  const handlerRef = useRef<((input: string, key: InputKey) => void) | null>(null);
  handlerRef.current = (input: string, key: InputKey) => {
    if (key.tab && key.shift) {
      onToggleLabels();
      return;
    }

    if (key.tab && !key.shift) {
      const nextSection = findNextIndex(categories, focusedRow);
      if (nextSection !== focusedRow) {
        setFocused(nextSection, 0);
      }
      return;
    }

    if (isHotkey(input, HOTKEY_TOGGLE_LABELS)) {
      onToggleLabels();
      return;
    }

    if (isHotkey(input, HOTKEY_FILTER_INCOMPATIBLE) && onToggleFilterIncompatible) {
      onToggleFilterIncompatible();
      return;
    }

    if (input === " ") {
      const currentOption = currentOptions[focusedCol];
      if (currentOption) {
        onToggle(currentRow.id, currentOption.id);
      }
      return;
    }

    const isLeft = key.leftArrow || input === "h";
    const isRight = key.rightArrow || input === "l";
    const isUp = key.upArrow || input === "k";
    const isDown = key.downArrow || input === "j";

    if (isLeft) {
      moveFocus("left");
    } else if (isRight) {
      moveFocus("right");
    } else if (isUp) {
      moveFocus("up");
    } else if (isDown) {
      moveFocus("down");
    }
  };

  // Stable handler reference — never changes, so useInput's effect registers once
  const stableHandler = useCallback((input: string, key: InputKey) => {
    handlerRef.current?.(input, key);
  }, []);

  useInput(stableHandler);
}
