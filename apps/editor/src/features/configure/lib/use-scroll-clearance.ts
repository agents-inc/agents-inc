import { useEffect, type RefObject } from "react"

type Edge = "top" | "bottom"

// The margin facing the page under the element.
const FACING_MARGIN = {
  top: "marginBottom",
  bottom: "marginTop",
} as const satisfies Record<Edge, keyof CSSStyleDeclaration>

// `ring-1` draws outside the control's box.
const FOCUS_RING_WIDTH = 1

// A scroll lands on a whole pixel, up to half a pixel nearer the edge.
const SCROLL_LANDING_SLACK = 0.5

// Rounded up, so a fractional box never parks the control under it.
const clearanceOf = (element: HTMLElement, edge: Edge) => {
  const air = parseFloat(getComputedStyle(element)[FACING_MARGIN[edge]])
  const box = element.getBoundingClientRect().height
  return `${Math.ceil(box + air + FOCUS_RING_WIDTH + SCROLL_LANDING_SLACK)}px`
}

// Keeps focused controls clear of pinned bars via `scroll-padding`; observed,
// since the bars change height.
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
