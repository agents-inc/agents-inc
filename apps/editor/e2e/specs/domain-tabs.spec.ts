import { expect, test } from "../fixtures"
import { DOMAINS } from "../support/catalog"

const { web, api, ai } = DOMAINS

// How far below the bar's underside a jumped-to section may land. The scroll
// spy's own clearance is 20px — a section owns the strip once its top edge is
// that far past the bar — so a landing inside this window is one the strip
// agrees with, and anything looser would pass on a jump that overshot into the
// section below or undershot into the one above.
const LANDING_WINDOW = 20

// THE STRIP IS A SCROLL INDICATOR FIRST AND A CONTROL SECOND, and since
// EDITOR-79 the control is a way of MOVING the page rather than of narrowing
// it: clicking `API` takes you to the API section and leaves `Web` exactly
// where it was. So there is one claim to test rather than two — a tab is
// `aria-current` whenever it is the domain you are looking at, and nothing on
// the strip reports a filter, because there is no longer a filter to report.
//
// Reached through the group rather than the page, because the add-skill block a
// row above is a button too — a locator that could match either is a locator
// that cannot say which one it found. Nothing shares the strip's own row now:
// `selected` moved to the skills hinge and clearing to the first stack cell,
// which is what lets the strip be equal cells spanning the whole column.
test.describe("the domain strip", () => {
  test("renders one tab per domain, all of them at once", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).toBeVisible()
    await expect(configure.domainTab(api)).toBeVisible()
    await expect(configure.domainTab(ai)).toBeVisible()
  })

  // CELLS SIZED TO THEIR OWN LABEL, on a strip that still cannot overflow at
  // any width. `flex: 1 1 0` was the drawing before this one: equal cells could
  // not overflow either, but they spent the same track on `AI` as on `Desktop`
  // and pushed the long names through their own ellipsis. `flex: 1 1 auto`
  // starts each cell at its content and shares the slack out equally, so the
  // difference between two cells is exactly the difference between two labels.
  //
  // Two claims in one test because either alone passes on a broken strip:
  // content-sized cells hold on a strip that has scrolled its last tab out of
  // sight, and a strip that fits holds with every cell the same width.
  test("sizes each domain to its own label and never overflows", async ({
    configure,
  }) => {
    const widthOf = (label: string) =>
      configure
        .domainTab(label)
        .evaluate((tab) => tab.getBoundingClientRect().width)

    expect(await widthOf(api)).toBeGreaterThan(await widthOf(ai))

    const strip = configure.domainTabs
    expect(await strip.evaluate((node) => node.scrollWidth)).toBe(
      await strip.evaluate((node) => node.clientWidth)
    )
  })

  // THE LABEL HOLDS ONE SIZE. The active one used to jump to 25px Inter, which
  // grew the strip, moved every section under it, and so changed which domain
  // the scroll spy called current — a selection that rewrote its own input.
  test("draws the active label at the same size as the others", async ({
    configure,
  }) => {
    const sizeOf = (label: string) =>
      configure
        .domainTab(label)
        .evaluate(
          (tab) =>
            getComputedStyle(tab.querySelector("span:nth-child(2)")!).fontSize
        )

    await expect(configure.activeDomainTab).toContainText(web)

    expect(await sizeOf(web)).toBe(await sizeOf(api))
  })

  // The `01/02/03` index and the per-domain count ride on the tab but are not
  // part of its name: nine repetitions of a two-digit number in front of nine
  // domains is what happens otherwise.
  //
  // This viewport is the wide one — 1600px, past the threshold in
  // `src/lib/viewport.ts` — which is where the two are drawn at all. The narrow
  // strip is the describe at the foot of this file.
  test("carries an index and a count that stay out of the tab's name", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).toHaveAccessibleName(web)
    await expect(configure.domainTab(web)).toContainText("01")
  })

  test("opens on the first domain, with the whole catalogue under it", async ({
    configure,
  }) => {
    await expect(configure.activeDomainTab).toHaveCount(1)
    await expect(configure.activeDomainTab).toContainText(web)
    // Every domain is on the page — the strip says which one you are at, never
    // which one you are limited to.
    await expect(configure.domain(api)).toBeVisible()
  })

  // A tab NAVIGATES, so it has no state to be in and reports none. It used to
  // publish `aria-pressed` for the domain the column was filtered to; a pressed
  // state on a control that only ever moves the page is a toggle a reader
  // cannot turn off, and there is nothing left for it to be true of.
  //
  // THE CHANNEL THIS NEGATIVE RIDES ON is proven by the test immediately below,
  // which reads an attribute off the same locators with the same matcher and
  // gets a value — so "no `aria-pressed`" is a claim about the tab rather than
  // about a locator that matches nothing.
  test("claims no pressed state, current or otherwise", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).not.toHaveAttribute("aria-pressed")

    await configure.domainTab(api).click()

    await expect(configure.domainTab(api)).not.toHaveAttribute("aria-pressed")
  })

  // What replaces it, so the strip still tells a reader who cannot see the
  // 25px type which domain they are in.
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

