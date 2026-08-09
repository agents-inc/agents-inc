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
  test("every domain renders when no chip is active", async ({ configure }) => {
    await expect(configure.domain(web)).toBeVisible()
    await expect(configure.domain(api)).toBeVisible()
  })

  test("a domain chip narrows to that domain", async ({ configure }) => {
    await configure.toggleChip(web)

    await expect(configure.domain(web)).toBeVisible()
    await expect(configure.domain(api)).toBeHidden()
  })

  test("clicking the active domain chip clears it", async ({ configure }) => {
    await configure.toggleChip(web)
    await configure.toggleChip(web)

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
  test("a chip does not scroll the page to the top", async ({ configure }) => {
    await configure.scrollTo(SCROLLED)
    // Deliberately not an equality check: late layout settling nudges the
    // offset by a few pixels, and the precondition only needs "we are scrolled".
    await expect.poll(() => configure.scrollY()).toBeGreaterThan(0)

    await configure.toggleChip(web)
    await expect(configure.chip(web)).toHaveAttribute("aria-pressed", "true")

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
