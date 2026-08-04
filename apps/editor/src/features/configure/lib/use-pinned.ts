import { useEffect, useState, type RefObject } from "react"

// Is this sticky element currently pinned? CSS has no selector for it.
//
// Sticky clamps `rect.top` to the offset while pinned and leaves it larger
// before, so the comparison is exact. The `bottom` guard catches the far edge,
// where the next section pushes this one up out of its offset.
const isPinned = (element: HTMLElement) => {
  const offset = parseFloat(getComputedStyle(element).top) || 0
  const { top, bottom } = element.getBoundingClientRect()
  return top <= offset + 0.5 && bottom > offset
}

const observe = (update: () => void) => {
  update()
  window.addEventListener("scroll", update, { passive: true })
  window.addEventListener("resize", update)
  return () => {
    window.removeEventListener("scroll", update)
    window.removeEventListener("resize", update)
  }
}

// For elements whose own markup changes — a re-render is the point.
export function usePinned(ref: RefObject<HTMLElement | null>) {
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    return observe(() => setPinned(isPinned(element)))
  }, [ref])

  return pinned
}

// Written straight to the DOM so CSS can style it without a render. Routing
// the domain headers' pinned state through React re-rendered every cell
// beneath them for a value only a border reads — an 88ms blocking task at 240
// cells, which is what made the sticky transition look like it jumped.
export function usePinnedAttribute(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    return observe(() => {
      const pinned = isPinned(element)
      if (pinned !== (element.dataset.pinned !== undefined)) {
        if (pinned) element.dataset.pinned = ""
        else delete element.dataset.pinned
      }
    })
  }, [ref])
}

// Published to the root so the headers can re-pin beneath the bar in CSS.
export const BAR_STUCK_ATTRIBUTE = "data-bar-stuck"

export function useBarStuckAttribute(stuck: boolean) {
  useEffect(() => {
    const root = document.documentElement
    if (stuck) root.setAttribute(BAR_STUCK_ATTRIBUTE, "")
    else root.removeAttribute(BAR_STUCK_ATTRIBUTE)
    return () => root.removeAttribute(BAR_STUCK_ATTRIBUTE)
  }, [stuck])
}
