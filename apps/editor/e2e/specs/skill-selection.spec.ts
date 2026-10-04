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
 * The cell as the keyboard finds it and as it is once the keyboard has left,
 * captured alone, with the pointer nowhere near it — so the two pictures can
 * differ by the focus treatment and by nothing else.
 *
 * Reached by Shift+Tab and Tab rather than by `focus()`: Chromium matches
 * `:focus-visible` on a programmatic move only when the element it left
 * matched too, and the ring is drawn on `:focus-visible`. Whether it matched is
 * returned beside the pictures, because a capture taken without it compares
 * two cells that were never asked to draw a ring.
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

// A CELL THE KEYBOARD IS ON HAS TO LOOK LIKE ONE. The press target is a button
// stretched over the cell, and the cell clips what overflows it — so a ring
// drawn outside the button was drawn entirely in the clipped band, and a
// selected cell's own outline covered the same pixel. The two captures came
// out byte-identical. In both themes, because the ring is a colour on a
// surface and each theme has its own pair.
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
