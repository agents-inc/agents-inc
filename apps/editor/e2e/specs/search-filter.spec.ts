import type { Locator } from "@playwright/test"

import { expect, test } from "../fixtures"
import { STACKS } from "../support/catalog"

// Measured from the bar rather than fixed: the steps above it grow.
const PAST_THE_PIN = 400
const FLOOR = { width: 1200, height: 1000 }
const LEFT_OF_THE_PAIR = 4
// v6 `.bar`: 13.5px type, 11px 13px of padding, a 1px border.
const FIELD_DESIGN_PX = 42
const QUERY_DESIGN_PX = 13.5
const FIELD_INSET_DESIGN_PX = 13

const boxOf = async (locator: Locator, what: string) => {
  await expect(locator, `${what} must be drawn`).toBeVisible()
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${what} must be drawn`)
  return box
}

const centreY = (box: { y: number; height: number }) => box.y + box.height / 2

const designPxOf = async (locator: Locator, px: number) =>
  px /
  ((await locator.evaluate(() =>
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  )) /
    16)

const computedPx = (locator: Locator, property: "fontSize" | "paddingLeft") =>
  locator.evaluate(
    (node, key) => Number.parseFloat(getComputedStyle(node)[key]),
    property
  )

test.beforeEach(async ({ configure }) => {
  await configure.chooseStack(STACKS.nextjs)
})

test.describe("the all | selected pair", () => {
  test("sits inside the search field", async ({ configure }) => {
    await expect(
      configure.searchField.locator(configure.selectedFilter)
    ).toBeVisible()
  })

  test("rests on the plain arm", async ({ configure }) => {
    await expect(configure.selectedFilterCell("selected")).toHaveCSS(
      "color",
      await configure.tokenColor("--color-field-faint")
    )
    await expect(configure.selectedFilterCell("all")).toHaveCSS(
      "color",
      await configure.tokenColor("--color-brand-ink")
    )
  })

  // The pair is an island in the field: the run left of it is still the
  // input's, and the pair takes its own press.
  test("a press left of it reaches the input, and a press on it switches", async ({
    configure,
    page,
  }) => {
    await configure.searchField.scrollIntoViewIfNeeded()
    const pair = await boxOf(configure.selectedFilter, "the pair")

    await page.mouse.click(pair.x - LEFT_OF_THE_PAIR, centreY(pair))
    await expect(configure.searchInput).toBeFocused()

    await configure.selectedFilterCell("selected").click()
    await expect(configure.selectedFilterOn).toHaveText(/^selected \d+$/)
    await expect(configure.searchInput).not.toBeFocused()
  })
})

test.describe("the search field at rest", () => {
  test("is 42 design px tall", async ({ configure }) => {
    const field = await boxOf(configure.searchField, "the field")

    expect(await designPxOf(configure.searchField, field.height)).toBeCloseTo(
      FIELD_DESIGN_PX,
      0
    )
  })

  test("sets the query in 13.5 design px type, 13 design px in", async ({
    configure,
  }) => {
    const input = configure.searchInput

    expect(
      await designPxOf(input, await computedPx(input, "fontSize"))
    ).toBeCloseTo(QUERY_DESIGN_PX, 1)
    expect(
      await designPxOf(input, await computedPx(input, "paddingLeft"))
    ).toBeCloseTo(FIELD_INSET_DESIGN_PX, 1)
  })
})

test.describe("at the floor width", () => {
  test.use({ viewport: FLOOR })

  test("stays on the search line, right of the input", async ({
    configure,
  }) => {
    const pair = await boxOf(configure.selectedFilter, "the pair")
    const input = await boxOf(configure.searchInput, "the input")
    const field = await boxOf(configure.searchField, "the field")

    expect(centreY(pair)).toBeGreaterThan(input.y)
    expect(centreY(pair)).toBeLessThan(input.y + input.height)
    expect(pair.x).toBeGreaterThanOrEqual(input.x + input.width - 0.5)
    expect(pair.x + pair.width).toBeLessThanOrEqual(field.x + field.width)
  })
})

test.describe("once the bar is stuck", () => {
  test.beforeEach(async ({ configure }) => {
    const pin = await configure.filterBar.evaluate(
      (bar) => window.scrollY + bar.getBoundingClientRect().top
    )
    await configure.scrollTo(pin + PAST_THE_PIN)
    await expect.poll(() => configure.isBarStuck()).toBe(true)
  })

  // The field is the whole band once stuck, so it runs under the add block;
  // the pair has to end before the block does.
  test("ends before the add block, level with it", async ({ configure }) => {
    const pair = await boxOf(configure.selectedFilter, "the pair")
    const block = await boxOf(configure.addSkillButton, "the add block")

    expect(pair.x + pair.width).toBeLessThanOrEqual(block.x + 0.5)
    expect(centreY(pair)).toBeGreaterThan(block.y)
    expect(centreY(pair)).toBeLessThan(block.y + block.height)
  })

  test("draws on the band's dark arm", async ({ configure }) => {
    await expect(configure.selectedFilterCell("selected")).toHaveCSS(
      "color",
      await configure.tokenColor("--color-band-dim")
    )
    await expect(configure.selectedFilterCell("all")).toHaveCSS(
      "color",
      await configure.tokenColor("--color-band-brand")
    )
  })
})
