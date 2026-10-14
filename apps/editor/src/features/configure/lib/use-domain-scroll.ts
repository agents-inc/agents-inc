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

// Floored: both measurements are fractional, and scrolling a fraction less can
// only leave the section's top below the bar's underside, never beneath it.
const land = (bar: HTMLElement, domainId: string) => {
  const anchors = domainAnchors()
  const stop = stopsUnder(bar, anchors)[indexOf(anchors, domainId)]
  if (stop !== undefined) window.scrollTo(0, Math.floor(stop))
}

/**
 * Puts a domain on its stop, spread or not, so the indicator lands fully under
 * its tab. Twice: the first landing pins the bar, which changes its height, and
 * the second is measured against the bar the reader ends up under.
 *
 * @returns whether the domain was on the page to jump to.
 */
export const scrollToDomain = (bar: HTMLElement | null, domainId: string) => {
  if (!bar || indexOf(domainAnchors(), domainId) === -1) return false

  land(bar, domainId)
  publishPinned(bar)
  land(bar, domainId)
  return true
}

/**
 * An address naming a domain opens at that domain's section.
 *
 * @param rendered the domain ids drawn in the column, in order
 */
export function useDomainOnArrival(
  bar: RefObject<HTMLElement | null>,
  domain: string | null,
  rendered: readonly string[]
) {
  // Read once and then spent: a later pick scrolls from its own click handler,
  // and watching the value would jump again on every re-render.
  const wanted = useRef(domain)

  // What this waits for is the anchors appearing: a shared address seats its
  // catalogue after the first paint.
  const key = rendered.join(" ")

  const [routerSettled, setRouterSettled] = useState(false)
  const router = useRouter()

  // The router resets the scroll on every navigation it was not told otherwise
  // about, the initial load included, so the jump waits for `onRendered`. A
  // layout effect, because that emit comes from a sibling's layout effect and a
  // passive subscription would miss the only one a plain arrival produces.
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
