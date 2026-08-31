import { useEffect, useState, type RefObject } from "react"

import { observe } from "./use-pinned"

/**
 * WHICH DOMAIN THE COLUMN IS SHOWING — the strip's job when nothing is picked.
 *
 * The domain tabs are a scroll indicator first and a control second. Pick one
 * and it filters the column, and the pick owns the active state; pick nothing
 * and the strip follows the page, naming whichever section has passed under
 * the bar. That second half is what makes the strip a map rather than a row of
 * filters, and it is the half that has no CSS equivalent — `position: sticky`
 * can pin an element but cannot tell anything else that it did.
 *
 * MEASURED, NOT OBSERVED. An `IntersectionObserver` answers "is this section on
 * screen", and several always are — the question here is which of them is
 * nearest the bar's underside, which is an ordering over positions rather than
 * a set of booleans. So this reads the anchors' own rects on scroll, exactly as
 * `usePinned` reads the bar's.
 */

// Every domain section drops one of these at its top edge, carrying the domain
// id. Zero-height, so it marks a position without occupying one — the section
// keeps whatever spacing the rule above it gives it.
export const DOMAIN_ANCHOR = "data-domain-anchor"

// How far past the bar's underside a section's top edge has to travel before it
// owns the strip. The design's own figure, and it is not decoration: without it
// a section takes the strip the pixel its first row slides under the bar, and
// the two-pixel scroll that follows hands it straight back.
const CLEARANCE = 20

const domainAnchors = () => [
  ...document.querySelectorAll<HTMLElement>(`[${DOMAIN_ANCHOR}]`),
]

const hasPassed = (anchor: HTMLElement, edge: number) =>
  anchor.getBoundingClientRect().top <= edge

const domainOf = (anchor: HTMLElement | undefined) =>
  anchor?.getAttribute(DOMAIN_ANCHOR) ?? null

/**
 * The last domain whose top edge has passed under the bar — or the first one on
 * the page before any has.
 *
 * The fallback is what makes the strip answer at scroll 0, where nothing has
 * passed anything: the column is showing its first domain, so the first tab is
 * the honest answer rather than none.
 */
const domainUnderBar = (bar: HTMLElement) => {
  const edge = bar.getBoundingClientRect().bottom + CLEARANCE
  const anchors = domainAnchors()
  const passed = anchors.filter((anchor) => hasPassed(anchor, edge))

  return domainOf(passed.at(-1) ?? anchors.at(0))
}

/**
 * @param bar the sticky wrapper the sections pass under
 * @param rendered the domain ids currently drawn in the column, in order
 */
export function useActiveDomain(
  bar: RefObject<HTMLElement | null>,
  rendered: readonly string[]
) {
  const [active, setActive] = useState<string | null>(null)

  // Joined rather than depended on as an array: the caller derives it fresh on
  // every render, so its identity changes when nothing about it has. What the
  // effect actually cares about is the SET of anchors on the page, and a change
  // to that set has to re-derive immediately rather than on the next scroll —
  // releasing a filter re-renders eight sections without moving the page at
  // all, and a strip still naming the released domain is pointing at a filter
  // that is gone.
  const key = rendered.join(" ")

  useEffect(() => {
    const element = bar.current
    if (!element) return

    return observe(() => setActive(domainUnderBar(element)))
  }, [bar, key])

  return active
}
