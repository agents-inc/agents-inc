import { useCallback, useEffect, useRef, useState } from "react";
import { type DOMElement, measureElement } from "ink";
import { SCROLL_VIEWPORT } from "../../consts.js";

export type UseSectionScrollOptions = {
  sectionCount: number;
  focusedIndex: number;
  availableHeight: number;
  /**
   * Minimum viewport rows before clipping engages (default {@link SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS}).
   * Views that must clip rather than bleed at very short heights (source-grid, which pairs the clip
   * with an overflow affordance) pass a lower value so the gate does not fall back to a bleeding
   * flex layout.
   */
  minViewportRows?: number;
};

export type UseSectionScrollResult = {
  setSectionRef: (index: number, el: DOMElement | null) => void;
  /** Attach to the clipping viewport box so overflow counts exclude header/affordance chrome. */
  setViewportRef: (el: DOMElement | null) => void;
  /**
   * Attach to the scrolled content box so overflow counts measure the WHOLE rendered content —
   * section-group margins and labels included — not just the sum of per-section row heights.
   */
  setContentRef: (el: DOMElement | null) => void;
  scrollEnabled: boolean;
  scrollTopPx: number;
  /** Content lines scrolled off the top of the viewport (0 when not scrolling). */
  hiddenAbove: number;
  /** Content lines clipped below the viewport (0 when everything fits). */
  hiddenBelow: number;
  /** Scroll the viewport past the focus-following position to reveal clipped rows (e.g. trailing inert rows). */
  scrollBy: (deltaRows: number) => void;
};

/**
 * Shared pixel-offset scroll hook for views with variable-height sections.
 *
 * Manages section refs, height measurement, and scroll position to keep the
 * focused section visible within a constrained viewport. Extracted from the
 * identical scroll plumbing in category-grid.tsx and source-grid.tsx.
 *
 * On top of focus-following it exposes an overscroll channel (`scrollBy`) that
 * moves the viewport BEYOND the focused row so rows that can never take focus —
 * trailing inert Sources rows — can still be scrolled into view, plus the
 * `hidden{Above,Below}` counts a `ScrollAffordance` sibling renders. Overscroll
 * resets whenever focus moves, so the viewport snaps back to follow focus.
 */
