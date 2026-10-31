import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY, MULTI_CATEGORY } from "../support/catalog"

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
