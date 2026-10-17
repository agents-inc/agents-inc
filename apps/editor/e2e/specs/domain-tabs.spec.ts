import type { Locator } from "@playwright/test"

import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"
import { DOMAINS } from "../support/catalog"

const { web, api, ai } = DOMAINS

// The catalogue's last domain.
const SHARED = "Shared"

// A jump lands the section's top on the bar's underside, floored to the pixel.
// Polled: the gap reads a couple of px wide until the pinned bar settles.
const LANDING_WINDOW = 2

const TAB_HEIGHT = 46

const INDICATOR = '[data-slot="domain-indicator"]'

const boxOf = async (locator: Locator, what: string) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${what} must be drawn`)
  return box
}

const indicatorOf = (configure: ConfigurePage) =>
  configure.domainTabs.locator(INDICATOR)

const designPx = async (configure: ConfigurePage, px: number) =>
  px /
  ((await configure.page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize)
  )) /
    16)

// The scroll position at which each domain's top meets the pinned bar's
// underside, by domain id. Read while pinned.
const pinnedStops = async (
  configure: ConfigurePage
): Promise<Record<string, number>> => {
  await configure.scrollToDomain("api")
  await expect.poll(() => configure.isBarStuck()).toBe(true)

  return configure.page.evaluate(() => {
    const bar = document.querySelector('[data-slot="filter-bar"]')
    if (!bar) throw new Error("the bar must be drawn")
    const edge = bar.getBoundingClientRect().bottom

    return Object.fromEntries(
      [...document.querySelectorAll("[data-domain-anchor]")].map(
        (anchor): [string, number] => [
          anchor.getAttribute("data-domain-anchor") ?? "",
          anchor.getBoundingClientRect().top + window.scrollY - edge,
        ]
      )
    )
  })
}

const scrollBetween = async (
  configure: ConfigurePage,
  from: string,
  to: string,
  t: number
) => {
  const stops = await pinnedStops(configure)
  const [a, b] = [stops[from], stops[to]]
  if (a === undefined || b === undefined)
    throw new Error(`no stop for ${from} or ${to}`)

  await configure.scrollTo(a + (b - a) * t)
}

// Re-read on every poll: the tabs change shape as the bar pins.
const offsetFromTab = async (configure: ConfigurePage, label: string) => {
  const tab = await boxOf(configure.domainTab(label), `the ${label} tab`)
  const bar = await boxOf(indicatorOf(configure), "the indicator")
  return {
    x: bar.x - tab.x,
    width: bar.width - tab.width,
    bottom: bar.y + bar.height - (tab.y + tab.height),
  }
}

const expectIndicatorUnder = async (
  configure: ConfigurePage,
  label: string
) => {
  await expect(indicatorOf(configure)).toBeVisible()

  await expect
    .poll(() => offsetFromTab(configure, label))
    .toStrictEqual({
      x: expect.closeTo(0, 0),
      width: expect.closeTo(0, 0),
      bottom: expect.closeTo(0, 0),
    })
}

const expectLanded = async (configure: ConfigurePage, domainId: string) => {
  const gap = () => configure.domainGapUnderBar(domainId)

  await expect.poll(gap).toBeGreaterThanOrEqual(0)
  await expect.poll(gap).toBeLessThan(LANDING_WINDOW)
}

const labelsCut = (configure: ConfigurePage) =>
  configure.domainTabs.evaluate((strip) =>
    [...strip.querySelectorAll("button *")]
      .filter((node) => node.scrollWidth > node.clientWidth)
      .map((node) => node.textContent)
  )

// Picking a tab jumps and filters nothing, so `aria-current` is the strip's one
// claim.
test.describe("the domain strip", () => {
  test("renders one tab per domain, all of them at once", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).toBeVisible()
    await expect(configure.domainTab(api)).toBeVisible()
    await expect(configure.domainTab(ai)).toBeVisible()
  })

  test("spends the same width on every domain and never overflows", async ({
    configure,
  }) => {
    const apiTab = await boxOf(configure.domainTab(api), "the API tab")
    const aiTab = await boxOf(configure.domainTab(ai), "the AI tab")
    expect(Math.abs(apiTab.width - aiTab.width)).toBeLessThanOrEqual(1)

    const strip = configure.domainTabs
    expect(await strip.evaluate((node) => node.scrollWidth)).toBe(
      await strip.evaluate((node) => node.clientWidth)
    )
  })

  test("draws each tab 46 design px tall", async ({ configure }) => {
    const tab = await boxOf(configure.domainTab(web), "the Web tab")

    expect(await designPx(configure, tab.height)).toBeCloseTo(TAB_HEIGHT, 0)
  })

  // A label that jumped size on selection reflowed the column and moved
  // which domain the page called current.
  test("draws the active label at the same size as the others", async ({
    configure,
  }) => {
    const sizeOf = (label: string) =>
      configure.domainTab(label).evaluate((tab, text) => {
        const node = [...tab.querySelectorAll("span")].find(
          (span) => span.textContent === text
        )
        if (!node) throw new Error(`no label reading ${text}`)
        return getComputedStyle(node).fontSize
      }, label)

    await expect(configure.activeDomainTab).toContainText(web)

    expect(await sizeOf(web)).toBe(await sizeOf(api))
  })

  test("carries its count and no index, neither in its name", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).toHaveAccessibleName(web)
    await expect(configure.domainTab(web)).toHaveText(
      new RegExp(`^${web}\\d+$`)
    )
  })

  test("opens on the first domain, with the whole catalogue under it", async ({
    configure,
  }) => {
    await expect(configure.activeDomainTab).toHaveCount(1)
    await expect(configure.activeDomainTab).toContainText(web)
    await expect(configure.domain(api)).toBeVisible()
  })

  // The channel for this negative is the `aria-current` test below, which
  // reads a value off the same locators.
  test("claims no pressed state, current or otherwise", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).not.toHaveAttribute("aria-pressed")

    await configure.domainTab(api).click()

    await expect(configure.domainTab(api)).not.toHaveAttribute("aria-pressed")
  })

  test("publishes the domain you are looking at as the current one", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).toHaveAttribute(
      "aria-current",
      "true"
    )
    await expect(configure.domainTab(api)).toHaveAttribute(
      "aria-current",
      "false"
    )
  })
})

test.describe("legibility", () => {
  for (const width of [1200, 1500]) {
    test.describe(`at ${width} wide`, () => {
      test.use({ viewport: { width, height: 1000 } })

      test("cuts no label", async ({ configure }) => {
        expect(await labelsCut(configure)).toStrictEqual([])
      })
    })
  }
})

test.describe("the indicator", () => {
  test("is one 2px bar, and the active tab draws no rule of its own", async ({
    configure,
  }) => {
    await expect(indicatorOf(configure)).toHaveCount(1)
    await expect(indicatorOf(configure)).toHaveAttribute("aria-hidden", "true")
    await expect(indicatorOf(configure)).toHaveCSS("height", "2px")
    await expect(indicatorOf(configure)).toHaveCSS(
      "background-color",
      await configure.tokenColor("--color-brand")
    )

    await expect(configure.activeDomainTab).toContainText(web)
    await expect(configure.activeDomainTab).not.toHaveCSS(
      "box-shadow",
      /0px -2px 0px/
    )
  })

  test("sits under the first tab at rest", async ({ configure }) => {
    await expectIndicatorUnder(configure, web)
  })

  test("sits halfway between Web and API halfway between their stops", async ({
    configure,
  }) => {
    await expect(indicatorOf(configure)).toBeVisible()
    await scrollBetween(configure, "web", "api", 0.5)

    await expect
      .poll(async () => {
        const webTab = await boxOf(configure.domainTab(web), "the Web tab")
        const apiTab = await boxOf(configure.domainTab(api), "the API tab")
        const bar = await boxOf(indicatorOf(configure), "the indicator")
        return bar.x - (webTab.x + apiTab.x) / 2
      })
      .toBeCloseTo(0, 0)
  })

  test("sits under the tab a pick jumped to", async ({ configure }) => {
    await configure.domainTab(api).click()

    await expectIndicatorUnder(configure, api)
  })

  test("sits under the current tab while the bar is stuck", async ({
    configure,
  }) => {
    await configure.domainTab(ai).click()
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.activeDomainTab).toContainText(ai)
    await expectIndicatorUnder(configure, ai)
  })

  test("follows a resize", async ({ configure }) => {
    await expectIndicatorUnder(configure, web)

    await configure.page.setViewportSize({ width: 1300, height: 1000 })

    await expectIndicatorUnder(configure, web)
  })
})

test.describe("picking a domain from the strip", () => {
  test("takes you to that domain, and hides nothing", async ({ configure }) => {
    await configure.domainTab(api).click()

    await expect(configure.activeDomainTab).toContainText(api)
    await expect(configure.domain(api)).toBeVisible()
    await expect(configure.domain(web)).toBeVisible()
  })

  // Also what holds `resetScroll: false`: a router reset after the jump
  // would leave this gap the height of everything above the first domain.
  test("lands the section under the bar rather than beneath it", async ({
    configure,
  }) => {
    await configure.domainTab(api).click()

    await expect.poll(() => configure.isBarStuck()).toBe(true)
    await expectLanded(configure, "api")
  })

  test("clicking the same tab again takes you there again", async ({
    configure,
  }) => {
    await configure.domainTab(api).click()
    await configure.scrollTo(0)
    await expect(configure.activeDomainTab).toContainText(web)

    await configure.domainTab(api).click()

    await expect(configure.activeDomainTab).toContainText(api)
    await expectLanded(configure, "api")
  })

  test("hands the strip back to the page the moment you scroll off", async ({
    configure,
  }) => {
    await configure.domainTab(api).click()
    await expect(configure.activeDomainTab).toContainText(api)

    await configure.scrollTo(0)

    await expect(configure.activeDomainTab).toContainText(web)
  })

  test("makes the last domain current, though its section is short", async ({
    configure,
  }) => {
    await configure.domainTab(SHARED).click()

    await expect(configure.activeDomainTab).toContainText(SHARED)
    await expectIndicatorUnder(configure, SHARED)
  })
})

// `domain` is an anchor written on a pick, never on a scroll.
test.describe("the domain in the address", () => {
  test("a pick records itself there", async ({ configure }) => {
    await configure.domainTab(api).click()

    await expect(configure.page).toHaveURL(/[?&]domain=api\b/)
  })

  test("scrolling past a domain does not write it there", async ({
    configure,
  }) => {
    await configure.domainTab(api).click()
    await expect(configure.page).toHaveURL(/[?&]domain=api\b/)

    await configure.scrollToDomain("ai")
    await expect(configure.activeDomainTab).toContainText(ai)

    await expect(configure.page).toHaveURL(/[?&]domain=api\b/)
  })

  test("an address naming a domain opens at its section", async ({
    configure,
  }) => {
    await configure.gotoDomain("api")

    await expect(configure.activeDomainTab).toContainText(api)
    await expectLanded(configure, "api")
    await expect(configure.domain(web)).toBeVisible()
  })

  test("is absent until something is picked", async ({ configure }) => {
    await expect(configure.page).not.toHaveURL(/domain=/)
  })
})

test.describe("the strip as a scroll indicator", () => {
  test("follows the page down without filtering anything", async ({
    configure,
  }) => {
    await configure.scrollToDomain("api")

    await expect(configure.activeDomainTab).toContainText(api)
    await expect(configure.domain(web)).toBeVisible()
  })

  test("follows the page back up again", async ({ configure }) => {
    await configure.scrollToDomain("api")
    await expect(configure.activeDomainTab).toContainText(api)

    await configure.scrollTo(0)

    await expect(configure.activeDomainTab).toContainText(web)
  })

  test("keeps exactly one tab current while the page moves", async ({
    configure,
  }) => {
    await configure.scrollToDomain("ai")

    await expect(configure.activeDomainTab).toHaveCount(1)
  })

  test("holds the current domain until halfway to the next", async ({
    configure,
  }) => {
    await scrollBetween(configure, "web", "api", 0.4)

    await expect(configure.activeDomainTab).toContainText(web)
  })

  test("hands it on past halfway", async ({ configure }) => {
    await scrollBetween(configure, "web", "api", 0.6)

    await expect(configure.activeDomainTab).toContainText(api)
  })

  test("makes the last domain current at the foot of the page", async ({
    configure,
  }) => {
    await configure.scrollToBottom()

    await expect(configure.activeDomainTab).toContainText(SHARED)
    await expectIndicatorUnder(configure, SHARED)
  })
})
