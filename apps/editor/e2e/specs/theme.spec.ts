import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"

// Quoted from the design's palette, not read from the stylesheet, so the
// assertion can fail.
const PAGE_BACKGROUND = {
  light: "rgb(255, 255, 255)",
  dark: "rgb(22, 21, 19)",
} as const

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

  // Follows the OS until asked: no `data-theme` on arrival, since one written
  // on mount would freeze the machine's setting.
  test("says nothing until it is asked to", async ({ configure }) => {
    expect(await configure.theme()).toBeNull()
  })

  test("repaints the app, and offers the way back", async ({ configure }) => {
    await expect(configure.page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.light
    )

    await configure.themeToggle.click()

    expect(await configure.theme()).toBe("dark")
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

    expect(await configure.theme()).toBe("light")
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

    expect(await configure.theme()).toBe("light")
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.light
    )
  })

  test("remembers the choice across a reload", async ({ configure, page }) => {
    await configure.themeToggle.click()
    expect(await configure.theme()).toBe("dark")

    await page.reload()
    const reopened = new ConfigurePage(page)
    await reopened.stacks.waitFor()

    expect(await reopened.theme()).toBe("dark")
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      PAGE_BACKGROUND.dark
    )
  })
})
