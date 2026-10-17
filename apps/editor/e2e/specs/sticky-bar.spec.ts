import type { Locator } from "@playwright/test"
import type { ConfigurePage } from "../pages/configure-page"

import { expect, test } from "../fixtures"
import { DOMAINS } from "../support/catalog"

// Either side of the bar's document offset: the transition is what is under
// test, so the two positions straddle it.
const PIN_STEP = 4

const BELOW_THE_BAR = 200
// Measured from the bar rather than fixed: the steps above it grow.
const PAST_THE_PIN = 400

// The walk starts at the foot of the catalogue and has to climb past its first
// screen of stops before anything scrolls in from above.
const BACKWARD_STOPS = 150

const FRAMES_PAST_THE_PIN = 30

// `#242320` — the page's one dark surface, shared with the add-skill block.
const DARK_BAND = "rgb(36, 35, 32)"

// `#55524a`, as a member of the computed list: the focus-ring plumbing adds
// empty shadows ahead of it.
const BAND_EDGE_INSET = /rgb\(85, 82, 74\) 0px 0px 0px 1px inset/

const NO_FILL = "rgba(0, 0, 0, 0)"

// `#242320` and `#6a675c`: a typed query must not read as its own placeholder.
const TYPED_TEXT = "rgb(36, 35, 32)"
const PLACEHOLDER_TEXT = "rgb(106, 103, 92)"

// Over v6's 26px.
const STUCK_TAB_REM = 3
// v6 `.barwrap.stuck .barband`: 18px above and below a 34px row.
const STUCK_BAND_DESIGN_PX = 70
// `.barwrap.stuck .bigadd{padding:8px 15px}` against the resting `0 18px`.
// Against the label's line rather than a total: `line-height: normal` rounds
// per font size, so the design's own 34 is a platform's figure.
const STUCK_BLOCK_PADDING_DESIGN_PX = 16
const STUCK_BLOCK_NARROWING = 6

