import type { Locator } from "@playwright/test"

import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"
import { DOMAINS, EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"

// The provider and sub-agent cards assert this in their own specs.

const LATTICE = '[data-slot="lattice"]'

type Card = {
  kind: string
  cell: (configure: ConfigurePage) => Locator
}

const CARDS: Card[] = [
  { kind: "stack", cell: (configure) => configure.stackCell(0) },
  {
    kind: "skill",
    cell: (configure) =>
      configure.skillIn(
        DOMAINS.web,
        EXCLUSIVE_CATEGORY.name,
        EXCLUSIVE_CATEGORY.first
      ).cell,
  },
]

const backgroundOf = (cell: Locator) =>
  cell.evaluate((node) => getComputedStyle(node).backgroundColor)

const boxOf = async (target: Locator, what: string) => {
  const box = await target.boundingBox()
  if (!box) throw new Error(`${what} must be drawn`)
  return box
}

for (const { kind, cell } of CARDS) {
  test.describe(`a ${kind} card`, () => {
    test("draws one line, one pixel wide", async ({ configure }) => {
      const strokes = await configure.strokes(cell(configure))

      expect(strokes.map(({ width }) => width)).toStrictEqual([1])
    })

    // Unequal, the edge cards would carry different white from the inner ones.
    // Both cards sit in the first row, so the gap above them is the padding.
    test("insets its line by the grid's own padding", async ({ configure }) => {
      const card = cell(configure)
      const grid = await boxOf(
        card.locator(`xpath=ancestor::*[@data-slot="lattice"][1]`),
        "the grid"
      )
      const padding = (await boxOf(card, "the card")).y - grid.y
      const [line] = await configure.strokes(card)

      expect(padding).toBeGreaterThan(0)
      expect(line?.inset).toBeCloseTo(padding, 1)
    })
  })
}

test("horizontal neighbours abut", async ({ configure }) => {
  const left = await configure.stackCell(0).boundingBox()
  const right = await configure.stackCell(1).boundingBox()
  if (!left || !right) throw new Error("both cells must be drawn")

  expect(right.x).toBeCloseTo(left.x + left.width, 1)
})

test.describe("a chosen stack card", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)
  })

  test("changes its line's colour and nothing else", async ({ configure }) => {
    const chosen = configure.stack(STACKS.nextjs)
    const sibling = configure.stack(STACKS.t3)
    const brand = await configure.tokenColor("--color-brand")
    const hairline = await configure.tokenColor("--color-hairline")
    const white = await configure.tokenColor("--color-cell")

    const colours = async (card: Locator) =>
      (await configure.strokes(card)).map(({ colour }) => colour)

    expect(await colours(chosen)).toStrictEqual([brand])
    expect(await colours(sibling)).toStrictEqual([hairline])
    expect(await backgroundOf(chosen)).toBe(white)
    expect(await backgroundOf(sibling)).toBe(white)
  })

  test("takes no hover tint", async ({ configure }) => {
    const chosen = configure.stack(STACKS.nextjs)
    await configure.page.mouse.move(0, 0)
    const atRest = await backgroundOf(chosen)

    await chosen.hover()

    expect(await backgroundOf(chosen)).toBe(atRest)
  })
})

// Shift+Tab then Tab rather than `focus()` alone, so Chromium matches
// `:focus-visible`.
test("a keyboard-focused stack card draws the ring", async ({ configure }) => {
  const card = configure.stack(STACKS.t3)
  await configure.page.mouse.move(0, 0)
  await card.focus()
  await configure.page.keyboard.press("Shift+Tab")
  await configure.page.keyboard.press("Tab")

  expect(await card.evaluate((node) => node.matches(":focus-visible"))).toBe(
    true
  )
  expect(await configure.focusRing(card)).toStrictEqual({
    focused: true,
    ringVisible: true,
  })
})

test("the stack grid draws no line of its own", async ({ configure }) => {
  expect(
    await configure.stacks.evaluate(
      (node, lattice) => node.matches(lattice),
      LATTICE
    )
  ).toBe(true)

  expect(await configure.strokes(configure.stacks)).toStrictEqual([])
})
