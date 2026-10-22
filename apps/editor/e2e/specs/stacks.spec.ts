import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY } = EXCLUSIVE_CATEGORY

test.describe("choosing a stack", () => {
  test("scratch is selected on a fresh visit", async ({ configure }) => {
    await expect(configure.stack(STACKS.scratch)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.roster.installButton).toContainText("0 skills")
  })

  test("applying a stack selects its skills", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(
      configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).root
    ).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.installButton).not.toContainText("0 skills")
  })

  test("applying a stack changes the instructional divider", async ({
    configure,
  }) => {
    await expect(configure.hinge("pick your skills")).toBeVisible()

    await configure.chooseStack(STACKS.nextjs)

    const hinge = configure.hinge("then customise")
    await expect(hinge).toBeVisible()
    await expect(hinge).toContainText(STACKS.nextjs.toLowerCase())
  })
})

// The confirm protects real work. A stack's own expansion is not something the
// user chose, so browsing between stacks must not prompt.
test.describe("switching stacks", () => {
  test("switching from scratch does not prompt", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)
    await expect(configure.stackSwitchDialog.root).toBeHidden()
  })

  test("switching between unedited stacks does not prompt", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.chooseStack(STACKS.t3)
    await configure.chooseStack(STACKS.remix)

    await expect(configure.stackSwitchDialog.root).toBeHidden()
    await expect(configure.stack(STACKS.remix)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("switching after an edit prompts", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()

    await configure.chooseStack(STACKS.t3)

    await expect(configure.stackSwitchDialog.root).toBeVisible()
  })

  test("confirming applies the new stack", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()
    await configure.chooseStack(STACKS.t3)

    await configure.stackSwitchDialog.confirm()

    await expect(configure.stackSwitchDialog.root).toBeHidden()
    await expect(configure.stack(STACKS.t3)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("cancelling keeps the current setup", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()
    await configure.chooseStack(STACKS.t3)

    await configure.stackSwitchDialog.cancel()

    await expect(configure.stackSwitchDialog.root).toBeHidden()
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(
      configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).installMode
    ).toHaveText("eject")
  })
})

// The first cell is the reset: applying it and clearing are the same act, so it
// states the cost.
test.describe("the first cell as the reset", () => {
  test("describes a starting point while nothing is selected", async ({
    configure,
  }) => {
    await expect(configure.stack(STACKS.scratch)).toBeVisible()
    await expect(configure.stackCell(0)).toContainText(
      "no stack · pick every skill yourself"
    )
  })

  // Both lines move together.
  test("renames and states the cost once something is selected", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.stack(STACKS.clearScratch)).toBeVisible()
    await expect(configure.stack(STACKS.scratch)).toHaveCount(0)
    await expect(configure.stackCell(0)).toContainText(
      /removes \d+ skills and every sub-agent/
    )
  })

  // Every selection, stack included: the second hinge must stop naming it.
  test("empties the whole configuration, stack included", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    const cell = configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL)
    expect(await cell.isSelected()).toBe(true)

    await configure.stack(STACKS.clearScratch).click()

    expect(await cell.isSelected()).toBe(false)
    await expect(configure.stack(STACKS.scratch)).toBeVisible()
    await expect(configure.hinge("pick your skills")).toBeVisible()
    await expect(configure.roster.installButton).toContainText("0 skills")
  })
})
