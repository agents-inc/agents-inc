import { EXTERNAL_SKILL, SKILL_INDEX } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { EXCLUSIVE_CATEGORY, DOMAINS } from "../support/catalog"
import {
  stubSkillContents,
  stubSkillContentsUnreachable,
} from "../support/skill-contents"
import {
  captureCreateConfig,
  stubGetConfig,
  STORED_ID,
} from "../support/sharing"
import { stubSkillIndex } from "../support/skill-index"

// An added skill is a real catalogue entry, and its content travels inline in
// the payload.

// The index entry the specs stage, and the repository the content stub serves.
const [BRAINSTORMING] = SKILL_INDEX.skills
const SKILL_NAME = BRAINSTORMING!.name

// An entry the content stub does not serve, so confirming it reaches the late
// refusal. Within the per-skill cap on purpose: an oversized one is refused on
// the search row before it can be staged, which is a different claim.
const UNSTUBBED_SKILL = SKILL_INDEX.skills.find(
  (entry) => entry.name === "webapp-testing"
)!.name

// A real, exclusive category of the public catalogue — so the skill lands
// beside React and Vue and takes part in their pick-one rule.
const CATEGORY = EXCLUSIVE_CATEGORY.name
const SIBLING = EXCLUSIVE_CATEGORY.first

// What the dropdown calls it. Domain-qualified because a bare "Framework"
// appears under more than one domain and the two are different placements.
const CATEGORY_OPTION = `${DOMAINS.web.toLowerCase()} · ${CATEGORY.toLowerCase()}`

test.describe("adding an external skill", () => {
  test.beforeEach(({ page }) => {
    stubSkillIndex(page)
    stubSkillContents(page)
  })

  // The category is the user's decision: nothing is pre-chosen and nothing is
  // added without one.
  test("the confirm stays shut until a category is chosen", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)

    await expect(dialog.confirmButton).toBeDisabled()

    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)

    await expect(dialog.confirmButton).toBeEnabled()
  })

  test("the dropdown offers the catalogue's own categories", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)

    await expect(
      dialog
        .categorySelect(SKILL_NAME)
        .getByRole("option", { name: CATEGORY_OPTION })
    ).toBeAttached()
  })

  test("the skill lands in the category it was given", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    await expect(
      configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).root
    ).toBeVisible()
    await expect(configure.domain("Added")).toBeHidden()
  })

  test("it still says where it came from", async ({ configure }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    const cell = configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME)
    // The cell rather than the pressable: the selection target is a text-less
    // overlay.
    await expect(cell.cell).toContainText("added")
  })

  // Filed under a real domain, so the strip reaches it like its neighbours.
  test("a domain tab keeps it rather than erasing it", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    await configure.domainTab(DOMAINS.web).click()

    await expect(
      configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).root
    ).toBeVisible()
  })

  // Pick-one belongs to the category, so it evicts its siblings and is evicted
  // by them.
  test("it takes part in its category's pick-one rule", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    const added = configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME)
    const sibling = configure.skillIn(DOMAINS.web, CATEGORY, SIBLING)

    await sibling.toggle()
    await expect(sibling.root).toHaveAttribute("aria-pressed", "true")

    await added.toggle()

    expect(await added.isSelected()).toBe(true)
    expect(await sibling.isSelected()).toBe(false)

    // And the other way: picking the sibling back evicts the added one.
    await sibling.toggle()

    expect(await sibling.isSelected()).toBe(true)
    expect(await added.isSelected()).toBe(false)
  })

  // A third-party skill is always eject: a plugin would serve their content
  // without our metadata.
  test("it installs by ejecting, and the control says so", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    const added = configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME)
    await added.toggle()
    await added.openOptions()

    await expect(added.options.segment("eject")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(added.options.segment("plugin")).toBeDisabled()
  })

  // On an eject-only skill the badge is a statement, not a control, and must
  // not pass the press to the cell.
  test("clicking its install badge neither flips it nor deselects the skill", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    const added = configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME)
    await added.toggle()
    expect(await added.isSelected()).toBe(true)

    await added.installMode.click()

    expect(await added.isSelected()).toBe(true)
    await expect(added.installMode).toHaveAttribute(
      "aria-label",
      "Install mode: eject"
    )
  })

  // The other direction, so the fix cannot be "nothing in the cell selects
  // anything": an unselected eject-only skill is not selected by its badge
  // either, which is what every other badge on the grid already promises.
  test("its install badge does not select it while it is unselected", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    const added = configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME)
    expect(await added.isSelected()).toBe(false)

    await added.installMode.click()

    expect(await added.isSelected()).toBe(false)
  })

  // `external-` separates these from marketplaces, not from each other, so the
  // second is refused.
  test("a second skill claiming a held id is refused, naming the holder", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)

    await expect(dialog.refusal(SKILL_NAME)).toContainText(SKILL_NAME)
    await expect(dialog.confirmButton).toBeDisabled()
  })
})

