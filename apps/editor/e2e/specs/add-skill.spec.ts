import { SKILL_INDEX } from "@workspace/api-mocks/fixtures"
import { MAX_EXTERNAL_SKILL_BYTES } from "@workspace/matrix/seed"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import { stubSkillContents } from "../support/skill-contents"
import {
  stubSkillIndex,
  stubSkillIndexHidingFreshness,
  stubSkillIndexUnavailable,
  stubStaleSkillIndex,
} from "../support/skill-index"

const [FIRST, SECOND] = SKILL_INDEX.skills
const FIRST_NAME = FIRST!.name
const SECOND_NAME = SECOND!.name

// The one indexed skill nothing can carry — 1.1 MB of XML schemas under a
// SKILL.md. Found by weight rather than named, so it stays the right entry if
// the fixture is re-ordered.
const OVERSIZED = SKILL_INDEX.skills.find(
  (entry) => entry.bytes > MAX_EXTERNAL_SKILL_BYTES
)!
const OVERSIZED_NAME = OVERSIZED.name

// Where a staged skill is filed, as the dropdown spells it — domain-qualified,
// because a bare category name appears under more than one domain. Any real
// category would do; this one is named once in `support/catalog.ts` and already
// carries the catalogue drift check.
const CATEGORY = `${DOMAINS.web.toLowerCase()} · ${EXCLUSIVE_CATEGORY.name.toLowerCase()}`

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
    page,
  }) => {
    await stubSkillContents(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(FIRST_NAME)
    await dialog.categorise(FIRST_NAME, CATEGORY)
    await dialog.confirm()

    await expect(dialog.root).toBeHidden()

    const added = configure.skill(FIRST_NAME)
    await expect(added.root).toBeVisible()
    await expect(added.root).toContainText("added")
  })

  test("an added skill can be selected like any other", async ({
    configure,
    page,
  }) => {
    await stubSkillContents(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(FIRST_NAME)
    await dialog.categorise(FIRST_NAME, CATEGORY)
    await dialog.confirm()

    const added = configure.skill(FIRST_NAME)
    await added.toggle()

    await expect(added.root).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.installButton).toContainText("1 skill")
  })

  // EDITOR-46. The index carries each skill's weight, so a skill past the
  // per-skill cap is refused where the visitor first sees it — not after
  // search, stage, categorise, confirm AND a full GitHub tree listing.
  test("a skill too large to carry says so on its own row", async ({
    configure,
  }) => {
    await configure.addSkillButton.click()

    const row = configure.addSkillDialog.result(OVERSIZED_NAME)
    await expect(row).toContainText(/past the .* a shared link may carry/i)
    // The weight itself, so the number is not a mystery — the same words the
    // late refusal uses, arriving before anything has been staged.
    await expect(row).toContainText(/KB/)
  })

  test("a skill too large to carry offers no way to stage it", async ({
    configure,
  }) => {
    await configure.addSkillButton.click()

    const row = configure.addSkillDialog.result(OVERSIZED_NAME)
    await expect(row).toHaveAttribute("aria-disabled", "true")
    await expect(row).not.toContainText(/stage/i)
  })

  test("clicking a skill too large to carry stages nothing", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()

    await dialog.stage(OVERSIZED_NAME)

    await expect(dialog.footerNote).toContainText("0 staged")
    await expect(dialog.stagedRow(OVERSIZED_NAME)).toBeHidden()
    await expect(dialog.confirmButton).toBeDisabled()
  })

  // The mark is a refusal for one row and not a mood for the pane: everything
  // inside the cap still stages exactly as it did.
  test("a skill within the cap carries no refusal and still stages", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()

    const row = dialog.result(FIRST_NAME)
    await expect(row).not.toContainText(/a shared link may carry/i)
    await dialog.stage(FIRST_NAME)

    await expect(dialog.footerNote).toContainText("1 staged")
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
