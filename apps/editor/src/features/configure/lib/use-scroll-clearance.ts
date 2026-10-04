import { useEffect, type RefObject } from "react"

/**
 * THE CONTROL THE KEYBOARD IS ON STAYS CLEAR OF WHAT IS PINNED OVER AN EDGE OF
 * THE WINDOW.
 *
 * Two things are: the composer docked at the foot of the column, and the filter
 * bar stuck at its head. A control scrolled into view stops at the window's
 * edge — under whichever of them sits there, with its focus ring hidden. Walking
 * down the page, a third of the first sixty Tab stops landed under the dock;
 * walking back up, Shift+Tab put them under the bar.
 *
 * `scroll-padding` on the document is the inset the browser's own
 * scroll-into-view honours, so it is the one place to say an edge of the window
 * is not somewhere to stop. Observed rather than set once, because both change
 * height: the dock grows with the draft and with a proposal, and the bar's band
 * grows as it pins.
 */
type Edge = "top" | "bottom"

/**
 * The margin on the side of the element that faces the page under it, which is
 * the air the design keeps between the two — the dock's top margin is the gap
 * above the last cell. Read off the element because it is a rem at the root's
 * sizing knob.
 */
const FACING_MARGIN = {
  top: "marginBottom",
  bottom: "marginTop",
} as const satisfies Record<Edge, keyof CSSStyleDeclaration>

/**
 * The width of the package's one focus treatment, `ring-1`, which is drawn
 * OUTSIDE the control's box. A control parked flush against the edge shows
 * everything but the side of its ring nearest the element — the bar has no
 * facing margin, so without this a control scrolled in under it kept three
 * sides of its ring.
 */
const FOCUS_RING_WIDTH = 1

/**
 * How much of the window's edge the element takes: its own box, the air on its
 * facing side, and room for a ring. Rounded UP, because the browser lands a
 * scroll on a whole pixel and the box is a fraction — a clearance that rounded
 * down would park the control a fraction of a pixel under the element it is
 * clearing.
 */
const clearanceOf = (element: HTMLElement, edge: Edge) => {
  const air = parseFloat(getComputedStyle(element)[FACING_MARGIN[edge]])
  const box = element.getBoundingClientRect().height
  return `${Math.ceil(box + air + FOCUS_RING_WIDTH)}px`
}

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
