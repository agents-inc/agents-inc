import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"

const { web, api } = DOMAINS
const NO_MATCH_QUERY = "zzzznotaskill"
const SCROLLED = 1200

test.describe("filtering", () => {
  test("every domain renders when no tab is picked", async ({ configure }) => {
    await expect(configure.domain(web)).toBeVisible()
    await expect(configure.domain(api)).toBeVisible()
  })

  test("a domain tab narrows to that domain", async ({ configure }) => {
    await configure.domainTab(web).click()

    await expect(configure.domain(web)).toBeVisible()
    await expect(configure.domain(api)).toBeHidden()
  })

  test("clicking the picked domain tab clears it", async ({ configure }) => {
    await configure.domainTab(web).click()
    await configure.domainTab(web).click()

    await expect(configure.domain(api)).toBeVisible()
  })

  test("search narrows to matching skills", async ({ configure }) => {
    const before = await configure.skillCells.count()

    await configure.search(STACK_MEMBER_SKILL)

    await expect.poll(() => configure.skillCells.count()).toBeLessThan(before)
    await expect(configure.skill(STACK_MEMBER_SKILL).root.first()).toBeVisible()
  })

  test("a query with no matches shows the empty state", async ({
    configure,
  }) => {
    await configure.search(NO_MATCH_QUERY)

    await expect(configure.emptyState).toBeVisible()
    await expect(configure.skillCells).toHaveCount(0)
  })

  test("the selected chip narrows to chosen skills", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)
    const before = await configure.skillCells.count()

    await configure.toggleChip("Selected")

    const after = await configure.skillCells.count()
    expect(after).toBeLessThan(before)
    await expect(
      configure.skillIn(web, EXCLUSIVE_CATEGORY.name, STACK_MEMBER_SKILL).root
    ).toBeVisible()
  })

  test("the selected chip shows nothing when nothing is chosen", async ({
    configure,
  }) => {
    await configure.toggleChip("Selected")
    await expect(configure.emptyState).toBeVisible()
  })
})

// THE FIELD HOLDS SEARCH AND NOTHING ELSE. Filters lived inside its border for
// most of this design's life and never read as filters there — a chip inside a
// text field looks like something the field did, not something you can do to
// the grid. They sit at the far end of the domain strip now, on the row whose
// other end names what they narrow.
test.describe("where the filters live", () => {
  test("the search field holds no controls at all", async ({ configure }) => {
    // The channel first: the field really is on the page and really is the box
    // around the input, or the count below is a claim about nothing.
    await expect(configure.searchField).toBeVisible()
    await expect(configure.searchField.getByRole("textbox")).toHaveCount(1)

    await expect(configure.searchField.getByRole("button")).toHaveCount(0)
  })

  test("the selection filters ride on the domain strip", async ({
    configure,
  }) => {
    const strip = configure.filterBar.getByRole("button", { name: "Selected" })

    await expect(strip).toBeVisible()
    await expect(
      configure.searchField.getByRole("button", { name: "Selected" })
    ).toHaveCount(0)
  })
})

// `N skills selected ✕` — the one control that says how much has been chosen,
// and the one door back to nothing. It is absent rather than disabled while
// nothing is selected, because a counter reading zero is furniture.
test.describe("clearing every selection", () => {
  test("appears only once something is selected, and counts it", async ({
    configure,
  }) => {
    await expect(configure.clearSelectionButton).toHaveCount(0)

    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.clearSelectionButton).toBeVisible()
    await expect(configure.clearSelectionButton).toContainText(
      /\d+ skills selected/
    )
  })

  // Every selection, not just the visible ones: the stack goes with them, which
  // is what the second hinge reports. A control that cleared the grid and left
  // the page still saying "then customise next.js full-stack" would be telling
  // the visitor they still had a stack.
  test("empties the whole configuration, stack included", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    const cell = configure.skillIn(
      web,
      EXCLUSIVE_CATEGORY.name,
      STACK_MEMBER_SKILL
    )
    expect(await cell.isSelected()).toBe(true)

    await configure.clearSelectionButton.click()

    expect(await cell.isSelected()).toBe(false)
    await expect(configure.clearSelectionButton).toHaveCount(0)
    await expect(configure.hinge("pick your skills")).toBeVisible()
  })

  // Clearing releases the `selected` filter too. Without it the visitor lands
  // on an empty column with no way back to the grid except a filter they have
  // to notice is still on.
  test("releases the selected filter, so the grid comes back", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.toggleChip("Selected")
    await expect(configure.chip("Selected")).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await configure.clearSelectionButton.click()

    await expect(configure.chip("Selected")).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    await expect(configure.emptyState).toHaveCount(0)
    await expect(configure.domain(web)).toBeVisible()
  })
})

// A filter change is a router navigation, which resets scroll to the top by
// default. Filtering narrows what you are already looking at; it must not
// throw you back to the stack grid.
//
// The assertion is only that the position is not zero, because the exact
// number legitimately moves: removing results shortens the page, and the
// browser's scroll anchoring then shifts the offset to keep the content you
// were looking at in view. That is the feature working, not the bug — and any
// assertion tighter than "not the top" ends up encoding the anchoring
// arithmetic rather than the behaviour under test.
const NO_RESET = "filtering must not scroll the page back to the top"

test.describe("filtering and scroll position", () => {
  test("a domain tab does not scroll the page to the top", async ({
    configure,
  }) => {
    await configure.scrollTo(SCROLLED)
    // Deliberately not an equality check: late layout settling nudges the
    // offset by a few pixels, and the precondition only needs "we are scrolled".
    await expect.poll(() => configure.scrollY()).toBeGreaterThan(0)

    await configure.domainTab(web).click()
    await expect(configure.domainTab(web)).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await expect
      .poll(() => configure.scrollY(), { message: NO_RESET })
      .toBeGreaterThan(0)
  })

  test("typing does not scroll the page to the top", async ({ configure }) => {
    await configure.scrollTo(SCROLLED)
    // Deliberately not an equality check: late layout settling nudges the
    // offset by a few pixels, and the precondition only needs "we are scrolled".
    await expect.poll(() => configure.scrollY()).toBeGreaterThan(0)

    await configure.search(STACK_MEMBER_SKILL)
    await expect(configure.searchInput).toHaveValue(STACK_MEMBER_SKILL)

    await expect
      .poll(() => configure.scrollY(), { message: NO_RESET })
      .toBeGreaterThan(0)
  })
})
