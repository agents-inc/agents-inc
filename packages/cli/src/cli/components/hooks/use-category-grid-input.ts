import { useCallback, useEffect, useMemo, useRef } from "react";
import { useInput, type Key } from "ink";

import type { Category, SkillId } from "../../types/index.js";
import type { CategoryRow } from "../wizard/category-grid.js";
import type { Direction, FocusedPosition } from "./use-focused-list-item.js";
import { HOTKEY_TOGGLE_LABELS, KEY_SPACE, isHotkey } from "../wizard/hotkeys.js";

/** Find next section index (wrapping forward) */
const findNextIndex = (items: { length: number }, currentIndex: number): number => {
  const length = items.length;
  if (length === 0) return currentIndex;
  return (currentIndex + 1) % length;
};

type UseCategoryGridInputOptions = {
  categories: CategoryRow[];
  focusedRow: number;
  focusedCol: number;
  currentFocus: () => FocusedPosition;
  setFocused: (row: number, col: number) => void;
  moveFocus: (direction: Direction) => void;
  onToggle: (categoryId: Category, technologyId: SkillId) => void;
  onToggleLabels: () => void;
};

export function useCategoryGridInput({
  categories,
  focusedRow,
  focusedCol,
  currentFocus,
  setFocused,
  moveFocus,
  onToggle,
  onToggleLabels,
}: UseCategoryGridInputOptions): void {
  const currentRow = categories[focusedRow];
  // Memoised so the effect below keys on the row actually changing — the `[]`
  // fallback used to be a fresh array every render, re-running the effect for
  // nothing whenever no row was focused.
  const currentOptions = useMemo(() => currentRow?.options ?? [], [currentRow]);

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
  const handlerRef = useRef<((input: string, key: Key) => void) | null>(null);
  handlerRef.current = (input: string, key: Key) => {
    if (key.tab && key.shift) {
      onToggleLabels();
      return;
    }

    // Tab and Space read the focus as it stands now rather than as the last render painted it:
    // a key that follows a move in the same chunk is handled before that move renders.
    if (key.tab && !key.shift) {
      const { row } = currentFocus();
      const nextSection = findNextIndex(categories, row);
      if (nextSection !== row) {
        setFocused(nextSection, 0);
      }
      return;
    }

    if (isHotkey(input, HOTKEY_TOGGLE_LABELS)) {
      onToggleLabels();
      return;
    }

    if (input === KEY_SPACE) {
      const { row, col } = currentFocus();
      const category = categories[row];
      const option = category?.options[col];
      if (category && option) {
        onToggle(category.id, option.id);
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
  const stableHandler = useCallback((input: string, key: Key) => {
    handlerRef.current?.(input, key);
  }, []);

  useInput(stableHandler);
}
