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

// The query and the `all | selected` pair are the only things that take a
// skill off the page; the domain strip filters nothing (`domain-tabs.spec.ts`).
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

    await configure.selectedFilterCell("selected").click()

    await expect.poll(() => configure.skillCells.count()).toBeLessThan(before)
    await expect(
      configure.skillIn(web, EXCLUSIVE_CATEGORY.name, STACK_MEMBER_SKILL).root
    ).toBeVisible()
  })

  // A filter whose only effect would be an empty column is absent rather
  // than pressable.
  test("the selected filter is not drawn until something is chosen", async ({
    configure,
  }) => {
    await expect(configure.selectedFilter).toHaveCount(0)

    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.selectedFilter).toBeVisible()
  })

  // Read off the page, since the catalogue is generated; different numbers
  // say one count is not wearing the other's word.
  test("states both counts at rest, and they are different numbers", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.selectedFilterCell("all")).toBeVisible()
    await expect(configure.selectedFilterCell("selected")).toBeVisible()

    const countIn = async (word: "all" | "selected") =>
      Number(
        (await configure.selectedFilterCell(word).innerText()).replace(
          /\D+/g,
          ""
        )
      )

    expect(await countIn("all")).toBeGreaterThan(await countIn("selected"))
  })

  test("pressing a cell puts the grid in that mode", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.selectedFilterOn).toHaveText(/^all \d+$/)

    await configure.selectedFilterCell("selected").click()
    await expect(configure.selectedFilterOn).toHaveText(/^selected \d+$/)

    await configure.selectedFilterCell("all").click()
    await expect(configure.selectedFilterOn).toHaveText(/^all \d+$/)
  })
})

// `search-filter.spec.ts` holds where the pair went.
test.describe("where the selected toggle lives", () => {
  test("the skills title holds no control", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)
    const hinge = configure.hinge("then customise")
    // The channel: the title the stack renamed really is drawn.
    await expect(hinge).toContainText(STACKS.nextjs.toLowerCase())

    await expect(hinge.getByRole("radiogroup")).toHaveCount(0)
    await expect(hinge.getByRole("radio")).toHaveCount(0)
  })
})

// Clearing is the first stack cell (`stacks.spec.ts`). Its one consequence for
// a filter: it releases `selected`, or the visitor lands on an empty column
// with no control left to get back.
test.describe("clearing every selection", () => {
  test("releases the selected filter, so the grid comes back", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.selectedFilterCell("selected").click()
    await expect(configure.selectedFilterOn).toHaveText(/^selected \d+$/)

    await configure.stack(STACKS.clearScratch).click()

    await expect(configure.selectedFilter).toHaveCount(0)
    await expect(configure.emptyState).toHaveCount(0)
    await expect(configure.domain(web)).toBeVisible()
  })
})

// A filter change is a router navigation, which resets scroll by default.
// Only "not the top" is asserted: narrowing shortens the page and scroll
// anchoring legitimately moves the offset.
const NO_RESET = "filtering must not scroll the page back to the top"

test.describe("filtering and scroll position", () => {
  test("typing does not scroll the page to the top", async ({ configure }) => {
    await configure.scrollTo(SCROLLED)
    await expect.poll(() => configure.scrollY()).toBeGreaterThan(0)

    await configure.search(STACK_MEMBER_SKILL)
    await expect(configure.searchInput).toHaveValue(STACK_MEMBER_SKILL)

    await expect
      .poll(() => configure.scrollY(), { message: NO_RESET })
      .toBeGreaterThan(0)
  })
})
