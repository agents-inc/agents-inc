import type { Dispatch, SetStateAction } from "react";
import { useState, useCallback, useRef } from "react";
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

  const [focusedIndex, setRenderedIndex] = useState(0);
  // The focus the handlers read, written the moment it moves rather than once the move renders.
  // Keys that arrive in one chunk — a fast typist, a paste — are handled one after another with no
  // render between them, so a copy synced by an effect still held the focus from before the burst
  // when Enter read it: Down, Down, Enter on the dashboard ran Edit.
  const focusedIndexRef = useRef(focusedIndex);

  const setFocusedIndex = useCallback<Dispatch<SetStateAction<number>>>((action) => {
    const next = typeof action === "function" ? action(focusedIndexRef.current) : action;
    focusedIndexRef.current = next;
    setRenderedIndex(next);
  }, []);

  const moveUp = useCallback(() => {
    setFocusedIndex((prev) => {
      if (wrap) {
        return (prev - 1 + itemCount) % itemCount;
      }
      return Math.max(0, prev - 1);
    });
  }, [itemCount, wrap, setFocusedIndex]);

  const moveDown = useCallback(() => {
    setFocusedIndex((prev) => {
      if (wrap) {
        return (prev + 1) % itemCount;
      }
      return Math.min(itemCount - 1, prev + 1);
    });
  }, [itemCount, wrap, setFocusedIndex]);

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
