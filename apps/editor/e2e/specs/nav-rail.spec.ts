import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

import type { ConfigurePage } from "../pages/configure-page"

// The rail says which page you are on, and the configure screen is one page
// whatever its own address says about what you are LOOKING AT there. A search,
// a domain anchor and the selected-only filter all write the URL, and none of
// them is a different page — so none of them may take the rail's current page
// away.
//
// Each case drives the screen's own control rather than typing an address,
// and asserts the parameter reached the URL first: a link that stays current
// because the parameter never arrived would pass for the wrong reason.

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY

// A search term the catalogue answers, so the grid stays on screen.
const QUERY = "react"

// The one other route this Worker serves, with the prefix, because a document
// load is not built by the router and so does not get its `basepath`.
const SETTINGS_URL = "/editor/settings"

const CASES = [
  {
    what: "a search",
    drive: (configure: ConfigurePage) => configure.search(QUERY),
    param: /[?&]q=react\b/,
  },
  {
    what: "a domain anchor",
    drive: (configure: ConfigurePage) => configure.domainTab("API").click(),
    param: /[?&]domain=api\b/,
  },
  {
    what: "the selected-only filter",
    drive: async (configure: ConfigurePage) => {
      await configure.skillIn(web, CATEGORY, SKILL).toggle()
      await configure.selectedFilterCell("selected").click()
    },
    param: /[?&]sel=true\b/,
  },
] as const

test.describe("the rail's Editor link", () => {
  test("is the current page on the screen's bare address", async ({
    configure,
  }) => {
    await expect(configure.editorLink).toHaveAttribute("aria-current", "page")
  })

  for (const { what, drive, param } of CASES) {
    test(`stays the current page under ${what}`, async ({ configure }) => {
      await drive(configure)
      await expect(configure.page).toHaveURL(param)

      await expect(configure.editorLink).toHaveAttribute("aria-current", "page")
    })
  }

  // The channel: on a page that is not this screen, the same locator reports
  // the link as not current — so the assertions above can fail.
  test("is not the current page anywhere else", async ({ configure }) => {
    await configure.page.goto(SETTINGS_URL)

    await expect(configure.editorLink).toBeVisible()
    await expect(configure.editorLink).not.toHaveAttribute("aria-current")
  })
})
