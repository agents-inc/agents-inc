import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY, MULTI_CATEGORY } from "../support/catalog"

import type { SkillCell } from "../pages/skill-cell"

test.describe("skill selection", () => {
  test("clicking a cell selects it", async ({ configure }) => {
    const react = configure.skill(
      EXCLUSIVE_CATEGORY.first,
      configure.category(DOMAINS.web, EXCLUSIVE_CATEGORY.name)
    )

    await expect(react.root).toHaveAttribute("aria-pressed", "false")
    await react.toggle()
    await expect(react.root).toHaveAttribute("aria-pressed", "true")
  })

  test("clicking a selected cell deselects it", async ({ configure }) => {
    const react = configure.skill(
      EXCLUSIVE_CATEGORY.first,
      configure.category(DOMAINS.web, EXCLUSIVE_CATEGORY.name)
    )

    await react.toggle()
    await react.toggle()
    await expect(react.root).toHaveAttribute("aria-pressed", "false")
  })

  test("a one-of category swaps rather than accumulates", async ({
    configure,
  }) => {
    const category = configure.category(DOMAINS.web, EXCLUSIVE_CATEGORY.name)
    const first = configure.skill(EXCLUSIVE_CATEGORY.first, category)
    const second = configure.skill(EXCLUSIVE_CATEGORY.second, category)

    await first.toggle()
    await second.toggle()

    await expect(second.root).toHaveAttribute("aria-pressed", "true")
    await expect(first.root).toHaveAttribute("aria-pressed", "false")
  })

  test("a multi category holds several at once", async ({ configure }) => {
    const category = configure.category(DOMAINS.web, MULTI_CATEGORY.name)
    const first = configure.skill(MULTI_CATEGORY.first, category)
    const second = configure.skill(MULTI_CATEGORY.second, category)

    await first.toggle()
    await second.toggle()

    await expect(first.root).toHaveAttribute("aria-pressed", "true")
    await expect(second.root).toHaveAttribute("aria-pressed", "true")
  })

  test("selecting is reflected in the install counts", async ({
    configure,
  }) => {
    await expect(configure.roster.installButton).toContainText("0 skills")

    await configure
      .skill(
        EXCLUSIVE_CATEGORY.first,
        configure.category(DOMAINS.web, EXCLUSIVE_CATEGORY.name)
      )
      .toggle()

    await expect(configure.roster.installButton).toContainText("1 skill")
  })
})

/**
 * Captured alone with the pointer away, so the pictures differ by the focus
 * treatment only. Shift+Tab then Tab, so Chromium matches `:focus-visible`;
 * whether it did is returned too.
 */
const underAndAwayFromTheKeyboard = async (skill: SkillCell) => {
  const page = skill.root.page()
  await page.mouse.move(0, 0)
  await skill.root.focus()
  await page.keyboard.press("Shift+Tab")
  await page.keyboard.press("Tab")

  const keyboardFocused = await skill.root.evaluate((node) =>
    node.matches(":focus-visible")
  )
  const focused = await skill.cell.screenshot({ animations: "disabled" })
  await skill.root.blur()
  const away = await skill.cell.screenshot({ animations: "disabled" })

  return { keyboardFocused, unchanged: focused.equals(away) }
}

// The ring must show past the overlay button and the cell's clip, in both
// themes.
test.describe("a skill cell under the keyboard", () => {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`in the ${theme} theme`, () => {
      test.beforeEach(async ({ configure }) => {
        if (theme === "dark") await configure.themeToggle.click()
        expect(await configure.theme()).toBe(theme === "dark" ? "dark" : null)
      })

      test("draws a focus ring", async ({ configure }) => {
        const react = configure.skillIn(
          DOMAINS.web,
          EXCLUSIVE_CATEGORY.name,
          EXCLUSIVE_CATEGORY.first
        )

        const { keyboardFocused, unchanged } =
          await underAndAwayFromTheKeyboard(react)

        expect(keyboardFocused).toBe(true)
        expect(unchanged).toBe(false)
      })

      test("draws a focus ring on a selected cell", async ({ configure }) => {
        const react = configure.skillIn(
          DOMAINS.web,
          EXCLUSIVE_CATEGORY.name,
          EXCLUSIVE_CATEGORY.first
        )
        await react.toggle()
        await expect(react.root).toHaveAttribute("aria-pressed", "true")

        const { keyboardFocused, unchanged } =
          await underAndAwayFromTheKeyboard(react)

        expect(keyboardFocused).toBe(true)
        expect(unchanged).toBe(false)
      })
    })
  }
})