export function useSectionScroll({
  sectionCount,
  focusedIndex,
  availableHeight,
  minViewportRows = SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS,
}: UseSectionScrollOptions): UseSectionScrollResult {
  const sectionRefs = useRef<(DOMElement | null)[]>([]);
  const viewportRef = useRef<DOMElement | null>(null);
  const contentRef = useRef<DOMElement | null>(null);
  const [sectionHeights, setSectionHeights] = useState<number[]>([]);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentBoxHeight, setContentBoxHeight] = useState(0);
  const [focusScrollPx, setFocusScrollPx] = useState(0);
  const [overscrollPx, setOverscrollPx] = useState(0);

  const setSectionRef = useCallback((index: number, el: DOMElement | null) => {
    sectionRefs.current[index] = el;
  }, []);

  const setViewportRef = useCallback((el: DOMElement | null) => {
    viewportRef.current = el;
  }, []);

  const setContentRef = useCallback((el: DOMElement | null) => {
    contentRef.current = el;
  }, []);

  // A new row set (section count change) invalidates the monotonic content-height reading.
  useEffect(() => {
    setContentBoxHeight(0);
  }, [sectionCount]);

  // Measure section, viewport and content heights on every render
  useEffect(() => {
    const heights = sectionRefs.current.map((el) => {
      if (el) {
        const { height } = measureElement(el);
        return height;
      }
      return 0;
    });
    setSectionHeights((prev) => {
      if (prev.length === heights.length && prev.every((h, i) => h === heights[i])) {
        return prev;
      }
      return heights;
    });
    if (viewportRef.current) {
      const { height } = measureElement(viewportRef.current);
      setViewportHeight((prev) => (prev !== height ? height : prev));
    }
    if (contentRef.current) {
      const { height } = measureElement(contentRef.current);
      // Yoga under-reports a wrapped/clipped subtree in some layout passes, so the tallest reading
      // is the trustworthy one — mirrors info-panel/step-confirm. Reset above on row-set change.
      setContentBoxHeight((prev) => (height > prev ? height : prev));
    }
  });

  const scrollEnabled = availableHeight > 0 && availableHeight >= minViewportRows;

  // The measured content box includes section-group margins and labels; the per-section sum omits
  // them, so it is only the fallback for consumers that do not attach a content ref (category-grid).
  const contentHeight =
    contentBoxHeight > 0 ? contentBoxHeight : sectionHeights.reduce((sum, h) => sum + h, 0);
  // The measured viewport box excludes the header and affordance rows (both
  // siblings of it), so it is the height the sections actually get. Before the
  // first measurement, fall back to availableHeight (which category-grid always
  // uses — it has no separate header outside the viewport).
  const effectiveViewport = viewportHeight > 0 ? viewportHeight : availableHeight;
  const maxScrollPx = scrollEnabled ? Math.max(0, contentHeight - effectiveViewport) : 0;

  // Mirror the latest values into refs so `scrollBy` can clamp against them while
  // staying a stable callback (no re-created handler per render).
  const maxScrollRef = useRef(0);
  maxScrollRef.current = maxScrollPx;
  const focusScrollRef = useRef(0);
  focusScrollRef.current = focusScrollPx;

  // Keep focused section visible
  useEffect(() => {
    if (!scrollEnabled || sectionHeights.length === 0) return;

    let topOfFocused = 0;
    for (let i = 0; i < focusedIndex; i++) {
      topOfFocused += sectionHeights[i] ?? 0;
    }
    const focusedHeight = sectionHeights[focusedIndex] ?? 0;
    const bottomOfFocused = topOfFocused + focusedHeight;

    setFocusScrollPx((prev) => {
      if (topOfFocused < prev) {
        return topOfFocused;
      }
      if (bottomOfFocused > prev + effectiveViewport) {
        return bottomOfFocused - effectiveViewport;
      }
      return prev;
    });
  }, [focusedIndex, sectionHeights, scrollEnabled, effectiveViewport]);

  // Overscroll is user travel beyond the focus-following position. It resets on
  // focus movement so the viewport tracks the focused row again.
  useEffect(() => {
    setOverscrollPx(0);
  }, [focusedIndex]);

  const scrollBy = useCallback((deltaRows: number) => {
    setOverscrollPx((prev) => {
      const maxOverscroll = Math.max(0, maxScrollRef.current - focusScrollRef.current);
      return Math.min(maxOverscroll, Math.max(0, prev + deltaRows));
    });
  }, []);

  const scrollTopPx = Math.min(maxScrollPx, focusScrollPx + overscrollPx);
  const hiddenAbove = scrollEnabled ? scrollTopPx : 0;
  const hiddenBelow = scrollEnabled ? Math.max(0, maxScrollPx - scrollTopPx) : 0;

  return {
    setSectionRef,
    setViewportRef,
    setContentRef,
    scrollEnabled,
    scrollTopPx,
    hiddenAbove,
    hiddenBelow,
    scrollBy,
  };
}

/**
 * Pure function for row-based scroll offset computation.
 *
 * For views with uniform 1-line rows (step-agents, checkbox-grid, step-settings),
 * computes the scroll offset (in rows) to keep `focusedRow` visible within
 * a viewport of `viewportHeight` rows.
 */
export function computeRowScrollTop(
  focusedRow: number,
  currentScrollTop: number,
  viewportHeight: number,
): number {
  if (focusedRow < currentScrollTop) {
    return focusedRow;
  }
  if (focusedRow + 1 > currentScrollTop + viewportHeight) {
    return focusedRow + 1 - viewportHeight;
  }
  return currentScrollTop;
}
