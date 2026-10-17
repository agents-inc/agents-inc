import { useEffect, useRef, useState } from "react";
import type { Ref, RefObject } from "react";
import { type DOMElement, measureElement, useInput } from "ink";
import { useMeasuredHeight } from "./use-measured-height.js";

export type UsePanelScrollResult = {
  /** The `overflow="hidden"` box. */
  viewportRef: Ref<DOMElement>;
  contentRef: RefObject<DOMElement | null>;
  contentMarginTop: number;
  hiddenAbove: number;
  hiddenBelow: number;
};

/** `↑`/`↓` line scrolling for one clipped viewport; hosts add their own `useInput` for other keys. */
export function usePanelScroll(): UsePanelScrollResult {
  const { ref: viewportRef, measuredHeight: viewportHeight } = useMeasuredHeight();
  const contentRef = useRef<DOMElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measures every render; layout changes are invisible to React
  useEffect(() => {
    if (!contentRef.current) return;
    const { height } = measureElement(contentRef.current);
    // Yoga under-reports inside a squeezed viewport; trusting that loops the render.
    setContentHeight((prev) => Math.max(prev, height));
  });

  // Not returned: gating the clip on contentHeight paints content over the border.
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
