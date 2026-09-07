import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY

// THE TWO PAIRS ON A CELL, AND THE POINT OF THEM BEING PAIRS.
//
// Each was one word that flipped on click until the 2026-09-06 refresh, which
// replaced every hidden-alternative control in the app with one showing both
// values at rest — so what a press will do is readable before you press it.
// That is the claim the first two tests are about, and it is a claim about the
// accessibility tree rather than about the amber styling that also signals it:
// a `radiogroup` of `radio`s says the values are alternatives and says which is
// on, where two independent toggles said neither.
test.describe("skill state badges", () => {
  // The refresh in one assertion. `plugin` is on and `eject` is on screen
  // beside it — visible, and reachable, before anything has been pressed.
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

  // TWO PAIRS ON ONE CELL, AND THEY ARE TWO CONTROLS. The 10px between them
  // says so visually; this is the same claim in the tree, and it is what stops
  // four cells reading as one row of four alternatives.
  test("mode and scope are separate exclusive groups", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.installGroup).toBeVisible()
    await expect(skill.scopeGroup).toBeVisible()
    await expect(skill.installGroup.getByRole("radio")).toHaveCount(2)
    await expect(skill.scopeGroup.getByRole("radio")).toHaveCount(2)
  })

  // ONE TAB STOP PER PAIR, not one per cell. Four tab stops on every cell of a
  // 240-cell grid is what a row of independent toggles would have cost.
  test("only the cell that is on takes the tab stop", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.installCell("plugin")).toHaveAttribute("tabindex", "0")
    await expect(skill.installCell("eject")).toHaveAttribute("tabindex", "-1")
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
