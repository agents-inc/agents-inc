import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"
import { STACKS } from "../support/catalog"

const PROVIDER = "choose your provider"
const STACK = "then your stack"
const AGENTS = "then your sub-agents"
const SKILLS = "then pick your skills"
const TITLE_GLYPH_DESIGN_PX = 10

// Read live, so a failure prints the measured gap.
const gapBetween = async (
  configure: ConfigurePage,
  above: string,
  below: string
) => {
  const first = await configure.stepHinge(above).boundingBox()
  const second = await configure.stepHinge(below).boundingBox()
  if (!first || !second) throw new Error("both titles must be drawn")

  return second.y - (first.y + first.height)
}

const marginTopOf = (configure: ConfigurePage, words: string) =>
  configure
    .stepHinge(words)
    .evaluate((node) => parseFloat(getComputedStyle(node).marginTop))

test.describe("folding a step", () => {
  // Both directions, so the absence is shown against a presence.
  test("the stack title folds the grid away and brings it back", async ({
    configure,
  }) => {
    const title = configure.stepTitle(STACK)
    await expect(configure.stacks).toBeVisible()

    await title.click()
    await expect(title).toHaveAttribute("aria-expanded", "false")
    await expect(configure.stacks).toHaveCount(0)

    await title.click()
    await expect(title).toHaveAttribute("aria-expanded", "true")
    await expect(configure.stacks).toBeVisible()
  })

  test("the skills title folds the bar and the grid away", async ({
    configure,
  }) => {
    const title = configure.stepTitle(SKILLS)
    await expect(configure.filterBar).toBeVisible()

    await title.click()
    await expect(title).toHaveAttribute("aria-expanded", "false")
    await expect(configure.filterBar).toHaveCount(0)
    await expect(configure.skillCells).toHaveCount(0)
    await expect(configure.emptyState).toHaveCount(0)

    await title.click()
    await expect(title).toHaveAttribute("aria-expanded", "true")
    await expect(configure.filterBar).toBeVisible()
    await expect(configure.skillCells.first()).toBeVisible()
  })

  // What these steps hold is other specs' to assert.
  for (const words of [PROVIDER, AGENTS]) {
    test(`"${words}" states its fold`, async ({ configure }) => {
      const title = configure.stepTitle(words)

      await title.click()
      await expect(title).toHaveAttribute("aria-expanded", "false")

      await title.click()
      await expect(title).toHaveAttribute("aria-expanded", "true")
    })
  }

  test("the old stack square is gone", async ({ configure }) => {
    await expect(
      configure.page.getByRole("button", { name: /^(Show|Hide) stacks$/ })
    ).toHaveCount(0)
  })

  test("a fold changes nothing that was chosen", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)
    const chosen = await configure.storedConfig()
    const installLabel = await configure.roster.installButton.textContent()
    if (installLabel === null) {
      throw new Error("the install button must carry its counts")
    }

    await configure.stepTitle(STACK).click()
    await expect(configure.stacks).toHaveCount(0)

    await expect(configure.hinge(STACKS.nextjs)).toBeVisible()
    await expect(configure.roster.installButton).toHaveText(installLabel)
    expect(await configure.storedConfig()).toBe(chosen)
  })

  // Title clearances are margins, so two folded titles' margins collapse to the
  // larger one; a new formatting context around a title would stop that.
  test("two adjacent folded titles sit one title margin apart", async ({
    configure,
  }) => {
    const clearance = await marginTopOf(configure, AGENTS)
    // The control: with the grid in place the gap is far larger.
    expect(await gapBetween(configure, STACK, AGENTS)).toBeGreaterThan(
      clearance * 2
    )

    await configure.stepTitle(STACK).click()
    await expect(configure.stacks).toHaveCount(0)

    expect(await gapBetween(configure, STACK, AGENTS)).toBeCloseTo(clearance, 0)
  })
})

test.describe("a step title's glyph", () => {
  test("is hidden at rest", async ({ configure }) => {
    await configure.page.mouse.move(0, 0)

    await expect(
      configure.stepTitle(STACK).locator('[data-slot="glyph"]')
    ).toBeHidden()
  })

  test("shows on hover, and the words do not move", async ({ configure }) => {
    const title = configure.stepTitle(STACK)
    const words = title.locator('[data-slot="hinge-words"]')
    await configure.page.mouse.move(0, 0)
    const atRest = await words.boundingBox()

    await title.hover()

    await expect(title.locator('[data-slot="glyph"]')).toBeVisible()
    expect((await words.boundingBox())?.x).toBe(atRest?.x)
  })

  // v6 `GLYPH.plus(10)`, scaled by the root like every other length.
  test("draws at 10 design px", async ({ configure }) => {
    const title = configure.stepTitle(STACK)
    await title.hover()

    const { width, root } = await title
      .locator('[data-slot="glyph"]')
      .evaluate((node) => ({
        width: node.getBoundingClientRect().width,
        root: parseFloat(getComputedStyle(document.documentElement).fontSize),
      }))

    expect(width / (root / 16)).toBeCloseTo(TITLE_GLYPH_DESIGN_PX, 1)
  })

  // Reached by Shift+Tab and Tab rather than by `focus()`: Chromium matches
  // `:focus-visible` on a programmatic move only when the element it left
  // matched too.
  test("shows under the keyboard", async ({ configure }) => {
    const title = configure.stepTitle(STACK)
    await configure.page.mouse.move(0, 0)
    await title.focus()
    await configure.page.keyboard.press("Shift+Tab")
    await configure.page.keyboard.press("Tab")

    expect(await title.evaluate((node) => node.matches(":focus-visible"))).toBe(
      true
    )
    await expect(title.locator('[data-slot="glyph"]')).toBeVisible()
  })
})

// The skills fold does not persist, so a reload or a `?domain=` link always
// lands on the grid.
test.describe("folds across a reload", () => {
  test("the first three folds persist", async ({ configure, page }) => {
    for (const words of [PROVIDER, STACK, AGENTS]) {
      await configure.stepTitle(words).click()
    }
    expect(await configure.storedUi()).toMatchObject({
      providerCollapsed: true,
      stackCollapsed: true,
      agentsCollapsed: true,
    })

    await page.reload()
    await configure.stepTitle(STACK).waitFor()

    for (const words of [PROVIDER, STACK, AGENTS]) {
      await expect(configure.stepTitle(words)).toHaveAttribute(
        "aria-expanded",
        "false"
      )
    }
    await expect(configure.stacks).toHaveCount(0)
  })

  test("the skills fold does not", async ({ configure, page }) => {
    await configure.stepTitle(SKILLS).click()
    await expect(configure.filterBar).toHaveCount(0)

    await page.reload()
    await configure.stepTitle(SKILLS).waitFor()

    await expect(configure.stepTitle(SKILLS)).toHaveAttribute(
      "aria-expanded",
      "true"
    )
    await expect(configure.filterBar).toBeVisible()
  })
})
