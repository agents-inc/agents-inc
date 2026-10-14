import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY, MULTI_CATEGORY } from "../support/catalog"

const ANY_TAG = /^(one of|multi)$/i

// v6 `.skl{font:600 9px 'IBM Plex Mono'}`.
const LABEL_DESIGN_PX = 9

test.describe("a skill category's header", () => {
  test("carries no tag when several may be held", async ({ configure }) => {
    const category = configure.category(DOMAINS.web, MULTI_CATEGORY.name)
    await expect(category).toBeVisible()

    await expect(category.getByText(ANY_TAG)).toHaveCount(0)
  })

  test("says one of when picking one deselects the rest", async ({
    configure,
  }) => {
    const category = configure.category(DOMAINS.web, EXCLUSIVE_CATEGORY.name)

    await expect(
      category.getByText(EXCLUSIVE_CATEGORY.tag, { exact: true })
    ).toBeVisible()
  })

  test("sets its label at 9 design px", async ({ configure }) => {
    const label = configure
      .category(DOMAINS.web, EXCLUSIVE_CATEGORY.name)
      .getByText(EXCLUSIVE_CATEGORY.name, { exact: true })

    const { size, root } = await label.evaluate((node) => ({
      size: parseFloat(getComputedStyle(node).fontSize),
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
    }))

    expect(size / (root / 16)).toBeCloseTo(LABEL_DESIGN_PX, 1)
  })
})
