import { expect, test } from "../fixtures"
import {
  SEARCH_RESULTS,
  SEARCH_TERM,
  mockGitHubRateLimit,
  mockGitHubSearch,
  mockGitHubUnreachable,
  repoSkillName,
} from "../support/github"

const [FIRST, SECOND] = SEARCH_RESULTS
const FIRST_SKILL = repoSkillName(FIRST!.full_name)
const SECOND_SKILL = repoSkillName(SECOND!.full_name)

test.describe("add skill dialog", () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubSearch(page)
  })

  test("the add button opens the dialog", async ({ configure }) => {
    await configure.addSkillButton.click()
    await expect(configure.addSkillDialog.root).toBeVisible()
  })

  test("searching lists repositories", async ({ configure }) => {
    await configure.addSkillButton.click()
    await configure.addSkillDialog.search(SEARCH_TERM)

    await expect(
      configure.addSkillDialog.result(FIRST!.full_name)
    ).toBeVisible()
    await expect(
      configure.addSkillDialog.result(SECOND!.full_name)
    ).toBeVisible()
  })

  test("staging marks the row and updates the footer count", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.search(SEARCH_TERM)

    await dialog.stage(FIRST!.full_name)

    await expect(dialog.result(FIRST!.full_name)).toHaveAttribute(
      "data-selected",
      "true"
    )
    await expect(dialog.footerNote).toContainText("1 staged")
    await expect(dialog.confirmButton).toHaveText(/Add 1 skill$/)
  })

  test("staging twice unstages", async ({ configure }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.search(SEARCH_TERM)

    await dialog.stage(FIRST!.full_name)
    await dialog.stage(FIRST!.full_name)

    await expect(dialog.footerNote).toContainText("0 staged")
  })

  test("nothing staged leaves the confirm disabled", async ({ configure }) => {
    await configure.addSkillButton.click()
    await expect(configure.addSkillDialog.confirmButton).toBeDisabled()
  })

  test("confirming adds the skills to the grid with an added tag", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.search(SEARCH_TERM)
    await dialog.stage(FIRST!.full_name)
    await dialog.stage(SECOND!.full_name)
    await dialog.confirm()

    await expect(dialog.root).toBeHidden()

    const added = configure.skill(FIRST_SKILL)
    await expect(added.root).toBeVisible()
    await expect(added.root).toContainText("added")
    await expect(configure.skill(SECOND_SKILL).root).toBeVisible()
  })

  test("unmatched skills land in their own Uncategorized section", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.search(SEARCH_TERM)
    await dialog.stage(FIRST!.full_name)
    await expect(dialog.footerNote).toContainText("Uncategorized")
    await dialog.confirm()

    await expect(configure.domain("Added")).toBeVisible()
    await expect(configure.category("Added", "Uncategorized")).toBeVisible()
  })

  test("an added skill can be selected like any other", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.search(SEARCH_TERM)
    await dialog.stage(FIRST!.full_name)
    await dialog.confirm()

    const added = configure.skill(FIRST_SKILL)
    await added.toggle()

    await expect(added.root).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.installButton).toContainText("1 skill")
  })

  test("cancelling adds nothing", async ({ configure }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.search(SEARCH_TERM)
    await dialog.stage(FIRST!.full_name)
    await dialog.cancel()

    await expect(dialog.root).toBeHidden()
    await expect(configure.skill(FIRST_SKILL).root).toBeHidden()
  })
})

test.describe("add skill dialog error states", () => {
  test("a rate limit is reported rather than swallowed", async ({
    configure,
    page,
  }) => {
    await mockGitHubRateLimit(page)
    await configure.addSkillButton.click()
    await configure.addSkillDialog.search(SEARCH_TERM)

    await expect(
      configure.addSkillDialog.root.getByText(/rate limit/i)
    ).toBeVisible()
  })

  test("an unreachable GitHub is reported", async ({ configure, page }) => {
    await mockGitHubUnreachable(page)
    await configure.addSkillButton.click()
    await configure.addSkillDialog.search(SEARCH_TERM)

    await expect(
      configure.addSkillDialog.root.getByText(/could not reach github/i)
    ).toBeVisible()
  })
})
