import { useLayoutEffect, useState, type RefObject } from "react"

import {
  currentIndex,
  domainStops,
  indicatorBox,
  progressAt,
  type TabBox,
} from "./domain-stops"
import { observe } from "./use-pinned"

export const DOMAIN_ANCHOR = "data-domain-anchor"
export const DOMAIN_TAB = "data-domain-tab"

export const domainAnchors = () => [
  ...document.querySelectorAll<HTMLElement>(`[${DOMAIN_ANCHOR}]`),
]

const maxScroll = () =>
  document.documentElement.scrollHeight - document.documentElement.clientHeight

const documentTopOf = (element: Element) =>
  element.getBoundingClientRect().top + window.scrollY

// Measured against the pinned bar's height: at rest its bottom edge sits lower.
export const stopsUnder = (
  bar: HTMLElement,
  anchors: readonly HTMLElement[]
) => {
  const barHeight = bar.getBoundingClientRect().height
  return domainStops(
    anchors.map((anchor) => documentTopOf(anchor) - barHeight),
    maxScroll()
  )
}

const domainsDrawn = (anchors: readonly HTMLElement[], strip: Element) =>
  anchors.length > 0
    ? anchors.map((anchor) => anchor.getAttribute(DOMAIN_ANCHOR) ?? "")
    : [strip.querySelector(`[${DOMAIN_TAB}]`)?.getAttribute(DOMAIN_TAB) ?? ""]

const tabBox = (strip: Element, domainId: string): TabBox => {
  const tab = strip.querySelector(`[${DOMAIN_TAB}="${domainId}"]`)
  if (!tab) return { left: 0, width: 0 }
  const { left, width } = tab.getBoundingClientRect()
  return { left: left - strip.getBoundingClientRect().left, width }
}

const placeIndicator = (indicator: HTMLElement, box: TabBox | undefined) => {
  if (!box) return
  indicator.style.transform = `translateX(${box.left}px)`
  indicator.style.width = `${box.width}px`
}

// Indicator and current domain read one progress, so they never disagree.
const followPage = (bar: HTMLElement, indicator: HTMLElement) => {
  const strip = indicator.parentElement
  if (!strip) return null

  const anchors = domainAnchors()
  const domains = domainsDrawn(anchors, strip)
  const progress = progressAt(stopsUnder(bar, anchors), window.scrollY)
  const tabs = domains.map((domainId) => tabBox(strip, domainId))

  placeIndicator(indicator, indicatorBox(tabs, progress))
  return domains[currentIndex(progress)] ?? null
}

// Re-subscribed every render: a query moves sections without a scroll.
export function useActiveDomain(
  bar: RefObject<HTMLElement | null>,
  indicator: RefObject<HTMLElement | null>
) {
  const [active, setActive] = useState<string | null>(null)

  useLayoutEffect(() => {
    const barElement = bar.current
    const indicatorElement = indicator.current
    if (!barElement || !indicatorElement) return
    return observe(() => setActive(followPage(barElement, indicatorElement)))
  })

  return active
}
