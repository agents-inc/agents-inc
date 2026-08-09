import { SKILL_INDEX } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import {
  stubSkillIndex,
  stubSkillIndexHidingFreshness,
  stubSkillIndexUnavailable,
  stubStaleSkillIndex,
} from "../support/skill-index"

const [FIRST, SECOND] = SKILL_INDEX.skills
const FIRST_NAME = FIRST!.name
const SECOND_NAME = SECOND!.name

// A term no entry's name or description holds, so the filter empties the list.
const UNMATCHED_TERM = "no-such-skill-anywhere"

test.describe("add skill dialog", () => {
  test.beforeEach(async ({ page }) => {
    await stubSkillIndex(page)
  })

  test("the add button opens the dialog", async ({ configure }) => {
    await configure.addSkillButton.click()
    await expect(configure.addSkillDialog.root).toBeVisible()
  })

  // The whole index arrives in one response and is filtered in the browser, so
  // opening the dialog is already a list — there is nothing to type first.
  test("opening lists the index without a search", async ({ configure }) => {
    await configure.addSkillButton.click()

    await expect(configure.addSkillDialog.result(FIRST_NAME)).toBeVisible()
    await expect(configure.addSkillDialog.result(SECOND_NAME)).toBeVisible()
  })

  test("a result carries its description and its provenance", async ({
    configure,
  }) => {
    await configure.addSkillButton.click()

    // The provenance badge carries GitHub's whole `owner/name`, owner included:
    // it is who a reader is deciding whether to trust, and `skills` alone says
    // nothing about who published it.
    const row = configure.addSkillDialog.result(FIRST_NAME)
    await expect(row).toContainText(FIRST!.description)
    await expect(row).toContainText(FIRST!.repo)
    await expect(row).toContainText("★")
  })

  test("typing narrows the list to what matches", async ({ configure }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.search(FIRST_NAME)

    await expect(dialog.result(FIRST_NAME)).toBeVisible()
    await expect(dialog.result(SECOND_NAME)).toBeHidden()
  })

  test("a term nothing matches says so rather than showing an empty pane", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.search(UNMATCHED_TERM)

    await expect(dialog.result(FIRST_NAME)).toBeHidden()
    await expect(dialog.root.getByText(/no skills match/i)).toBeVisible()
  })

  test("staging marks the row and updates the footer count", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()

    await dialog.stage(FIRST_NAME)

    await expect(dialog.result(FIRST_NAME)).toHaveAttribute(
      "data-selected",
      "true"
    )
    await expect(dialog.footerNote).toContainText("1 staged")
    await expect(dialog.confirmButton).toHaveText(/Add 1 skill$/)
  })

  test("staging twice unstages", async ({ configure }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()

    await dialog.stage(FIRST_NAME)
    await dialog.stage(FIRST_NAME)

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
    await dialog.stage(FIRST_NAME)
    await dialog.stage(SECOND_NAME)
    await dialog.confirm()

    await expect(dialog.root).toBeHidden()

    const added = configure.skill(FIRST_NAME)
    await expect(added.root).toBeVisible()
    await expect(added.root).toContainText("added")
    await expect(configure.skill(SECOND_NAME).root).toBeVisible()
  })

  test("unmatched skills land in their own Uncategorized section", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(FIRST_NAME)
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
    await dialog.stage(FIRST_NAME)
    await dialog.confirm()

    const added = configure.skill(FIRST_NAME)
    await added.toggle()

    await expect(added.root).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.installButton).toContainText("1 skill")
  })

  test("cancelling adds nothing", async ({ configure }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(FIRST_NAME)
    await dialog.cancel()

    await expect(dialog.root).toBeHidden()
    await expect(configure.skill(FIRST_NAME).root).toBeHidden()
  })
})

// No shared stub here: each of these decides what the worker answers, and the
// count of answers is half of what they assert.
test.describe("add skill dialog freshness and failure", () => {
  // A fresh index is the current whole picture, so reopening reuses what is
  // already in memory rather than asking the worker the same question twice.
  test("a fresh index is not asked for again on the next open", async ({
    configure,
    page,
  }) => {
    const requests = await stubSkillIndex(page)
    const dialog = configure.addSkillDialog

    await configure.addSkillButton.click()
    await expect(dialog.result(FIRST_NAME)).toBeVisible()
    await dialog.cancel()
    await configure.addSkillButton.click()
    await expect(dialog.result(FIRST_NAME)).toBeVisible()

    expect(requests).toHaveLength(1)
  })

  // Stale means "this list is not everything, ask again later" — so the results
  // are shown and the caveat is said, rather than the list being withheld.
  test("a stale index still lists results and says it is still filling", async ({
    configure,
    page,
  }) => {
    await stubStaleSkillIndex(page)
    await configure.addSkillButton.click()

    await expect(configure.addSkillDialog.result(FIRST_NAME)).toBeVisible()
    await expect(
      configure.addSkillDialog.root.getByText(/still filling/i)
    ).toBeVisible()
  })

  test("a stale index is asked for again on the next open", async ({
    configure,
    page,
  }) => {
    const requests = await stubStaleSkillIndex(page)
    const dialog = configure.addSkillDialog

    await configure.addSkillButton.click()
    await expect(dialog.result(FIRST_NAME)).toBeVisible()
    await dialog.cancel()
    await configure.addSkillButton.click()
    await expect(dialog.result(FIRST_NAME)).toBeVisible()

    await expect.poll(() => requests.length).toBe(2)
  })

  // The header set and dropped in transit — the worker's `exposeHeaders` gone,
  // or a proxy stripping it — so the dialog is told nothing. Nothing is the
  // third answer: it asks again like a stale index, and says nothing to the
  // user, because "still filling" is a claim and it has not been given one.
  // This was every browser read until the worker exposed the header.
  test("a freshness header the browser cannot read is not read as stale", async ({
    configure,
    page,
  }) => {
    const requests = await stubSkillIndexHidingFreshness(page)
    const dialog = configure.addSkillDialog

    await configure.addSkillButton.click()
    await expect(dialog.result(FIRST_NAME)).toBeVisible()
    await expect(dialog.root.getByText(/still filling/i)).toBeHidden()
    await dialog.cancel()
    await configure.addSkillButton.click()
    await expect(dialog.result(FIRST_NAME)).toBeVisible()

    await expect.poll(() => requests.length).toBe(2)
  })

  test("an unavailable index is reported rather than swallowed", async ({
    configure,
    page,
  }) => {
    await stubSkillIndexUnavailable(page)
    await configure.addSkillButton.click()

    await expect(
      configure.addSkillDialog.root.getByText(/loading the skill index failed/i)
    ).toBeVisible()
  })
})