// Any shadow drawn in an opaque colour; the ring plumbing's empty shadows are
// `rgba(0, 0, 0, 0)`.
const OPAQUE_COLOUR = /rgb\(/

const shadowOf = (locator: Locator) =>
  locator.evaluate((node) => getComputedStyle(node).boxShadow)

const placeholderColorOf = (locator: Locator) =>
  locator.evaluate((node) => getComputedStyle(node, "::placeholder").color)

const boxOf = async (locator: Locator, what: string) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${what} must be drawn`)
  return box
}

// Whole pixels: the window scrolls in them, so a fractional target lands up to
// half a pixel off the scroll requested.
const barDocumentTop = (configure: ConfigurePage) =>
  configure.page.evaluate(() => {
    const bar = document.querySelector('[data-slot="filter-bar"]')
    if (!bar) throw new Error("the bar must be drawn")
    return Math.round(window.scrollY + bar.getBoundingClientRect().top)
  })

const stick = async (configure: ConfigurePage) => {
  await configure.scrollTo((await barDocumentTop(configure)) + PAST_THE_PIN)
  await expect.poll(() => configure.isBarStuck()).toBe(true)
}

// The add-skill block's width, and how much band runs on past its right edge.
const blockGeometry = async (configure: ConfigurePage) => {
  const block = await boxOf(configure.addSkillButton, "the block")
  const band = await boxOf(configure.filterBand, "the band")

  return {
    width: block.width,
    clearance: band.x + band.width - (block.x + block.width),
  }
}

// How much taller the block is than its label's line.
const blockPastItsLine = (configure: ConfigurePage) =>
  configure.addSkillButton.evaluate((node) => {
    const label = [...node.childNodes].find(
      (child) => child.nodeType === Node.TEXT_NODE
    )
    if (!label) throw new Error("the block must carry its label as text")
    const range = document.createRange()
    range.selectNodeContents(label)
    return (
      node.getBoundingClientRect().height - range.getBoundingClientRect().height
    )
  })

// Read in a separate round trip from the scroll: pinning is raised from a
// scroll listener, so a rect read in the same `evaluate` that scrolled is the
// layout before the bar changed height.
const columnAndScroll = (configure: ConfigurePage) =>
  configure.page.evaluate(() => {
    const anchor = document.querySelector("[data-domain-anchor]")
    if (!anchor) throw new Error("the column must carry a domain anchor")
    return { top: anchor.getBoundingClientRect().top, scrollY: window.scrollY }
  })

// The column must move by exactly the scroll REQUESTED. Holding it still while
// the bar changes height means moving the scroll by that change, so the scroll
// it ended at is not the figure to compare against.
const scrollAcrossThePin = async (
  configure: ConfigurePage,
  target: number,
  stuck: boolean
) => {
  const before = await columnAndScroll(configure)
  const asked = target - before.scrollY

  await configure.scrollTo(target)
  await expect.poll(() => configure.isBarStuck()).toBe(stuck)
  const after = await columnAndScroll(configure)

  expect(before.top - after.top).toBeCloseTo(asked, 0)
}

const stuckInEachFrame = (configure: ConfigurePage, frames: number) =>
  configure.page.evaluate(async (count) => {
    const samples: boolean[] = []
    for (let frame = 0; frame < count; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      samples.push(document.documentElement.hasAttribute("data-bar-stuck"))
    }
    return samples
  }, frames)

const rootFontSize = (configure: ConfigurePage) =>
  configure.page.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  )

const designPx = async (configure: ConfigurePage, px: number) =>
  px / ((await rootFontSize(configure)) / 16)

const gutterWidth = (configure: ConfigurePage) =>
  configure.page.evaluate(() => {
    const probe = document.createElement("div")
    probe.style.width = "var(--spacing-gutter)"
    document.body.append(probe)
    const width = probe.getBoundingClientRect().width
    probe.remove()
    return width
  })

const tabHeights = (configure: ConfigurePage) =>
  configure.domainTabs
    .getByRole("button")
    .evaluateAll((tabs) =>
      tabs.map((tab) => tab.getBoundingClientRect().height)
    )

const tabRun = (configure: ConfigurePage) =>
  configure.domainTabs.getByRole("button").evaluateAll((tabs) => {
    const first = tabs.at(0)
    const last = tabs.at(-1)
    if (!first || !last) throw new Error("the strip must draw its tabs")

    const textOf = (tab: Element) => {
      const range = document.createRange()
      range.selectNodeContents(tab)
      return range.getBoundingClientRect()
    }

    return {
      firstCellLeft: first.getBoundingClientRect().left,
      lastCellRight: last.getBoundingClientRect().right,
      firstTextLeft: textOf(first).left,
      lastTextRight: textOf(last).right,
    }
  })

test.describe("sticky filter bar", () => {
  test("is not stuck at rest", async ({ configure }) => {
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("is not stuck while it is still mid-column", async ({ configure }) => {
    await configure.scrollTo(BELOW_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("sticks once it reaches the top", async ({ configure }) => {
    await stick(configure)
  })

  test("releases on the way back up", async ({ configure }) => {
    await stick(configure)

    await configure.scrollTo(0)
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  // `use-pinned.ts` reads the bar's previous sibling: anything else there moves
  // the pin.
  test("pins from a zero-height sentinel right before it", async ({
    configure,
  }) => {
    const sentinel = configure.filterBar.locator(
      "xpath=preceding-sibling::*[1]"
    )

    await expect(sentinel).toHaveAttribute("data-slot", "pin-sentinel")
    expect(
      await sentinel.evaluate((node) => node.getBoundingClientRect().height)
    ).toBe(0)
  })

  // A pin decided by measuring the sticky element flipped every frame, since
  // pinning changes that element's own height.
  test("stays stuck in every frame just past the pin", async ({
    configure,
  }) => {
    const pin = await barDocumentTop(configure)
    await configure.scrollTo(pin + PIN_STEP)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    expect(
      await stuckInEachFrame(configure, FRAMES_PAST_THE_PIN)
    ).toStrictEqual(Array<boolean>(FRAMES_PAST_THE_PIN).fill(true))
  })

  // The bar changes height as it pins, and a sticky element's own growth
  // pushes everything under it by the difference.
  test("does not move the column as it sticks", async ({ configure }) => {
    const pin = await barDocumentTop(configure)

    await configure.scrollTo(pin - PIN_STEP)
    await expect.poll(() => configure.isBarStuck()).toBe(false)

    await scrollAcrossThePin(configure, pin + PIN_STEP, true)
  })

  // Not the test above run backwards: the correction has the opposite sign.
  test("does not move the column as it releases", async ({ configure }) => {
    const pin = await barDocumentTop(configure)

    await configure.scrollTo(pin + PIN_STEP)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await scrollAcrossThePin(configure, pin - PIN_STEP, false)
  })

  test("stays usable while stuck", async ({ configure }) => {
    await stick(configure)

    await expect(configure.searchInput).toBeVisible()
    await expect(configure.addSkillButton).toBeVisible()
  })

  test("pins at 70 design px tall", async ({ configure }) => {
    await stick(configure)

    await expect
      .poll(async () =>
        designPx(
          configure,
          (await boxOf(configure.filterBand, "the band")).height
        )
      )
      .toBeCloseTo(STUCK_BAND_DESIGN_PX, 0)
  })

  test("becomes a dark band once stuck", async ({ configure }) => {
    await expect(configure.filterBand).not.toHaveCSS(
      "background-color",
      DARK_BAND
    )

    await stick(configure)

    await expect(configure.filterBand).toHaveCSS("background-color", DARK_BAND)
  })

  // Sticking is a scroll position, not an instruction: the bar never takes the
  // caret.
  test("takes no focus as it sticks", async ({ configure }) => {
    await stick(configure)

    await expect(configure.searchInput).not.toBeFocused()
  })

  test("leaves the caret alone while the page scrolls on", async ({
    configure,
  }) => {
    await stick(configure)

    await configure.addSkillButton.focus()
    await configure.scrollTo((await configure.scrollY()) + 200)

    await expect(configure.addSkillButton).toBeFocused()
  })

  // Focus can cause the scroll: a Tab that reveals a control below the fold
  // crosses the pin, and the caret has to stay where the Tab put it.
  test("a Tab that sticks the bar keeps its focus", async ({ configure }) => {
    await configure.addSkillButton.focus()

    await configure.tabUntilBarSticks()

    await expect.poll(() => configure.isBarStuck()).toBe(true)
    await expect(configure.focusedSkillCell).toHaveCount(1)
  })

  // Walking back up, a control scrolled in from above stops at the window's
  // top edge, under the pinned bar. `composer.spec.ts` holds the other edge.
  test("never hides the control the keyboard is on, walking back up", async ({
    configure,
  }) => {
    await configure.composer.field.focus()

    expect(
      await configure.stopsCoveredBy(
        configure.filterBar,
        "Shift+Tab",
        BACKWARD_STOPS
      )
    ).toStrictEqual([])
    expect(await configure.isBarStuck()).toBe(true)
  })

  // The filled block becomes an outlined one on the dark band.
  test("add-skill trades its fill for a hairline once stuck", async ({
    configure,
  }) => {
    await expect(configure.addSkillButton).toHaveCSS(
      "background-color",
      DARK_BAND
    )
    await expect(configure.addSkillButton).not.toHaveCSS(
      "box-shadow",
      BAND_EDGE_INSET
    )

    await stick(configure)

    await expect(configure.addSkillButton).toHaveCSS(
      "background-color",
      NO_FILL
    )
    await expect(configure.addSkillButton).toHaveCSS(
      "box-shadow",
      BAND_EDGE_INSET
    )
  })

  test("narrows by 3 design px a side once stuck", async ({ configure }) => {
    const atRest = await blockGeometry(configure)

    await stick(configure)

    await expect
      .poll(async () =>
        designPx(
          configure,
          atRest.width - (await blockGeometry(configure)).width
        )
      )
      .toBeCloseTo(STUCK_BLOCK_NARROWING, 0)
  })

  // v6 `.barwrap.stuck .barrow{align-items:center}`: the block stops
  // stretching to the band.
  test("hugs its label by 8 design px, centred in the band, once stuck", async ({
    configure,
  }) => {
    await stick(configure)

    await expect
      .poll(async () => designPx(configure, await blockPastItsLine(configure)))
      .toBeCloseTo(STUCK_BLOCK_PADDING_DESIGN_PX, 0)

    const block = await boxOf(configure.addSkillButton, "the block")
    const band = await boxOf(configure.filterBand, "the band")
    expect(block.y - band.y).toBeCloseTo(
      band.y + band.height - (block.y + block.height),
      0
    )
  })

  // The resting clearance is the channel: a band and block sharing a right
  // edge in both states would pass a stuck-only assertion.
  test("keeps the band running on past it once stuck", async ({
    configure,
  }) => {
    const atRest = await blockGeometry(configure)
    expect(atRest.clearance).toBeGreaterThan(0)

    await stick(configure)

    await expect
      .poll(async () => (await blockGeometry(configure)).clearance)
      .toBeCloseTo(atRest.clearance, 1)
  })

  test("a typed query is set in ink, not in the placeholder's grey", async ({
    configure,
  }) => {
    expect(await placeholderColorOf(configure.searchInput)).toBe(
      PLACEHOLDER_TEXT
    )

    await configure.search("react")

    await expect(configure.searchInput).toHaveCSS("color", TYPED_TEXT)
    expect(await placeholderColorOf(configure.searchInput)).toBe(
      PLACEHOLDER_TEXT
    )
  })
})

test.describe("the domain strip once the bar is stuck", () => {
  test("fills with its own grey, not the band's dark", async ({
    configure,
  }) => {
    await stick(configure)

    await expect(configure.domainTabs).toHaveCSS(
      "background-color",
      await configure.tokenColor("--color-strip-stuck")
    )
    await expect(configure.domainTabs).not.toHaveCSS(
      "background-color",
      DARK_BAND
    )
  })

  // The fill and the hairline are the strip's own, so its box is their extent.
  test("runs its fill and hairline the bar's full width", async ({
    configure,
  }) => {
    await stick(configure)

    const bar = await boxOf(configure.filterBar, "the bar")
    const strip = await boxOf(configure.domainTabs, "the strip")

    expect(strip.x).toBeCloseTo(bar.x, 0)
    expect(strip.width).toBeCloseTo(bar.width, 0)
  })

  // Only the fill and hairline bleed.
  test("keeps its first and last tab where they rest, inside the page padding", async ({
    configure,
  }) => {
    const atRest = await tabRun(configure)

    await stick(configure)

    await expect
      .poll(() => tabRun(configure))
      .toStrictEqual({
        firstCellLeft: expect.closeTo(atRest.firstCellLeft, 0),
        lastCellRight: expect.closeTo(atRest.lastCellRight, 0),
        firstTextLeft: expect.closeTo(atRest.firstTextLeft, 0),
        lastTextRight: expect.closeTo(atRest.lastTextRight, 0),
      })

    const bar = await boxOf(configure.filterBar, "the bar")
    const gutter = await gutterWidth(configure)
    const stuck = await tabRun(configure)
    expect(stuck.firstTextLeft).toBeGreaterThan(bar.x + gutter)
    expect(stuck.lastTextRight).toBeLessThan(bar.x + bar.width - gutter)
  })

  // A resting tab is the channel: the same string is its own rule. The last
  // tab, because the current one may draw something else.
  test("draws one hairline under the strip and none under its tabs", async ({
    configure,
  }) => {
    const hairline = `${await configure.tokenColor("--color-hairline")} 0px -1px 0px 0px inset`
    const tab = configure.domainTabs.getByRole("button").last()
    await expect.poll(() => shadowOf(tab)).toContain(hairline)

    await stick(configure)

    await expect.poll(() => shadowOf(configure.domainTabs)).toContain(hairline)
    await expect.poll(() => shadowOf(tab)).not.toMatch(OPAQUE_COLOUR)
  })

  test("butts the band, with no gap between them", async ({ configure }) => {
    await stick(configure)

    const band = await boxOf(configure.filterBand, "the band")
    const strip = await boxOf(configure.domainTabs, "the strip")

    expect(strip.y).toBeCloseTo(band.y + band.height, 0)
  })

  test("draws every tab 3rem tall", async ({ configure }) => {
    const stuckTab = STUCK_TAB_REM * (await rootFontSize(configure))

    await stick(configure)

    const count = await configure.domainTabs.getByRole("button").count()
    await expect
      .poll(() => tabHeights(configure))
      .toStrictEqual(Array<unknown>(count).fill(expect.closeTo(stuckTab, 1)))
  })
})

// The strip is the domains' only title; a heading left in a section would
// repeat the name under it.
test.describe("the domain sections", () => {
  test("carry no heading of their own", async ({ configure }) => {
    await stick(configure)

    await expect(configure.domain(DOMAINS.web)).toBeVisible()
    await expect(
      configure.domain(DOMAINS.web).getByRole("heading", { name: DOMAINS.web })
    ).toHaveCount(0)
  })
})
