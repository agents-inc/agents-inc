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

  // Reaching the top is the moment searching becomes the obvious thing to do,
  // so the caret is already there rather than one click away.
  test("hands focus to the search input as it sticks", async ({
    configure,
  }) => {
    await expect(configure.searchInput).not.toBeFocused()

    await configure.scrollTo(PAST_THE_BAR)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    await expect(configure.searchInput).toBeFocused()
  })

  // …and gives it back: the focus grab happens once per stick, not on every
  // scroll event, or typing elsewhere would be impossible while pinned.
  test("does not steal focus back after the user moves on", async ({
    configure,
  }) => {
    await configure.scrollTo(PAST_THE_BAR)
    await expect(configure.searchInput).toBeFocused()

    await configure.addSkillButton.focus()
    await configure.scrollTo(PAST_THE_BAR + 200)

    await expect(configure.addSkillButton).toBeFocused()
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
