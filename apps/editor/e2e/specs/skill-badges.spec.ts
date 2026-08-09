import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY

// The two state badges on a cell. Their accessible name carries the current
// value, so every assertion here reads the accessibility tree rather than the
// amber styling that also signals it.
test.describe("skill state badges", () => {
  test("install mode flips between plugin and eject", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.installBadge).toHaveAccessibleName(
      "Install mode: plugin"
    )
    await skill.flipInstall()
    await expect(skill.installBadge).toHaveAccessibleName("Install mode: eject")
    await skill.flipInstall()
    await expect(skill.installBadge).toHaveAccessibleName(
      "Install mode: plugin"
    )
  })

  test("scope flips between global and project", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.scopeBadge).toHaveAccessibleName("Scope: global")
    await skill.flipScope()
    await expect(skill.scopeBadge).toHaveAccessibleName("Scope: project")
  })

  // A badge configures a skill; it is not a way of choosing one. The value it
  // sets is kept, so picking the skill later arrives with it already applied.
  test("flipping a badge on an unselected skill does not select it", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await skill.flipInstall()

    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await expect(skill.installBadge).toHaveAccessibleName("Install mode: eject")

    await skill.toggle()
    await expect(skill.installBadge).toHaveAccessibleName("Install mode: eject")
  })

  test("flipping a badge does not deselect the skill", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.toggle()
    await skill.flipInstall()
    await skill.flipScope()

    await expect(skill.root).toHaveAttribute("aria-pressed", "true")
  })
})
