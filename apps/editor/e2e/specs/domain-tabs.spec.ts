import { expect, test } from "../fixtures"
import { DOMAINS } from "../support/catalog"

const { web, api, ai } = DOMAINS

// THE STRIP IS A SCROLL INDICATOR FIRST AND A CONTROL SECOND, and that is the
// distinction every test here turns on. A tab is `aria-pressed` only while the
// column is FILTERED to its domain; it is `data-active` whenever it is the
// domain you are looking at, filtered or not. A design that collapsed the two
// would make the strip announce a filter nobody applied on every scroll.
//
// Reached through the group rather than the page, because the same row carries
// the selection filters at its far end — a locator that could match either is
// a locator that cannot say which one it found.
test.describe("the domain strip", () => {
  test("renders one tab per domain, all of them at once", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).toBeVisible()
    await expect(configure.domainTab(api)).toBeVisible()
    await expect(configure.domainTab(ai)).toBeVisible()
  })

  // The `01/02/03` index and the per-domain count ride on the tab but are not
  // part of its name: nine repetitions of a two-digit number in front of nine
  // domains is what happens otherwise.
  test("carries an index and a count that stay out of the tab's name", async ({
    configure,
  }) => {
    await expect(configure.domainTab(web)).toHaveAccessibleName(web)
    await expect(configure.domainTab(web)).toContainText("01")
  })

  test("opens on the first domain, with nothing filtered", async ({
    configure,
  }) => {
    await expect(configure.activeDomainTab).toHaveCount(1)
    await expect(configure.activeDomainTab).toContainText(web)
    await expect(configure.domainTab(web)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    // Every domain is still on the page — the strip said which one you are at,
    // not which one you are limited to.
    await expect(configure.domain(api)).toBeVisible()
  })
})

test.describe("picking a domain from the strip", () => {
  test("narrows the column to that domain", async ({ configure }) => {
    await configure.domainTab(api).click()

    await expect(configure.domain(api)).toBeVisible()
    await expect(configure.domain(web)).toBeHidden()
    await expect(configure.domainTab(api)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.activeDomainTab).toContainText(api)
  })

  test("clicking the picked tab again brings every domain back", async ({
    configure,
  }) => {
    await configure.domainTab(api).click()
    await expect(configure.domain(web)).toBeHidden()

    await configure.domainTab(api).click()

    await expect(configure.domain(web)).toBeVisible()
    await expect(configure.domainTab(api)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  // Clearing hands the strip back to the scroll position, and it has to happen
  // NOW rather than on the next scroll event — a strip that goes on naming the
  // domain you just released is pointing at a filter that is gone. The page is
  // still at the top, so the answer is the first domain.
  test("hands the strip back to the page the moment the filter is released", async ({
    configure,
  }) => {
    await configure.domainTab(api).click()
    await expect(configure.activeDomainTab).toContainText(api)

    await configure.domainTab(api).click()

    await expect(configure.activeDomainTab).toContainText(web)
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
    await expect(configure.domainTab(api)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
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
