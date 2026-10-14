import { useEffect, type RefObject } from "react"

type Edge = "top" | "bottom"

/** The air the design keeps between the element and the page under it. */
const FACING_MARGIN = {
  top: "marginBottom",
  bottom: "marginTop",
} as const satisfies Record<Edge, keyof CSSStyleDeclaration>

/** `ring-1`, which is drawn outside the control's box. */
const FOCUS_RING_WIDTH = 1

/**
 * A scroll lands on the nearest whole pixel, so a control with a fractional top
 * can stop up to half a pixel nearer the edge than the padding asked for.
 */
const SCROLL_LANDING_SLACK = 0.5

/** Rounded up, so a fractional box never parks the control under it. */
const clearanceOf = (element: HTMLElement, edge: Edge) => {
  const air = parseFloat(getComputedStyle(element)[FACING_MARGIN[edge]])
  const box = element.getBoundingClientRect().height
  return `${Math.ceil(box + air + FOCUS_RING_WIDTH + SCROLL_LANDING_SLACK)}px`
}

/**
 * Keeps the focused control clear of what is pinned over an edge of the window
 * — the docked composer and the stuck filter bar — through the document's
 * `scroll-padding`, which the browser's own scroll-into-view honours. Observed
 * rather than set once, because both change height.
 */
export function useScrollClearance(
  ref: RefObject<HTMLElement | null>,
  edge: Edge
) {
  useEffect(() => {
    const element = ref.current
    if (!element) return

    const page = document.documentElement
    const property = `scroll-padding-${edge}`
    const observer = new ResizeObserver(() => {
      page.style.setProperty(property, clearanceOf(element, edge))
    })
    observer.observe(element)

    return () => {
      observer.disconnect()
      page.style.removeProperty(property)
    }
  }, [ref, edge])
}
