import { EXTERNAL_SKILL, SKILL_INDEX } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { EXCLUSIVE_CATEGORY, DOMAINS } from "../support/catalog"
import {
  stubSkillContents,
  stubSkillContentsUnreachable,
} from "../support/skill-contents"
import { captureCreateConfig, STORED_ID } from "../support/sharing"
import { stubSkillIndex } from "../support/skill-index"

// An added skill is a REAL CATALOG ENTRY (owner ruling, 2026-08-16), and its
// content travels inline in the payload rather than as a reference the CLI
// resolves later. Everything below is that ruling seen from the browser.
//
// These are the six defects EDITOR-15 to EDITOR-20 named, asked as questions
// rather than as patches: does the skill ride the payload, come back from a
// link, land beside its neighbours, take part in pick-one, survive a filter
// chip, and install the only way a third-party skill may. Each of them used to
// be a way the second code path for "added" skills went wrong; there is no
// second path any more, which is why they are asked together.

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
  test.beforeEach(async ({ page }) => {
    await stubSkillIndex(page)
    await stubSkillContents(page)
  })

  // CLI-412's editor half. The category is the user's decision, so nothing is
  // pre-chosen and nothing can be added without one: `categoriseRepo` used to
  // guess from the repository name and file everything it missed under
  // Uncategorized, which is the multi-tier fallback EDITOR-17 bans.
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

  // EDITOR-17: it lands where the user filed it, among the skills it belongs
  // with. There is no Added section left to render into.
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
    await expect(cell.root).toContainText("added")
  })

  // EDITOR-19: the chip filters by domain, and the skill has one now. It used
  // to sit outside every domain, so any chip at all erased it — including one
  // for the domain it had just been filed under.
  test("a domain chip keeps it rather than erasing it", async ({
    configure,
  }) => {
    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    await configure.toggleChip(DOMAINS.web)

    await expect(
      configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).root
    ).toBeVisible()
  })

  // EDITOR-18: pick-one is a property of the category, and the skill is in one
  // now — so it evicts its siblings and is evicted by them, in both directions.
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

  // EDITOR-20: a third-party skill is ALWAYS eject (owner, 2026-08-09) — a
  // plugin install serves their content as-is and we cannot write our metadata
  // into their repository, so plugin is not a mode this skill has.
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

  // EDITOR-45. The badge on an eject-only skill is a STATEMENT rather than a
  // control — there is no plugin form to flip to — so it renders as a span with
  // no handler, and the press went straight through it to the cell underneath
  // and DESELECTED the skill. The same-looking badge on a catalogue skill flips
  // install mode and touches selection not at all, so one target had two
  // outcomes depending on which kind of skill was under it.
  //
  // Doing nothing is the answer. A badge that cannot flip must also not select,
  // because the thing it says about itself is that there is nothing to press.
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

    await added.installBadgeTarget.click()

    expect(await added.isSelected()).toBe(true)
    await expect(added.installBadgeTarget).toHaveAttribute(
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

    await added.installBadgeTarget.click()

    expect(await added.isSelected()).toBe(false)
  })

  // Journey 26: `external-` separates these from marketplaces, not from one
  // another, so two skills of one name in one category is a real collision.
  // Detectable at add time with the id in hand, so the intake refuses the
  // second and names what already holds it.
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
  test.beforeEach(async ({ page }) => {
    await stubSkillIndex(page)
  })

  // The bytes are fetched at add time, not at install time. That is the whole
  // trade: the payload becomes self-contained, so `--from` never reaches into a
  // repository that may since have moved, gone private or changed.
  test("the whole directory travels in the payload", async ({
    configure,
    page,
  }) => {
    await stubSkillContents(page)
    const posted = await captureCreateConfig(page)

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

  // EDITOR-15: the dialog used to list a skill and hand over a command that
  // could not install it, because every consumer of the payload dropped the id.
  test("the install dialog lists it beside the catalogue's own", async ({
    configure,
    page,
  }) => {
    await stubSkillContents(page)
    await captureCreateConfig(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).toggle()
    await configure.roster.installButton.click()

    await expect(configure.installDialog.skillsPane).toContainText(SKILL_NAME)
  })

  // A repository the content stub does not serve — it answers 404 for one, the
  // way GitHub does. Refused at the moment of adding, where the fix is, rather
  // than silently adding a skill with no body.
  //
  // The stub is installed here on purpose, and it was not before: without it
  // this test reached the live api.github.com, and what it was really asserting
  // was that `anthropics/skills/skills/docx` weighs 1.1 MB. That passed for as
  // long as a third party kept a directory big, which is not a claim this suite
  // gets to make.
  test("a directory that cannot be read is refused rather than added", async ({
    configure,
    page,
  }) => {
    await stubSkillContents(page)

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
    await stubSkillContentsUnreachable(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()

    await expect(dialog.error).toContainText(/try again/i)
  })
})

// EDITOR-16: a shared link used to come back quietly smaller — the ids the
// sharer's own added skills wore were pruned on arrival, because the receiving
// catalogue had never heard of them. The payload's content is what registers
// them before the pruning runs.
test.describe("importing a link carrying external skills", () => {
  test("the skill arrives with the configuration and stays selected", async ({
    configure,
    page,
  }) => {
    await stubSkillIndex(page)
    await stubSkillContents(page)
    const posted = await captureCreateConfig(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).toggle()
    await configure.roster.installButton.click()
    await expect.poll(() => posted.length).toBeGreaterThan(0)

    const shared = posted.at(-1)!
    await page.route(`**/configs/${STORED_ID}`, (route) =>
      route.fulfill({ status: 200, json: shared })
    )

    // A different browser: nothing added, nothing selected, only the link.
    await page.context().clearCookies()
    await page.evaluate(() => window.localStorage.clear())
    await page.goto(`/?fromId=${STORED_ID}`)

    const arrived = configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME)
    await expect(arrived.root).toBeVisible()
    await expect(arrived.root).toHaveAttribute("aria-pressed", "true")
  })
})
