import type { Locator, Page } from "@playwright/test"

import { expect, test } from "../fixtures"
import { stubPrivateMarketplaceCatalog } from "../support/marketplace"
import { stubSkillIndex } from "../support/skill-index"

/**
 * EVERY BORDERED FIELD IS THE WHOLE OF ITS BORDER.
 *
 * The shared `Input` is a bare field — no border, no fill, no padding — meant
 * to sit inside a box that draws the border. Every one of those boxes used to
 * keep the padding as well, so the ring between the border and the text was
 * dead: it looked like the field, it was inside the field's border, and a click
 * on it landed on the wrapper and moved the caret nowhere. The field was a
 * strip in the middle of its own box.
 *
 * So the acceptance is a CLICK rather than a class or a screenshot. A rule
 * about which element owns the padding is satisfied by any number of
 * arrangements that still leave a dead ring; only pressing the mouse in the
 * corner of the drawn box says whether the box is the field.
 *
 * The corners specifically, because they are the two paddings at once and the
 * furthest a pointer can be from the text while still being inside the border.
 */

// Far enough inside the 1px border to be unambiguously within the drawn box,
// close enough to it that anything but a field filling the box misses.
const INSET = 2

// The fixture marketplace that answers 404, which is what makes the dialog
// offer a token field at all. Mirrored rather than imported, as every other
// product string in this suite is.
const PRIVATE_MARKETPLACE = "acme/private-skills"

/**
 * Drops focus onto the body between presses. Without it a corner that does
 * nothing inherits the previous corner's pass, so a field with one live corner
 * and a field with four are the same green.
 */
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

/**
 * Presses each point and reports, BY NAME, which of them left `field` focused.
 *
 * A list rather than an assertion per press, so a failure names every point
 * that missed instead of stopping at the first — three dead corners and one
 * dead corner are different defects, and the first assertion to fail cannot
 * tell them apart.
 */
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

/**
 * Where the caret ended up, as an offset into what the field holds.
 *
 * The second half of the claim, and the half a `<label>` wrapper satisfies by
 * accident: activating a label focuses the field but drops the caret at the end
 * of the value, wherever the pointer was. A field that really fills its box
 * puts the caret under the pointer — so pressing left of the first character
 * has to answer 0, and only a box the field itself owns can.
 */
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
    // Narrowed rather than cast: `selectionStart` exists on two elements and on
    // nothing else, so a locator that has drifted onto a third says which node
    // it landed on instead of reading `undefined` and comparing it to 0.
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

  // The stuck bar swaps the field's padding for a single gutter on the left and
  // none on the right, and animates between the two. The box moves with it, so
  // the claim above has to hold in both states or the padding only moved in one.
  test("takes the caret from every corner while the bar is stuck", async ({
    configure,
  }) => {
    await configure.scrollTo(1500)
    await expect.poll(() => configure.isBarStuck()).toBe(true)

    expect(
      await cornersReaching(
        configure.page,
        configure.searchField,
        configure.searchInput
      )
    ).toStrictEqual(ALL_FOUR)
  })
})

test.describe("the composer's field", () => {
  // The band has no side border — it is full-bleed and notched into the grid —
  // so the box the field must fill is the band's own, all four corners of it.
  //
  // This replaces a two-point press taken LEVEL WITH the field, whose comment
  // said "the band's lower half is the control row, which is a second child and
  // not the field". That was a description of the defect: the row is drawn OVER
  // the field's foot now, so the ~69px beside the Send button takes the caret
  // instead of swallowing the press.
  test("takes the caret from every corner of the band", async ({
    configure,
  }) => {
    const { composer } = configure

    expect(
      await cornersReaching(configure.page, composer.band, composer.field)
    ).toStrictEqual(ALL_FOUR)
  })

  // The claim a press cannot make on its own, and the one that keeps the focus
  // ring right: the field's box IS the band's box. Four live corners are
  // satisfied by a wrapper that forwards clicks; only equal boxes say the ring
  // outlines the whole band rather than a strip across its top.
  test("is the whole of the band it is drawn in", async ({ configure }) => {
    const { composer } = configure
    const band = await boxOf(composer.band, "the band")
    const field = await boxOf(composer.field, "the field")

    expect(field.x).toBeCloseTo(band.x, 0)
    expect(field.y).toBeCloseTo(band.y, 0)
    expect(field.width).toBeCloseTo(band.width, 0)
    expect(field.height).toBeCloseTo(band.height, 0)
  })

  // The one island in it. The control row is `pointer-events-none`, so its empty
  // run falls through to the field underneath — and the button has to take its
  // own presses back, or the composer has no way to send at all.
  //
  // Two presses at the SAME HEIGHT, and the pair is the claim: level with the
  // button, the empty run to its left reaches the field and the button itself
  // still submits. Asserted by consequence rather than by which element took
  // focus, because a submit deliberately focuses the field on its way past — a
  // disabled control cannot hold focus, and the press that disables the button
  // comes from the button.
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

  // THE LAST BORDERED FIELD IN THE APP, and the only one that is conditional:
  // it appears when a repository answers 404, which is the one thing a token
  // might fix. It shares `FIELD_INSET` with the field above it, so a regression
  // would redden both — but "would redden something else" is not coverage, and
  // this is the population's fifth member rather than a variant of its fourth.
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

  // The one field already wrapped in a `<label>`, which is why the corners
  // above were reaching it before any of this. The label is not the fix: it
  // focuses the field and leaves the caret at the end of what is typed, so the
  // padded ring still is not the field — it is a button that opens it.
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
