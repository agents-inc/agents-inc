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

const paddingProperty = (edge: Edge) => `scroll-padding-${edge}`

const clearanceVariable = (edge: Edge) => `--scroll-clearance-${edge}`

// Keeps focused controls clear of pinned bars via `scroll-padding`; observed,
// since the bars change height. Also published as `--scroll-clearance-<edge>`,
// which the toasts sit clear of.
export function useScrollClearance(
  ref: RefObject<HTMLElement | null>,
  edge: Edge
) {
  useEffect(() => {
    const element = ref.current
    if (!element) return

    const page = document.documentElement
    const properties = [paddingProperty(edge), clearanceVariable(edge)]
    const observer = new ResizeObserver(() => {
      const clearance = clearanceOf(element, edge)
      for (const property of properties)
        page.style.setProperty(property, clearance)
    })
    observer.observe(element)

    return () => {
      observer.disconnect()
      for (const property of properties) page.style.removeProperty(property)
    }
  }, [ref, edge])
}

const landsInside = (element: HTMLElement, next: EventTarget | null) =>
  next instanceof Node && element.contains(next)

// The element's own controls sit inside its clearance, so focusing one would
// scroll the page to reveal what is already on screen. The browser scrolls
// after the `focusout` naming the control focus moves to, so the clearance is
// lifted from there until the next frame. A focus with nothing to leave
// fires no `focusout`, and keeps it.
export function useFocusInsideSkipsClearance(
  ref: RefObject<HTMLElement | null>,
  edge: Edge
) {
  useEffect(() => {
    const element = ref.current
    if (!element) return

    const page = document.documentElement
    const padding = paddingProperty(edge)
    const restoreClearance = () =>
      page.style.setProperty(
        padding,
        page.style.getPropertyValue(clearanceVariable(edge))
      )
    let frame = 0

    const liftForFocusInside = (event: FocusEvent) => {
      if (!landsInside(element, event.relatedTarget)) return
      page.style.setProperty(padding, "0px")
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(restoreClearance)
    }
    document.addEventListener("focusout", liftForFocusInside, true)

    return () => {
      document.removeEventListener("focusout", liftForFocusInside, true)
      cancelAnimationFrame(frame)
      restoreClearance()
    }
  }, [ref, edge])
}
