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

// THE DOMAIN STRIP IS NOT HERE, and its absence is the point. It carried two
// tests in this file while a pick narrowed the column to one domain; since
// EDITOR-79 a pick scrolls to a section and filters nothing, so the strip is
// not a filter and `domain-tabs.spec.ts` owns it whole. What remains in this
// file is the query and the `selected` toggle, which are the only two things
// that can take a skill off the page.
test.describe("filtering", () => {
  test("every domain renders before anything is filtered", async ({
    configure,
  }) => {
    await expect(configure.domain(web)).toBeVisible()
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

  test("the selected toggle narrows to chosen skills", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    const before = await configure.skillCells.count()

    await configure.selectedOnlyToggle.click()

    const after = await configure.skillCells.count()
    expect(after).toBeLessThan(before)
    await expect(
      configure.skillIn(web, EXCLUSIVE_CATEGORY.name, STACK_MEMBER_SKILL).root
    ).toBeVisible()
  })

  // A toggle whose only possible effect is an empty column is not a control, so
  // it is ABSENT rather than pressable-and-useless. This replaces a test that
  // asserted the opposite — that pressing it with nothing chosen empties the
  // grid — which is the state the design removed the ability to reach.
  test("the selected toggle is not drawn until something is chosen", async ({
    configure,
  }) => {
    await expect(configure.selectedOnlyToggle).toHaveCount(0)

    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.selectedOnlyToggle).toBeVisible()
  })

  // It states its VALUE, not its name: `all 42` is what you are looking at now
  // and `selected 14` is what you would be looking at instead. The totals are
  // read off the page rather than written here — the catalogue is generated.
  test("the selected toggle states the count on each side of it", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.selectedOnlyToggle).toHaveText(/^all \d+$/)

    await configure.selectedOnlyToggle.click()

    await expect(configure.selectedOnlyToggle).toHaveText(/^selected \d+$/)
  })
})

// THE FIELD HOLDS SEARCH AND NOTHING ELSE, and the strip holds domains and
// nothing else. Both were tried as homes for `selected` and both were rejected
// by name: a chip inside a text field looks like something the field did, and a
// chip on the domain strip is a column-wide control riding on a row of
// section-wide ones. It is a SECTION-LEVEL control, so it sits on the section
// rule — the skills hinge — at the same content edge and in the same border as
// the stack accordion button.
test.describe("where the selected toggle lives", () => {
  test("the search field holds no controls at all", async ({ configure }) => {
    // The channel first: the field really is on the page and really is the box
    // around the input, or the count below is a claim about nothing.
    await expect(configure.searchField).toBeVisible()
    await expect(configure.searchField.getByRole("textbox")).toHaveCount(1)

    await expect(configure.searchField.getByRole("button")).toHaveCount(0)
  })

  test("it sits on the skills hinge, not in the bar", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(
      configure.hinge("pick your skills").or(configure.hinge("then customise"))
    ).toContainText(/^then/)
    await expect(
      configure
        .hinge("then customise")
        .getByRole("button", { name: "Show only selected skills" })
    ).toBeVisible()
    await expect(
      configure.filterBar.getByRole("button", {
        name: "Show only selected skills",
      })
    ).toHaveCount(0)
  })

  // The rule runs behind it and out to the bleed edge, so the control's own
  // right edge is the content edge every other thing in the column ends on —
  // the same x the accordion button above it holds.
  test("ends on the same content edge as the stack accordion", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)

    const toggle = await configure.selectedOnlyToggle.boundingBox()
    const accordion = await configure.stackToggle.boundingBox()
    if (!toggle || !accordion) throw new Error("both controls must be drawn")

    expect(toggle.x + toggle.width).toBeCloseTo(
      accordion.x + accordion.width,
      0
    )
  })
})

// CLEARING HAS NO CONTROL OF ITS OWN. `N skills selected ✕` was built and
// removed: the first stack cell already means "nothing selected", so applying
// it and clearing are the same act and the cell says so. Its own claims live in
// `stacks.spec.ts`; what belongs here is the one consequence a FILTER has —
// that clearing releases the toggle above, or the visitor lands on an empty
// column with no control on screen to get back from it.
test.describe("clearing every selection", () => {
  test("releases the selected filter, so the grid comes back", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.selectedOnlyToggle.click()
    await expect(configure.selectedOnlyToggle).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await configure.stack(STACKS.clearScratch).click()

    await expect(configure.selectedOnlyToggle).toHaveCount(0)
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

// The domain tab's half of this moved to `domain-tabs.spec.ts`: a pick now
// scrolls the page ON PURPOSE, so "did not go to the top" is no longer the
// question — "landed under the bar" is, and the landing assertion there fails
// by the height of everything above the first domain if the router ever starts
// resetting scroll on a pick.
test.describe("filtering and scroll position", () => {
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
