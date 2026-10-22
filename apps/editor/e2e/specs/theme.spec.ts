import { expect, test } from "../fixtures"
import { ConfigurePage, PAGE_BACKGROUND } from "../pages/configure-page"

// One glyph: only the active theme's icon is drawn, so the accessible name is
// the action.
test.describe("the theme control", () => {
  test("sits in the rail's footer, beside the GitHub mark", async ({
    configure,
  }) => {
    await expect(configure.themeToggle).toBeVisible()
    await expect(configure.themeToggle).toHaveAccessibleName(
      "Switch to dark theme"
    )
  })

  // A theme written on arrival would freeze the machine's setting.
  test("follows the operating system until it is asked", async ({
    configure,
  }) => {
    const { page } = configure
    const body = page.locator("body")

    await page.emulateMedia({ colorScheme: "dark" })
    await expect(body).toHaveCSS("background-color", PAGE_BACKGROUND.dark)

    await page.emulateMedia({ colorScheme: "light" })
    await expect(body).toHaveCSS("background-color", PAGE_BACKGROUND.light)
  })

  test("repaints the app, and offers the way back", async ({ configure }) => {
    await expect(configure.page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.light
    )

    await configure.themeToggle.click()

    await expect(configure.page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.dark
    )
    await expect(configure.themeToggle).toHaveAccessibleName(
      "Switch to light theme"
    )

    // The other direction, and the reason the assertion above is about a
    // control rather than a one-way switch.
    await configure.themeToggle.click()

    await expect(configure.page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.light
    )
  })

  // An explicit choice has to win over the OS in BOTH directions. A dark
  // machine whose reader asked for light is the half a `prefers-color-scheme`
  // media block gets wrong on its own.
  test("beats the operating system, in both directions", async ({
    configure,
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.dark
    )

    // The glyph is drawing a dark app, so pressing it asks for light.
    await configure.themeToggle.click()

    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.light
    )
  })

  test("remembers the choice across a reload", async ({ configure, page }) => {
    await configure.themeToggle.click()
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.dark
    )

    await page.reload()
    const reopened = new ConfigurePage(page)
    await reopened.stacks.waitFor()

    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.dark
    )
  })
})
