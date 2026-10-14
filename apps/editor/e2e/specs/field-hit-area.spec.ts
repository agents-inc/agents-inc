import type { Locator, Page } from "@playwright/test"

import { expect, test } from "../fixtures"
import type { ConfigurePage } from "../pages/configure-page"
import { STACKS } from "../support/catalog"
import { stubPrivateMarketplaceCatalog } from "../support/marketplace"
import { stubSkillIndex } from "../support/skill-index"

// Every bordered field is the whole of its border, asserted by pressing the
// drawn box's corners: the furthest a pointer can be from the text inside it.

// Inside the 1px border, close enough that anything but a filling field misses.
const INSET = 2

// The fixture marketplace that answers 404, which makes the dialog offer a
// token field.
const PRIVATE_MARKETPLACE = "acme/private-skills"

// Between presses, or a dead corner inherits the previous corner's pass.
const dropFocus = (page: Page) =>
  page.evaluate(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement) active.blur()
  })

type Box = { x: number; y: number; width: number; height: number }
type Press = { name: string; x: number; y: number }

const cornersOf = (box: Box): Press[] => [
  { name: "top left", x: box.x + INSET, y: box.y + INSET },
  { name: "top right", x: box.x + box.width - INSET, y: box.y + INSET },
  { name: "bottom left", x: box.x + INSET, y: box.y + box.height - INSET },
  {
    name: "bottom right",
    x: box.x + box.width - INSET,
    y: box.y + box.height - INSET,
  },
]

// Which presses left `field` focused, by name, so a failure lists every miss.
const pressesReaching = async (
  page: Page,
  field: Locator,
  presses: readonly Press[]
) => {
  const reached: string[] = []
  for (const press of presses) {
    await dropFocus(page)
    await page.mouse.click(press.x, press.y)
    if (await field.evaluate((node) => node === document.activeElement))
      reached.push(press.name)
  }
  return reached
}

