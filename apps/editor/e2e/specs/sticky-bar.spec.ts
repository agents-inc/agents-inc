import { expect, test } from "../fixtures"
import { DOMAINS } from "../support/catalog"

const BELOW_THE_BAR = 200
const PAST_THE_BAR = 1500

// `#242320` — the page's one dark surface, shared with the add-skill block.
const DARK_BAND = "rgb(36, 35, 32)"

// The bar changes shape at the moment CSS pins it, and the domain headers
// follow. Both states are published as attributes rather than React state, so
// these read the attributes — which is also what the styling reads.
test.describe("sticky filter bar", () => {
  test("is not stuck at rest", async ({ configure }) => {
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("is not stuck while it is still mid-column", async ({ configure }) => {
    await configure.scrollTo(BELOW_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("sticks once it reaches the top", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)
  })

  test("releases on the way back up", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await configure.scrollTo(0)
    await expect.poll(() => configure.isBarStuck()).toBe(false)
  })

  test("stays usable while stuck", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.searchInput).toBeVisible()
    await expect(configure.addSkillButton).toBeVisible()
  })

  // Only the colour bleeds: the bar becomes a full-bleed dark band while the
  // container keeps its gutters, so the dark/white edge is what separates the
  // bar from the domain header pinning beneath it.
  test("becomes a dark band once stuck", async ({ configure }) => {
    await expect(configure.filterBar).not.toHaveCSS(
      "background-color",
      DARK_BAND
    )

    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.filterBar).toHaveCSS("background-color", DARK_BAND)
  })

  // Sticking is a scroll position, not an instruction. The bar used to put the
  // caret in its own search field the moment it pinned — on the theory that
  // reaching the top is the moment searching becomes obvious — and that grab
  // is gone (owner ruling 2026-08-09). It moves focus never.
  test("takes no focus as it sticks", async ({ configure }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.searchInput).not.toBeFocused()
  })

  // …and not on the way past either: scrolling on while pinned leaves the
  // caret wherever the user put it.
  test("leaves the caret alone while the page scrolls on", async ({
    configure,
  }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await configure.addSkillButton.focus()
    await configure.scrollTo(PAST_THE_BAR + 200)

    await expect(configure.addSkillButton).toBeFocused()
  })

  // The reverse direction, and the one the grab was never designed for: focus
  // can cause the scroll. Tabbing to a control the viewport is not showing
  // scrolls it into view, and that scroll can cross the pin — so a bar that
  // stuck is a keyboard user on their way *down* the page, not somebody
  // arriving at the top. Taking the caret here threw them back to it, and it
  // happened on the Tab that revealed anything below the fold.
  test("a Tab that sticks the bar keeps its focus", async ({ configure }) => {
    await configure.addSkillButton.focus()

    await configure.tabUntilBarSticks()

    await expect.poll(() => configure.isBarStuck()).toBe(true)
    await expect(configure.focusedSkillCell).toHaveCount(1)
  })
})

test.describe("sticky domain header", () => {
  test("takes an edge only while it holds the top of the column", async ({
    configure,
  }) => {
    const header = configure.domainHeader(DOMAINS.web)

    await expect(header).not.toHaveAttribute("data-pinned", "")

    await configure.scrollTo(PAST_THE_BAR)
    await expect(header).toHaveAttribute("data-pinned", "")
  })
})
