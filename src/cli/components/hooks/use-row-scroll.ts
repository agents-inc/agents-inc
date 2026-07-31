import { useRef } from "react";
import { SCROLL_VIEWPORT } from "../../consts.js";
import { computeRowScrollTop } from "./use-section-scroll.js";

export type UseRowScrollOptions = {
  focusedIndex: number;
  itemCount: number;
  availableHeight: number;
};

export type UseRowScrollResult = {
  scrollEnabled: boolean;
  scrollTop: number;
};

/**
 * Row-based scroll hook for views with uniform 1-line rows.
 *
 * Manages a scroll offset (in rows) to keep the focused row visible within
 * a constrained viewport. Extracted from the identical scroll plumbing in
 * checkbox-grid.tsx, step-agents.tsx, and stack-selection.tsx.
 *
 * Deliberately exposes NO hidden-line counts — unlike `useSectionScroll`, which
 * computes them for the `ScrollAffordance` the Sources grid renders. Every
 * consumer here (Domains, Agents, Stack) clips silently by owner decision: a
 * half-cut row is self-evident, and a counted hint would cost the viewport a row
 * to say the same thing. Adding the counts is a product change, not a gap.
 */
export function useRowScroll({
  focusedIndex,
  itemCount,
  availableHeight,
}: UseRowScrollOptions): UseRowScrollResult {
  const scrollTopRef = useRef(0);

  const scrollEnabled =
    availableHeight > 0 &&
    availableHeight >= SCROLL_VIEWPORT.MIN_VIEWPORT_ROWS &&
    itemCount > availableHeight;

  if (scrollEnabled) {
    scrollTopRef.current = computeRowScrollTop(focusedIndex, scrollTopRef.current, availableHeight);
  }

  return { scrollEnabled, scrollTop: scrollTopRef.current };
}
