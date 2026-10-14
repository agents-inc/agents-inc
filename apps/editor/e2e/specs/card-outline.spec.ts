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

const line = (cell: Locator) =>
  cell.evaluate((node) => {
    const after = getComputedStyle(node, "::after")
    return {
      content: after.content,
      outlineWidth: after.outlineWidth,
      outlineColor: after.outlineColor,
      top: parseFloat(after.top),
    }
  })

const style = (cell: Locator) =>
  cell.evaluate((node) => {
    const own = getComputedStyle(node)
    return {
      borderTopWidth: own.borderTopWidth,
      outlineStyle: own.outlineStyle,
      backgroundColor: own.backgroundColor,
      boxShadow: own.boxShadow,
    }
  })

for (const { kind, cell } of CARDS) {
  test.describe(`a ${kind} card`, () => {
    test("draws no border of its own", async ({ configure }) => {
      expect((await style(cell(configure))).borderTopWidth).toBe("0px")
    })

    test("draws its line in ::after, one pixel wide", async ({ configure }) => {
      const drawn = await line(cell(configure))

      expect(drawn.content).not.toBe("none")
      expect(drawn.outlineWidth).toBe("1px")
    })

    // Unequal, the edge cards would carry different white from the inner ones.
    test("insets its line by the grid's own padding", async ({ configure }) => {
      const card = cell(configure)
      const padding = await card
        .locator(`xpath=ancestor::*[@data-slot="lattice"][1]`)
        .evaluate((node) => parseFloat(getComputedStyle(node).paddingTop))
      const { top } = await line(card)

      expect(padding).toBeGreaterThan(0)
      expect(top).toBe(padding)
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

    expect((await style(chosen)).outlineStyle).toBe("none")
    expect((await line(chosen)).outlineColor).toBe(brand)
    expect((await line(sibling)).outlineColor).toBe(hairline)
    expect((await style(chosen)).backgroundColor).toBe(white)
    expect((await style(sibling)).backgroundColor).toBe(white)
  })

  test("takes no hover tint", async ({ configure }) => {
    const chosen = configure.stack(STACKS.nextjs)
    await configure.page.mouse.move(0, 0)
    const atRest = (await style(chosen)).backgroundColor

    await chosen.hover()

    expect((await style(chosen)).backgroundColor).toBe(atRest)
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
  const focused = await style(card)
  expect(focused.outlineStyle).toBe("none")
  expect(focused.boxShadow).toContain(
    await configure.tokenColor("--color-ring")
  )
})

test("the stack grid draws no line of its own", async ({ configure }) => {
  const grid = await configure.stacks.evaluate(
    (node, lattice) => ({
      border: getComputedStyle(node).borderTopWidth,
      matches: node.matches(lattice),
    }),
    LATTICE
  )

  expect(grid).toStrictEqual({ border: "0px", matches: true })
})
