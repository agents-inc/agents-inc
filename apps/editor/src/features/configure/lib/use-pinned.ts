import { useEffect, useLayoutEffect, useState, type RefObject } from "react"

// Decided from a static, zero-height sentinel rendered right before the bar:
// it never moves when the bar changes shape, where measuring the bar itself
// flipped the state every frame.
const isPinned = (bar: HTMLElement) =>
  (bar.previousElementSibling?.getBoundingClientRect().top ?? 1) <= 0

// Every viewport change that can move a sticky element, in one subscription.
export const observe = (update: () => void) => {
  update()
  window.addEventListener("scroll", update, { passive: true })
  window.addEventListener("resize", update)
  return () => {
    window.removeEventListener("scroll", update)
    window.removeEventListener("resize", update)
  }
}

// For elements whose own markup changes — a re-render is the point.
export function usePinned(bar: RefObject<HTMLElement | null>) {
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    const element = bar.current
    if (!element) return
    return observe(() => setPinned(isPinned(element)))
  }, [bar])

  return pinned
}

/**
 * Writes the pin to the bar's `data-pinned` NOW, for a caller that has just
 * moved the page and has to measure the bar it moved: a scroll listener is a
 * frame late, and the domain jump runs from a passive effect, where
 * `flushSync` is refused.
 */
export const publishPinned = (bar: HTMLElement | null) => {
  if (!bar) return
  if (isPinned(bar)) bar.dataset.pinned = ""
  else delete bar.dataset.pinned
}

// Written straight to the DOM so CSS can style it without a render, and in a
// layout effect so a page restored mid-scroll paints pinned.
export function usePinnedAttribute(bar: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = bar.current
    if (!element) return
    return observe(() => publishPinned(element))
  }, [bar])
}

// The same fact on the root, for anything outside the bar.
export const BAR_STUCK_ATTRIBUTE = "data-bar-stuck"

export function useBarStuckAttribute(stuck: boolean) {
  useEffect(() => {
    const root = document.documentElement
    if (stuck) root.setAttribute(BAR_STUCK_ATTRIBUTE, "")
    else root.removeAttribute(BAR_STUCK_ATTRIBUTE)
    return () => root.removeAttribute(BAR_STUCK_ATTRIBUTE)
  }, [stuck])
}
