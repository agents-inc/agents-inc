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

// Every viewport change that can move a sticky element, in one subscription.
// Exported because the domain strip watches the same two events for the same
// reason: what is under the bar is a function of scroll and of layout, and
// there is no third input.
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
export function usePinned(ref: RefObject<HTMLElement | null>) {
  const [pinned, setPinned] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    return observe(() => setPinned(isPinned(element)))
  }, [ref])

  return pinned
}

/**
 * Re-reads an element and writes the answer to its own `data-pinned`, NOW.
 *
 * The subscription below is a frame late by construction — a scroll event is
 * delivered at the next rendering opportunity — so anything that has just MOVED
 * the page cannot use it to measure what it moved. The domain jump calls this
 * between its two landings instead. A DOM write rather than a `flushSync`
 * because that jump also runs from a passive effect, where React refuses to
 * flush at all.
 *
 * @returns how much taller the element got, so a caller that owns the page's
 *   scroll can put back what the change displaced. Returned rather than acted
 *   on here: the jump below scrolls to an absolute position immediately after
 *   and would only have to undo it.
 */
export const publishPinned = (element: HTMLElement | null) => {
  if (!element) return 0

  const before = element.getBoundingClientRect().height
  if (isPinned(element)) element.dataset.pinned = ""
  else delete element.dataset.pinned

  return element.getBoundingClientRect().height - before
}

// Written straight to the DOM so CSS can style it without a render. Routing
// the domain headers' pinned state through React re-rendered every cell
// beneath them for a value only a border reads — an 88ms blocking task at 240
// cells, which is what made the sticky transition look like it jumped.
//
// AND THE PAGE IS HELD STILL ACROSS THE CHANGE. A sticky element that resizes
// as it pins pushes everything under it by the difference, so the moment the
// filter band grows to 80px the whole catalogue leaps 31px — the reader asked
// to scroll, not for the page to move under them. Scrolling by the same amount
// puts it back, and it is one continuous scroll on screen because both happen
// in the scroll step, before the frame is painted.
//
// It cannot oscillate: the correction always pushes further INTO the state just
// entered — down on pinning, up on releasing — so it can never re-cross the
// threshold it was raised by. The scroll it causes re-enters this listener once
// with nothing left to change.
export function usePinnedAttribute(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current
    if (!element) return
    return observe(() => {
      const grew = publishPinned(element)
      if (grew !== 0) window.scrollBy(0, grew)
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
