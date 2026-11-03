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

const NO_CLEARANCE = "0px"

// Rounded up, so a fractional box never parks the control under it.
const clearanceOf = (element: HTMLElement, edge: Edge) => {
  const air = parseFloat(getComputedStyle(element)[FACING_MARGIN[edge]])
  const box = element.getBoundingClientRect().height
  return `${Math.ceil(box + air + FOCUS_RING_WIDTH + SCROLL_LANDING_SLACK)}px`
}

const paddingProperty = (edge: Edge) => `scroll-padding-${edge}`

const clearanceVariable = (edge: Edge) => `--scroll-clearance-${edge}`

// The element pins over the column, so the rail, the dialogs and its own
// controls are never under it. With focus nowhere, whatever scrolls into view
// next may be.
const canHide = (element: HTMLElement, focused: EventTarget | null) => {
  if (!(focused instanceof Node)) return true
  if (element.contains(focused)) return false
  return element.closest("main")?.contains(focused) ?? false
}

// Observed, since the bars change height.
const publishClearance = (element: HTMLElement, edge: Edge) => {
  const page = document.documentElement
  const variable = clearanceVariable(edge)
  const observer = new ResizeObserver(() =>
    page.style.setProperty(variable, clearanceOf(element, edge))
  )
  observer.observe(element)

  return () => {
    observer.disconnect()
    page.style.removeProperty(variable)
  }
}

// A control the element cannot hide is already on screen, and with the
// clearance the browser scrolls the page to reveal it on every focus and
// keystroke. Both events run before that scroll; only `focusout` names a focus
// that goes nowhere.
const padForFocus = (element: HTMLElement, edge: Edge) => {
  const page = document.documentElement
  const padding = paddingProperty(edge)
  const padFor = (focused: EventTarget | null) =>
    page.style.setProperty(
      padding,
      canHide(element, focused)
        ? `var(${clearanceVariable(edge)})`
        : NO_CLEARANCE
    )
  const onFocusIn = (event: FocusEvent) => padFor(event.target)
  const onFocusOut = (event: FocusEvent) => padFor(event.relatedTarget)

  padFor(null)
  document.addEventListener("focusin", onFocusIn, true)
  document.addEventListener("focusout", onFocusOut, true)

  return () => {
    document.removeEventListener("focusin", onFocusIn, true)
    document.removeEventListener("focusout", onFocusOut, true)
    page.style.removeProperty(padding)
  }
}

// Keeps focused controls clear of pinned bars via `scroll-padding`, and
// publishes the clearance as `--scroll-clearance-<edge>` for the toasts to sit
// clear of.
export function useScrollClearance(
  ref: RefObject<HTMLElement | null>,
  edge: Edge
) {
  useEffect(() => {
    const element = ref.current
    if (!element) return

    const stopPublishing = publishClearance(element, edge)
    const stopPadding = padForFocus(element, edge)

    return () => {
      stopPadding()
      stopPublishing()
    }
  }, [ref, edge])
}
