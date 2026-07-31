import { useEffect, useRef, useState } from "react";
import type { Ref, RefObject } from "react";
import { type DOMElement, measureElement, useInput } from "ink";
import { useMeasuredHeight } from "./use-measured-height.js";

export type UsePanelScrollResult = {
  /** Attach to the clipping box — the one with `overflow="hidden"`. */
  viewportRef: Ref<DOMElement>;
  /** Attach to the scrolled content box inside the viewport. */
  contentRef: RefObject<DOMElement>;
  /** Apply as the content box's `marginTop`; negative by the number of lines scrolled off the top. */
  contentMarginTop: number;
  /** Content lines scrolled off the top of the viewport. */
  hiddenAbove: number;
  /** Content lines clipped below the viewport. */
  hiddenBelow: number;
};

/**
 * Line scrolling for a single clipped viewport, driven by the `↑`/`↓` keys.
 *
 * The caller renders viewport, content and a `ScrollAffordance` sibling; this
 * owns the offset those three agree on. Distinct from `useSectionScroll`, which
 * moves a viewport to follow focus across variable-height sections — here there
 * is no focus, only the arrow keys.
 *
 * A host that needs other keys adds its own `useInput` alongside it, on keys
 * disjoint from `↑`/`↓`.
 */
export function usePanelScroll(): UsePanelScrollResult {
  // Measured on the clipping box itself, inside the border and padding, so it
  // is the height the content actually gets.
  const { ref: viewportRef, measuredHeight: viewportHeight } = useMeasuredHeight();
  const contentRef = useRef<DOMElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    const { height } = measureElement(contentRef.current);
    // Yoga under-reports a wrapped subtree measured inside a viewport too
    // short to lay it out, and reports 0 inside a zero-height one, so the
    // tallest reading is the trustworthy one. Believing a squeezed reading
    // would shrink the hidden-line count until the affordance disappeared,
    // which hands its row back and grows the count again — a render loop.
    setContentHeight((prev) => Math.max(prev, height));
  });

  // contentHeight only ever sizes the scroll range and the affordance count.
  // It must never gate the clip — which is why it is not returned: a viewport
  // that stops clipping when it looks too small grows to content height, which
  // makes it look big enough to stop clipping — a stable wrong answer that
  // paints the content over the border.
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const hiddenBelow = Math.max(0, maxScroll - scrollOffset);

  useInput((_input, key) => {
    if (key.upArrow) setScrollOffset((prev) => Math.max(0, prev - 1));
    if (key.downArrow) setScrollOffset((prev) => Math.min(maxScroll, prev + 1));
  });

  return {
    viewportRef,
    contentRef,
    contentMarginTop: scrollOffset > 0 ? -scrollOffset : 0,
    hiddenAbove: scrollOffset,
    hiddenBelow,
  };
}
