import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY

// Each pair shows both values at rest, so what a press will do is readable
// first.
test.describe("skill state badges", () => {
  // `plugin` is on and `eject` is visible beside it, before anything is
  // pressed.
  test("shows both install modes at rest, with one on", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.installCell("plugin")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(skill.installCell("eject")).toBeVisible()
    await expect(skill.installCell("eject")).toHaveAttribute(
      "aria-checked",
      "false"
    )
  })

  test("shows both scopes at rest, with one on", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.scopeCell("global")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(skill.scopeCell("project")).toHaveAttribute(
      "aria-checked",
      "false"
    )
  })

  // Directly, rather than by cycling past whatever sits between: the whole
  // reason the alternatives are on screen.
  test("clicking a cell sets that value", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.setInstallMode("eject")
    await expect(skill.installMode).toHaveText("eject")

    await skill.setInstallMode("plugin")
    await expect(skill.installMode).toHaveText("plugin")
  })

  test("the scope pair is picked from the same way", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.scope).toHaveText("global")
    await skill.setScope("project")

    await expect(skill.scope).toHaveText("project")
  })

  // Two pairs, two controls: otherwise four cells read as one row of
  // alternatives.
  test("mode and scope are separate exclusive groups", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.installGroup).toBeVisible()
    await expect(skill.scopeGroup).toBeVisible()
    await expect(skill.installGroup.getByRole("radio")).toHaveCount(2)
    await expect(skill.scopeGroup.getByRole("radio")).toHaveCount(2)
  })

  // One tab stop per pair, not per cell: either way out of the cell that is on
  // leaves the pair, and back in the other way lands on it again.
  test("only the cell that is on takes the tab stop", async ({
    configure,
    page,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    const on = skill.installCell("plugin")
    const inThePair = skill.installGroup.locator(":focus")

    await on.focus()
    for (const [out, back] of [
      ["Tab", "Shift+Tab"],
      ["Shift+Tab", "Tab"],
    ] as const) {
      await page.keyboard.press(out)
      await expect(inThePair).toHaveCount(0)

      await page.keyboard.press(back)
      await expect(on).toBeFocused()
    }
  })

  // A badge configures a skill; it is not a way of choosing one. The value it
  // sets is kept, so picking the skill later arrives with it already applied.
  test("setting a value on an unselected skill does not select it", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await skill.setInstallMode("eject")

    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await expect(skill.installMode).toHaveText("eject")

    await skill.toggle()
    await expect(skill.installMode).toHaveText("eject")
  })

  test("setting a value does not deselect the skill", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.toggle()
    await skill.flipInstall()
    await skill.flipScope()

    await expect(skill.root).toHaveAttribute("aria-pressed", "true")
  })
})