test.describe("picking a domain from the strip", () => {
  test("takes you to that domain, and hides nothing", async ({ configure }) => {
    await configure.domainTab(api).click()

    await expect(configure.activeDomainTab).toContainText(api)
    await expect(configure.domain(api)).toBeVisible()
    await expect(configure.domain(web)).toBeVisible()
  })

  // THE BAR PINS OVER THE COLUMN, so a jump that ignored it would put the
  // section's first row underneath the thing that jumped to it. Measured
  // against the bar's own box rather than a figure written here: the height is
  // the design's, in rem against a root set to 110%.
  //
  // This is also what holds `resetScroll: false` on the pick's navigation. A
  // pick that scrolled and was then slammed back to the top by the router would
  // leave this gap the height of everything above the first domain.
  test("lands the section under the bar rather than beneath it", async ({
    configure,
  }) => {
    await configure.domainTab(api).click()

    const gap = await configure.domainGapUnderBar("api")
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThan(LANDING_WINDOW)
  })

  // There is nothing to release when a pick hides nothing, so the second click
  // is not a toggle — it is a reader asking to be taken back to the top of the
  // section they are reading.
  test("clicking the same tab again takes you there again", async ({
    configure,
  }) => {
    await configure.domainTab(api).click()
    await configure.scrollTo(0)
    await expect(configure.activeDomainTab).toContainText(web)

    await configure.domainTab(api).click()

    await expect(configure.activeDomainTab).toContainText(api)
    expect(await configure.domainGapUnderBar("api")).toBeLessThan(
      LANDING_WINDOW
    )
  })

  // The pick does not pin the strip: the page owns the current tab at every
  // position, and scrolling out of the section you jumped to is a scroll like
  // any other.
  test("hands the strip back to the page the moment you scroll off", async ({
    configure,
  }) => {
    await configure.domainTab(api).click()
    await expect(configure.activeDomainTab).toContainText(api)

    await configure.scrollTo(0)

    await expect(configure.activeDomainTab).toContainText(web)
  })
})

// `domain` stays a validated search param, and a pick still writes it — what
// changed is what the value MEANS on the way back in. It is an ANCHOR rather
// than a filter: the link says "take me to API", and opening it lands you there
// with the whole catalogue still under you.
//
// It is written on a PICK and never on a SCROLL. A param rewritten as the
// reader moved would be a router navigation per section crossed, re-deriving
// the whole grid mid-scroll; the cost of not doing it is that the address can
// name a domain the reader has since scrolled away from, which nothing on
// screen contradicts because nothing on screen is bound to the param.
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
    expect(await configure.domainGapUnderBar("api")).toBeLessThan(
      LANDING_WINDOW
    )
    await expect(configure.domain(web)).toBeVisible()
  })

  // A pristine address stays clean — `stripSearchParams` drops every field
  // sitting at its default, and `domain` defaults to null.
  test("is absent until something is picked", async ({ configure }) => {
    await expect(configure.page).not.toHaveURL(/domain=/)
  })
})

test.describe("the strip as a scroll indicator", () => {
  // The whole of the second half of the design: scrolling makes a tab current
  // without pressing it, and the column keeps every domain.
  test("follows the page down without filtering anything", async ({
    configure,
  }) => {
    await configure.scrollToDomain("api")

    await expect(configure.activeDomainTab).toContainText(api)
    await expect(configure.domain(web)).toBeVisible()
  })

  // And back up, which is the direction a one-way `IntersectionObserver`
  // written the obvious way gets wrong.
  test("follows the page back up again", async ({ configure }) => {
    await configure.scrollToDomain("api")
    await expect(configure.activeDomainTab).toContainText(api)

    await configure.scrollTo(0)

    await expect(configure.activeDomainTab).toContainText(web)
  })

  // One tab is current at every scroll position — never two, and never none.
  test("keeps exactly one tab current while the page moves", async ({
    configure,
  }) => {
    await configure.scrollToDomain("ai")

    await expect(configure.activeDomainTab).toHaveCount(1)
  })
})
