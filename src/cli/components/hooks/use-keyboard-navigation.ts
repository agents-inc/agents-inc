import type { Dispatch, SetStateAction } from "react";
import { useState, useCallback, useRef, useEffect } from "react";
import { useInput, type Key } from "ink";

type KeyboardNavigationHandlers = {
  onEnter?: (focusedIndex: number) => void;
  onEscape?: () => void;
};

type KeyboardNavigationOptions = {
  wrap?: boolean;
  vimKeys?: boolean;
  active?: boolean;
};

export function useKeyboardNavigation(
  itemCount: number,
  handlers: KeyboardNavigationHandlers = {},
  options: KeyboardNavigationOptions = {},
): {
  focusedIndex: number;
  setFocusedIndex: Dispatch<SetStateAction<number>>;
} {
  const { onEnter, onEscape } = handlers;
  const { wrap = true, vimKeys = true, active = true } = options;

  const [focusedIndex, setFocusedIndex] = useState(0);
  const focusedIndexRef = useRef(focusedIndex);

  useEffect(() => {
    focusedIndexRef.current = focusedIndex;
  }, [focusedIndex]);

  const moveUp = useCallback(() => {
    setFocusedIndex((prev) => {
      if (wrap) {
        return (prev - 1 + itemCount) % itemCount;
      }
      return Math.max(0, prev - 1);
    });
  }, [itemCount, wrap]);

  const moveDown = useCallback(() => {
    setFocusedIndex((prev) => {
      if (wrap) {
        return (prev + 1) % itemCount;
      }
      return Math.min(itemCount - 1, prev + 1);
    });
  }, [itemCount, wrap]);

  useInput(
    useCallback(
      (input: string, key: Key) => {
        if (key.escape) {
          onEscape?.();
          return;
        }

        if (key.return) {
          onEnter?.(focusedIndexRef.current);
          return;
        }

        if (key.upArrow || (vimKeys && input === "k")) {
          moveUp();
          return;
        }

        if (key.downArrow || (vimKeys && input === "j")) {
          moveDown();
        }
      },
      [onEnter, onEscape, vimKeys, moveUp, moveDown],
    ),
    { isActive: active },
  );

  return { focusedIndex, setFocusedIndex };
}