test.describe("resolving an external skill's content", () => {
  test.beforeEach(({ page }) => {
    stubSkillIndex(page)
  })

  // Fetched at add time, so `--from` never reaches into a repository that may
  // have changed.
  test("the whole directory travels in the payload", async ({
    configure,
    page,
  }) => {
    stubSkillContents(page)
    const posted = captureCreateConfig(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).toggle()
    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()
    await expect.poll(() => posted.length).toBeGreaterThan(0)

    const external = posted.at(-1)!["external"] as Record<
      string,
      { files: Record<string, string>; repo: string }
    >
    const carried = Object.values(external)[0]!

    expect(Object.keys(carried.files).sort()).toStrictEqual(
      Object.keys(EXTERNAL_SKILL.files).sort()
    )
    expect(carried.repo).toBe(EXTERNAL_SKILL.repo)
  })

  test("the install dialog lists it beside the catalogue's own", async ({
    configure,
    page,
  }) => {
    stubSkillContents(page)
    captureCreateConfig(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).toggle()
    await configure.roster.installButton.click()

    await expect(configure.installDialog.skillsPane).toContainText(SKILL_NAME)
  })

  // Refused at add time. Stubbed, so this never reaches the live
  // api.github.com.
  test("a directory that cannot be read is refused rather than added", async ({
    configure,
    page,
  }) => {
    stubSkillContents(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(UNSTUBBED_SKILL)
    await dialog.categorise(UNSTUBBED_SKILL, CATEGORY_OPTION)
    await dialog.confirm()

    await expect(dialog.error).toBeVisible()
    await expect(dialog.root).toBeVisible()
    await expect(configure.skill(UNSTUBBED_SKILL).root).toBeHidden()
  })

  test("an unreachable GitHub says to try again", async ({
    configure,
    page,
  }) => {
    stubSkillContentsUnreachable(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    await expect(dialog.error).toContainText(/try again/i)
  })
})

// The payload's content registers the sharer's added skills before pruning
// runs.
test.describe("importing a link carrying external skills", () => {
  test("the skill arrives with the configuration and stays selected", async ({
    configure,
    page,
  }) => {
    stubSkillIndex(page)
    stubSkillContents(page)
    const posted = captureCreateConfig(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).toggle()
    await configure.roster.installButton.click()
    await expect.poll(() => posted.length).toBeGreaterThan(0)

    // Served back exactly as it was captured — unparsed, since surviving the
    // round trip is the whole claim.
    const shared = posted.at(-1)!
    stubGetConfig(page, STORED_ID, shared)

    // A different browser: nothing added, nothing selected, only the link.
    await page.context().clearCookies()
    await page.evaluate(() => window.localStorage.clear())
    await page.goto(`/?fromId=${STORED_ID}`)

    const arrived = configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME)
    await expect(arrived.root).toBeVisible()
    await expect(arrived.root).toHaveAttribute("aria-pressed", "true")
  })
})
