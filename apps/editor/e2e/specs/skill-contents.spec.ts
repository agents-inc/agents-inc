import {
  EXTERNAL_SKILL,
  SKILL_INDEX,
  XSS_SENTINEL,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { EXCLUSIVE_CATEGORY, DOMAINS } from "../support/catalog"
import { stubCreateConfig } from "../support/sharing"
import { stubSkillContents } from "../support/skill-contents"
import { stubSkillIndex } from "../support/skill-index"

// A shared link carries a stranger's files to someone's disk, so they must be
// readable first.

const [BRAINSTORMING] = SKILL_INDEX.skills
const SKILL_NAME = BRAINSTORMING!.name

const CATEGORY = EXCLUSIVE_CATEGORY.name
const CATALOGUE_SKILL = EXCLUSIVE_CATEGORY.first
const CATEGORY_OPTION = `${DOMAINS.web.toLowerCase()} · ${CATEGORY.toLowerCase()}`

// The directory the content stub serves, and the file that matters most in it.
const MANIFEST = "SKILL.md"
const MANIFEST_TEXT = EXTERNAL_SKILL.files[MANIFEST]
// The manifest's own tags, which would be elements had it been parsed.
const THE_FILES_TAGS = "script, img"
const NESTED = "reference/prompts.md"
const NESTED_TEXT = EXTERNAL_SKILL.files[NESTED]
const FILE_PATHS = Object.keys(EXTERNAL_SKILL.files)

test.describe("reading an added skill's contents", () => {
  test.beforeEach(async ({ page, configure }) => {
    stubSkillIndex(page)
    stubSkillContents(page)
    // Two of these open the install dialog, which mints an id: this file's only
    // network call.
    stubCreateConfig(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()
  })

  // The `added` tag, the cell's provenance marker, is also the way in.
  test("the added cell offers them, and SKILL.md is what opens", async ({
    configure,
  }) => {
    const cell = configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME)
    await cell.openContents()

    const contents = configure.skillContentsDialog
    await expect(contents.root).toBeVisible()
    await expect(contents.openPath).toHaveText(MANIFEST)
    expect(await contents.body.textContent()).toBe(MANIFEST_TEXT)
  })

  // The whole directory, as the payload carries it, not SKILL.md alone.
  test("the tree lists every file in the directory", async ({ configure }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).openContents()

    expect(await configure.skillContentsDialog.paths()).toStrictEqual(
      [...FILE_PATHS].sort()
    )
  })

  test("selecting a file in the tree shows it", async ({ configure }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).openContents()

    const contents = configure.skillContentsDialog
    await contents.open(NESTED)

    await expect(contents.openPath).toHaveText(NESTED)
    expect(await contents.body.textContent()).toBe(NESTED_TEXT)
    await expect(contents.file(NESTED)).toHaveAttribute("aria-current", "true")
  })

  // Owner, repository and directory: one repository holds many skills.
  test("it says where the content came from", async ({ configure }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).openContents()

    await expect(configure.skillContentsDialog.root).toContainText(
      `${EXTERNAL_SKILL.repo}/${EXTERNAL_SKILL.path}`
    )
  })

  // Rendered as text: frontmatter rules stay three hyphens, and the file's
  // tags make no elements.
  test("the body is rendered as text, never as markup", async ({
    configure,
  }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).openContents()

    const { body } = configure.skillContentsDialog
    await expect(body).toContainText("---")
    await expect(body.locator(THE_FILES_TAGS)).toHaveCount(0)
  })

  // Proves the outcome: the fixture carries live markup, and none of it runs.
  test("shows a hostile SKILL.md verbatim and runs none of it", async ({
    configure,
    page,
  }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).openContents()

    const { body } = configure.skillContentsDialog
    await expect(body).toBeVisible()

    // The fixture really carries the markup, so this cannot pass vacuously.
    expect(MANIFEST_TEXT).toContain("<script>")
    expect(MANIFEST_TEXT).toContain("onerror=")

    expect(await body.textContent()).toBe(MANIFEST_TEXT)
    await expect(body.locator(THE_FILES_TAGS)).toHaveCount(0)
    expect(await page.evaluate((name) => name in window, XSS_SENTINEL)).toBe(
      false
    )
  })

  // "Still there" is asked of the sheet: Base UI marks the dialog `aria-hidden`
  // under the preview.
  test("the install dialog opens them, and is still there behind", async ({
    configure,
  }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).toggle()
    await configure.roster.installButton.click()

    const install = configure.installDialog
    await install.contentsOf(SKILL_NAME).click()

    const contents = configure.skillContentsDialog
    await expect(contents.root).toBeVisible()
    await expect(install.sheet).toBeVisible()

    await contents.close()

    await expect(contents.root).toBeHidden()
    await expect(install.skillsPane).toContainText(SKILL_NAME)
  })

  // Escape closes only the topmost: two sibling modals are where closing both
  // is easy to get wrong.
  test("escape closes the preview and leaves the install dialog", async ({
    configure,
    page,
  }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).toggle()
    await configure.roster.installButton.click()
    await configure.installDialog.contentsOf(SKILL_NAME).click()
    await expect(configure.skillContentsDialog.root).toBeVisible()

    await page.keyboard.press("Escape")

    await expect(configure.skillContentsDialog.root).toBeHidden()
    await expect(configure.installDialog.skillsPane).toContainText(SKILL_NAME)
  })

  // The catalogue's own skills are not a stranger's content, so nothing offers
  // to preview them.
  test("a catalogue skill offers no contents to read", async ({
    configure,
  }) => {
    const cell = configure.skillIn(DOMAINS.web, CATEGORY, CATALOGUE_SKILL)

    await expect(cell.contentsButton).toBeHidden()
  })
})
