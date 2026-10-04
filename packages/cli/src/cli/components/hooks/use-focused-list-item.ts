import { useState, useCallback, useRef } from "react";

export type Direction = "up" | "down" | "left" | "right";

type UseFocusedListItemOptions = {
  /** Wrap around when reaching boundaries (default: true) */
  wrap?: boolean;
  /** Custom column finder for skipping disabled items on horizontal nav.
   *  Receives the row, current column, and direction (+1 right, -1 left).
   *  Should return the next valid column index. */
  findValidCol?: (row: number, currentCol: number, direction: 1 | -1) => number;
  /** Called after vertical navigation to adjust the clamped column
   *  (e.g. to skip disabled items). Returns the adjusted column index. */
  adjustCol?: (row: number, clampedCol: number) => number;
  /** Called whenever focused position changes */
  onChange?: (row: number, col: number) => void;
  /** Initial row index (default: 0) */
  initialRow?: number;
  /** Initial col index (default: 0) */
  initialCol?: number;
  /** Optional predicate: when it returns true for a row index, that row is skipped during vertical navigation. */
  skipRow?: (row: number) => boolean;
};

export type FocusedPosition = { row: number; col: number };

type UseFocusedListItemResult = {
  focusedRow: number;
  focusedCol: number;
  /**
   * The position as it stands now, for a key handler. `focusedRow`/`focusedCol` are what the last
   * render painted, and a key that follows a move in the same chunk is handled before that move
   * has rendered.
   */
  currentFocus: () => FocusedPosition;
  setFocused: (row: number, col: number) => void;
  moveFocus: (direction: Direction) => void;
};

/**
 * 2D grid focus management: tracks (row, col) position and handles
 * directional movement with wrapping, column clamping,
 * and optional disabled-column skipping.
 */
export function useFocusedListItem(
  rowCount: number,
  getColCount: (row: number) => number,
  options: UseFocusedListItemOptions = {},
): UseFocusedListItemResult {
  const {
    wrap = true,
    findValidCol,
    adjustCol,
    onChange,
    initialRow = 0,
    initialCol = 0,
    skipRow,
  } = options;

  const [focusedRow, setFocusedRow] = useState(initialRow);
  const [focusedCol, setFocusedCol] = useState(initialCol);

  // The position every move starts from, written the moment focus moves rather than when the move
  // renders. Keys that arrive in one chunk — a fast typist, a paste — are handled one after another
  // with no render between them, so a copy synced during render still held the position from
  // before the burst, and the second of two moves started where the first one had.
  const focusedRowRef = useRef(focusedRow);
  const focusedColRef = useRef(focusedCol);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const applyFocus = useCallback((row: number, col: number) => {
    focusedRowRef.current = row;
    focusedColRef.current = col;
    setFocusedRow(row);
    setFocusedCol(col);
    onChangeRef.current?.(row, col);
  }, []);

  const setFocused = applyFocus;

  const currentFocus = useCallback(
    (): FocusedPosition => ({ row: focusedRowRef.current, col: focusedColRef.current }),
    [],
  );

  const findNextRow = useCallback(
    (fromRow: number, direction: 1 | -1): number => {
      if (rowCount === 0) return fromRow;
      let next = fromRow;
      for (let i = 0; i < rowCount; i++) {
        if (wrap) {
          next = (next + direction + rowCount) % rowCount;
        } else {
          next = next + direction;
          if (next < 0 || next >= rowCount) return fromRow;
        }
        if (!skipRow || !skipRow(next)) return next;
      }
      return fromRow; // All rows skipped — stay put
    },
    [rowCount, wrap, skipRow],
  );

  const moveFocus = useCallback(
    (direction: Direction) => {
      const currentRow = focusedRowRef.current;
      const currentCol = focusedColRef.current;

      if (direction === "left" || direction === "right") {
        const colCount = getColCount(currentRow);
        if (colCount === 0) return;

        const step = direction === "right" ? 1 : -1;

        if (findValidCol) {
          const newCol = findValidCol(currentRow, currentCol, step);
          applyFocus(currentRow, newCol);
        } else if (wrap) {
          const newCol = (currentCol + step + colCount) % colCount;
          applyFocus(currentRow, newCol);
        } else {
          const newCol = Math.max(0, Math.min(colCount - 1, currentCol + step));
          applyFocus(currentRow, newCol);
        }
      } else {
        const step = direction === "down" ? 1 : -1;
        const newRow = findNextRow(currentRow, step);
        const newColCount = getColCount(newRow);
        let finalCol = Math.min(currentCol, Math.max(0, newColCount - 1));

        if (adjustCol) {
          finalCol = adjustCol(newRow, finalCol);
        }

        applyFocus(newRow, finalCol);
      }
    },
    // skipRow is reached only through findNextRow, whose identity already
    // tracks it — naming it again here just churned this callback's identity.
    [getColCount, wrap, findValidCol, adjustCol, findNextRow, applyFocus],
  );

  return { focusedRow, focusedCol, currentFocus, setFocused, moveFocus };
}