const boxOf = async (locator: Locator, what: string) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${what} must be drawn`)
  return box
}

const cornersReaching = async (page: Page, box: Locator, field: Locator) =>
  pressesReaching(
    page,
    field,
    cornersOf(await boxOf(box, "the box under test"))
  )

const ALL_FOUR = ["top left", "top right", "bottom left", "bottom right"]

// Measured from the bar rather than fixed: the steps above it grow.
const PAST_THE_PIN = 400

const stick = async (configure: ConfigurePage) => {
  const pin = await configure.filterBar.evaluate(
    (bar) => window.scrollY + bar.getBoundingClientRect().top
  )
  await configure.scrollTo(pin + PAST_THE_PIN)
  await expect.poll(() => configure.isBarStuck()).toBe(true)
}

// A `<label>` wrapper focuses the field but drops the caret at the end; a field
// that fills its box puts it under the pointer, so left of the text answers 0.
const caretAfterClickingLeftEdge = async (
  page: Page,
  box: Locator,
  field: Locator,
  value: string
) => {
  await field.fill(value)
  const rect = await boxOf(box, "the box under test")

  await dropFocus(page)
  await page.mouse.click(rect.x + INSET, rect.y + rect.height / 2)
  return field.evaluate((node) => {
    if (!(
      node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
    ))
      throw new Error(
        `the field under test must be a text control: ${node.tagName}`
      )
    return node.selectionStart
  })
}

test.describe("the search field in the filter bar", () => {
  test("takes the caret from every corner of its border", async ({
    configure,
  }) => {
    // A press outside the window lands on nothing.
    await configure.searchField.scrollIntoViewIfNeeded()

    expect(
      await cornersReaching(
        configure.page,
        configure.searchField,
        configure.searchInput
      )
    ).toStrictEqual(ALL_FOUR)
  })

  // The pair is an island: the box around it, beside and past it, is still the
  // field's.
  test("takes the caret from every corner with the pair drawn", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await expect(configure.selectedFilter).toBeVisible()
    await configure.searchField.scrollIntoViewIfNeeded()

    expect(
      await cornersReaching(
        configure.page,
        configure.searchField,
        configure.searchInput
      )
    ).toStrictEqual(ALL_FOUR)
  })

  test("puts the caret where the pointer went, not at the end", async ({
    configure,
  }) => {
    expect(
      await caretAfterClickingLeftEdge(
        configure.page,
        configure.searchField,
        configure.searchInput,
        "react"
      )
    ).toBe(0)
  })

  // The stuck bar swaps the field's padding, so the claim holds in both states.
  test("takes the caret from every corner while the bar is stuck", async ({
    configure,
  }) => {
    await stick(configure)

    expect(
      await cornersReaching(
        configure.page,
        configure.searchField,
        configure.searchInput
      )
    ).toStrictEqual(ALL_FOUR)
  })

  // Four live corners cannot say the field is the whole dark band; equal rects
  // can.
  test("is the whole of the band once the bar is stuck", async ({
    configure,
  }) => {
    await stick(configure)

    const band = await boxOf(configure.filterBand, "the band")
    const field = await boxOf(configure.searchField, "the field")

    expect(field.x).toBeCloseTo(band.x, 0)
    expect(field.y).toBeCloseTo(band.y, 0)
    expect(field.width).toBeCloseTo(band.width, 0)
    expect(field.height).toBeCloseTo(band.height, 0)
  })

  // The field covers the add block's box once stuck: the run beside the block
  // reaches the field, and the block still takes its own press.
  test("takes the run beside the add block, and the block still opens", async ({
    configure,
    page,
  }) => {
    stubSkillIndex(page)
    await stick(configure)

    const band = await boxOf(configure.filterBand, "the band")
    const block = await boxOf(configure.addSkillButton, "the add block")
    const level = block.y + block.height / 2

    expect(
      await pressesReaching(page, configure.searchInput, [
        { name: "beside the block", x: band.x + INSET, y: level },
      ])
    ).toStrictEqual(["beside the block"])
    await expect(configure.addSkillDialog.searchInput).toBeHidden()

    await page.mouse.click(block.x + block.width / 2, level)

    await expect(configure.addSkillDialog.searchInput).toBeVisible()
  })
})

test.describe("the composer's field", () => {
  // The band has no side border, so the box the field must fill is the band's.
  test("takes the caret from every corner of the band", async ({
    configure,
  }) => {
    const { composer } = configure

    expect(
      await cornersReaching(configure.page, composer.band, composer.field)
    ).toStrictEqual(ALL_FOUR)
  })

  // Equal boxes keep the focus ring around the whole band.
  test("is the whole of the band it is drawn in", async ({ configure }) => {
    const { composer } = configure
    const band = await boxOf(composer.band, "the band")
    const field = await boxOf(composer.field, "the field")

    expect(field.x).toBeCloseTo(band.x, 0)
    expect(field.y).toBeCloseTo(band.y, 0)
    expect(field.width).toBeCloseTo(band.width, 0)
    expect(field.height).toBeCloseTo(band.height, 0)
  })

  // The control row is `pointer-events-none`: its empty run reaches the field,
  // and the button still submits. Asserted by consequence, because a submit
  // focuses the field on its way past.
  test("takes the row's empty run and still submits from the button", async ({
    configure,
  }) => {
    const { composer } = configure
    await composer.type("a stack for a small web app")

    const button = await boxOf(composer.sendButton, "the send button")
    const band = await boxOf(composer.band, "the band")
    const level = button.y + button.height / 2

    expect(
      await pressesReaching(configure.page, composer.field, [
        { name: "beside the button", x: band.x + INSET, y: level },
      ])
    ).toStrictEqual(["beside the button"])
    await expect(composer.proposal).toHaveCount(0)

    await configure.page.mouse.click(
      button.x + button.width / 2,
      button.y + button.height / 2
    )

    await expect(composer.proposal).toBeVisible()
  })
})

test.describe("the dialog fields", () => {
  test("the add-skill search takes the caret from every corner", async ({
    configure,
    page,
  }) => {
    stubSkillIndex(page)
    await configure.addSkillButton.click()

    const { searchInput, searchField } = configure.addSkillDialog
    await expect(searchInput).toBeVisible()

    expect(await cornersReaching(page, searchField, searchInput)).toStrictEqual(
      ALL_FOUR
    )
  })

  test("the marketplace field takes the caret from every corner", async ({
    configure,
    page,
  }) => {
    await configure.marketplaceButton.click()

    const { marketplaceInput, marketplaceField } = configure.marketplaceDialog
    await expect(marketplaceInput).toBeVisible()

    expect(
      await cornersReaching(page, marketplaceField, marketplaceInput)
    ).toStrictEqual(ALL_FOUR)
  })

  // Conditional: drawn only when a repository answers 404.
  test("the access-token field takes the caret from every corner", async ({
    configure,
    page,
  }) => {
    stubPrivateMarketplaceCatalog(page)
    const dialog = configure.marketplaceDialog
    await configure.marketplaceButton.click()
    await dialog.fill(PRIVATE_MARKETPLACE)
    await dialog.load()
    await expect(dialog.tokenInput).toBeVisible()

    expect(
      await cornersReaching(page, dialog.tokenField, dialog.tokenInput)
    ).toStrictEqual(ALL_FOUR)
  })

  // Wrapped in a `<label>`, which reaches the corners but not the caret.
  test("the marketplace field puts the caret where the pointer went", async ({
    configure,
    page,
  }) => {
    await configure.marketplaceButton.click()

    const { marketplaceInput, marketplaceField } = configure.marketplaceDialog
    await expect(marketplaceInput).toBeVisible()

    expect(
      await caretAfterClickingLeftEdge(
        page,
        marketplaceField,
        marketplaceInput,
        "owner/repo"
      )
    ).toBe(0)
  })
})
