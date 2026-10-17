import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

import type { ConfigurePage } from "../pages/configure-page"

// None of these is a different page, so none may take the rail's current page
// away. Each case first asserts its parameter reached the URL.

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY

const QUERY = "react"

// With the prefix: a document load does not get the router's `basepath`.
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

  // The channel: elsewhere the same locator reports the link as not current.
  test("is not the current page anywhere else", async ({ configure }) => {
    await configure.page.goto(SETTINGS_URL)

    await expect(configure.editorLink).toBeVisible()
    await expect(configure.editorLink).not.toHaveAttribute("aria-current")
  })
})
