import { useRouter } from "@tanstack/react-router"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"

import { DOMAIN_ANCHOR, domainAnchors, stopsUnder } from "./use-active-domain"
import { publishPinned } from "./use-pinned"

const indexOf = (anchors: readonly HTMLElement[], domainId: string) =>
  anchors.findIndex((anchor) => anchor.getAttribute(DOMAIN_ANCHOR) === domainId)

// Floored, so the section's top stays below the bar, never under it.
const land = (bar: HTMLElement, domainId: string) => {
  const anchors = domainAnchors()
  const stop = stopsUnder(bar, anchors)[indexOf(anchors, domainId)]
  if (stop !== undefined) window.scrollTo(0, Math.floor(stop))
}

// Lands twice: the first pins the bar, changing its height. Returns whether the
// domain was on the page.
export const scrollToDomain = (bar: HTMLElement | null, domainId: string) => {
  if (!bar || indexOf(domainAnchors(), domainId) === -1) return false

  land(bar, domainId)
  publishPinned(bar)
  land(bar, domainId)
  return true
}

export function useDomainOnArrival(
  bar: RefObject<HTMLElement | null>,
  domain: string | null,
  rendered: readonly string[]
) {
  // Read once: watching the value would jump again on every re-render.
  const wanted = useRef(domain)

  // A shared address seats its catalogue after the first paint.
  const key = rendered.join(" ")

  const [routerSettled, setRouterSettled] = useState(false)
  const router = useRouter()

  // The router resets scroll on load, so the jump waits for `onRendered`. A
  // layout effect: that emit comes from a sibling's layout effect.
  useLayoutEffect(
    () => router.subscribe("onRendered", () => setRouterSettled(true)),
    [router]
  )

  useEffect(() => {
    if (!routerSettled) return

    const domainId = wanted.current
    if (domainId === null) return

    if (scrollToDomain(bar.current, domainId)) wanted.current = null
  }, [bar, key, routerSettled])
}
