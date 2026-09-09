import { useRouter } from "@tanstack/react-router"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react"

import { DOMAIN_ANCHOR } from "./use-active-domain"
import { publishPinned } from "./use-pinned"

/**
 * PUTTING A DOMAIN'S SECTION UNDER THE BAR — the write half of the strip.
 *
 * `use-active-domain.ts` reads which section the column is showing; this one
 * puts a section there. Picking a tab is a jump down the page rather than a
 * filter, so nothing here touches what is rendered.
 */

const anchorOf = (domainId: string) =>
  document.querySelector<HTMLElement>(`[${DOMAIN_ANCHOR}="${domainId}"]`)

// How far the page has to move to bring an anchor to rest on the bar's
// underside — the section's distance from the top of the window, less the
// height of the thing pinned over it.
const offsetToUnderBar = (anchor: HTMLElement, bar: HTMLElement) =>
  anchor.getBoundingClientRect().top - bar.getBoundingClientRect().height

// FLOORED, and it is the difference between landing under the bar and landing
// just clear of it. Both measurements are fractional — the bar's height is rem
// against a root carrying a 110% knob — and the browser snaps the resulting
// scroll position to a device pixel, so an exact target rounds either way.
// Flooring scrolls a fraction LESS, which can only ever leave the section's top
// edge below the bar's underside rather than beneath it.
const land = (anchor: HTMLElement, bar: HTMLElement) =>
  window.scrollTo(0, Math.floor(window.scrollY + offsetToUnderBar(anchor, bar)))

/**
 * Lands a domain's top edge just under the bar's underside.
 *
 * THE BAR'S HEIGHT IS MEASURED, never named. It is the design's own figure in
 * rem against a root set to 110%, so no constant written here could convert;
 * and the offset is the whole point, because the bar pins over the column and
 * a jump that ignored it would leave the section's first row underneath the
 * thing that jumped to it.
 *
 * TWICE, AND THE SECOND IS NOT A RETRY. The bar is not one height — the search
 * band grows 31px as it pins — and the first scroll is what pins it, so the
 * measurement that aimed the jump is stale by the time it lands.
 * `publishPinned` makes the bar admit the pin, and the second landing is the
 * one measured against the bar the reader ends up under. Both are in one task
 * and neither paints, so this is one jump rather than two.
 *
 * It is also why that height is CSS off `data-pinned` rather than part of the
 * React class the rest of the pinned treatment rides on: the arrival jump runs
 * in a passive effect, where `flushSync` is refused outright.
 *
 * `window.scrollTo` rather than `scrollIntoView`: `scrollIntoView` walks every
 * scrollable ancestor and takes its own view of where "into view" is, and the
 * offset here is a measurement this function has already made. The strip used
 * to refuse it for the same reason, in a `useTabInView` that kept the current
 * tab inside its own scroll box — the strip is equal cells spanning the column
 * now and has no scroll box, so this is the only caller left with the argument. Instant rather than smooth,
 * which is what every other scroll in this app is — and what a reader who has
 * asked for less motion would want anyway.
 *
 * @returns whether the anchor was on the page to jump to.
 */
export const scrollToDomain = (bar: HTMLElement | null, domainId: string) => {
  const anchor = anchorOf(domainId)
  if (!bar || !anchor) return false

  land(anchor, bar)
  publishPinned(bar)
  land(anchor, bar)
  return true
}

/**
 * An address naming a domain OPENS at that domain's section.
 *
 * This is what `?domain=api` means now that a pick no longer filters: a link
 * still says "take me to API", and this is the half that honours it on arrival.
 *
 * @param bar the sticky wrapper the sections pass under
 * @param domain what the address asked for, or null
 * @param rendered the domain ids currently drawn in the column, in order
 */
export function useDomainOnArrival(
  bar: RefObject<HTMLElement | null>,
  domain: string | null,
  rendered: readonly string[]
) {
  // Read at the first render and then spent: this is what the ADDRESS asked
  // for, not what the reader has since asked for. A pick made later scrolls
  // from the click handler and writes itself to the URL as it goes, so an
  // effect that went on watching the value would jump a second time for every
  // click — and would drag a reader who had scrolled elsewhere back to the
  // domain they picked minutes ago the moment anything else re-rendered.
  const wanted = useRef(domain)

  // Joined rather than depended on as an array, exactly as `useActiveDomain`
  // does: the caller derives it fresh every render. What this is waiting for is
  // the ANCHORS appearing, and the anchors are what this set names — a shared
  // address seats its catalogue after the first paint, so an address carrying
  // `fromId` and `domain` together has nothing to scroll to when it arrives.
  const key = rendered.join(" ")

  const [routerSettled, setRouterSettled] = useState(false)
  const router = useRouter()

  // THE ROUTER OWNS THE SCROLL UNTIL IT SAYS IT HAS RENDERED, and it puts the
  // window back at the top of every navigation it was not told otherwise about
  // — which the initial load, the one carrying the address being honoured here,
  // always is. So the jump has to come after that, and this is the event that
  // says when: the router's own scroll reset is an `onRendered` subscriber
  // registered when the router was created, and subscribers run in the order
  // they were added, so anything subscribing from a component runs after it.
  //
  // A LAYOUT EFFECT, and that is the half that has to be right rather than a
  // preference: the emit comes from `OnRendered`'s own layout effect, and that
  // component is a SIBLING rendered after the match this screen is inside. A
  // passive effect here would subscribe after the whole commit's layout
  // effects, so the first emit — the only one a plain arrival ever produces —
  // would already have been and gone.
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
