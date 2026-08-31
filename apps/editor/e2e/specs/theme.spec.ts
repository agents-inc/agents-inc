import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"

// What `--warm-01` resolves to in each theme, and `body` is painted with it.
// Quoted from the design's palette rather than read back out of the stylesheet,
// for the reason e2e/pages mirrors the product's copy: an assertion that reads
// the very declaration it is checking cannot fail. The same two values
// `visual.spec.ts` uses, and deliberately the same — a theme is a palette
// substitution, so the one thing that proves the switch WORKED is the paint.
const PAGE_BACKGROUND = {
  light: "rgb(255, 255, 255)",
  dark: "rgb(22, 21, 19)",
} as const

// ONE GLYPH, NOT A TRACK. Only the active theme's icon is drawn and clicking it
// flips the theme, so the control's accessible name is the ACTION rather than
// the state — a two-cell sun/moon track was built and rejected precisely
// because it shows a state you are not in.
test.describe("the theme control", () => {
  test("sits in the rail's footer, beside the GitHub mark", async ({
    configure,
  }) => {
    await expect(configure.themeToggle).toBeVisible()
    await expect(configure.themeToggle).toHaveAccessibleName(
      "Switch to dark theme"
    )
  })

  // The palette follows the OS until somebody says otherwise, which is why the
  // root carries no `data-theme` at all on arrival: an attribute written on
  // mount would freeze whatever the machine happened to be set to at that
  // moment and stop tracking it.
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
