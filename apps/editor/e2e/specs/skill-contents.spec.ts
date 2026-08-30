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

// EDITOR-32. A REQUIREMENT of the EDITOR-03 inline-content ruling rather than a
// nicety: a shared link carries a stranger's files and the CLI writes them to
// somebody's disk, so being able to READ them first is what makes carrying them
// acceptable. Someone opening a link from a colleague is about to put another
// person's content on their machine; these specs are that reader's questions.
//
// The bytes are already seated by the time anything renders — added this session
// or arrived in a payload, `adoptSeedPayload` seats both before the first paint
// — so nothing here stubs a preview fetch. There is none to stub.

const [BRAINSTORMING] = SKILL_INDEX.skills
const SKILL_NAME = BRAINSTORMING!.name

const CATEGORY = EXCLUSIVE_CATEGORY.name
const CATALOGUE_SKILL = EXCLUSIVE_CATEGORY.first
const CATEGORY_OPTION = `${DOMAINS.web.toLowerCase()} · ${CATEGORY.toLowerCase()}`

// The directory the content stub serves, and the file that matters most in it.
const MANIFEST = "SKILL.md"
const MANIFEST_TEXT = EXTERNAL_SKILL.files[MANIFEST]
const NESTED = "reference/prompts.md"
const NESTED_TEXT = EXTERNAL_SKILL.files[NESTED]
const FILE_PATHS = Object.keys(EXTERNAL_SKILL.files)

test.describe("reading an added skill's contents", () => {
  test.beforeEach(async ({ page, configure }) => {
    stubSkillIndex(page)
    stubSkillContents(page)
    // Two of these open the install dialog, which mints an id for the command
    // on the way up. There is no preview fetch to stub — the bytes are seated
    // before the first paint — but that mint is a real call and is this file's
    // only one.
    stubCreateConfig(page)

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    await dialog.stage(SKILL_NAME)
    await dialog.categorise(SKILL_NAME, CATEGORY_OPTION)
    await dialog.confirm()
  })

  // The `added` tag is the cell's provenance marker, so it is also the way in:
  // one click from the grid, on the very thing that says this came from
  // somewhere else.
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

  // The whole directory, per the same ruling that made the payload carry it. A
  // preview of SKILL.md alone would be reassuring about one file out of eight.
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

  // A reader deciding whether to trust content wants to know whose it is —
  // owner, repository and the directory within it, because one repository holds
  // many skills and the owner is the informative half.
  test("it says where the content came from", async ({ configure }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).openContents()

    await expect(configure.skillContentsDialog.root).toContainText(
      `${EXTERNAL_SKILL.repo}/${EXTERNAL_SKILL.path}`
    )
  })

  // The whole safety argument in one assertion. This is a stranger's text, so
  // it is rendered AS text: the frontmatter rules survive as three hyphens
  // rather than becoming a horizontal rule, and the pane holds no elements at
  // all — nothing in the file can become markup, script or a link.
  test("the body is rendered as text, never as markup", async ({
    configure,
  }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).openContents()

    const { body } = configure.skillContentsDialog
    await expect(body).toContainText("---")
    expect(await body.evaluate((node) => node.children.length)).toBe(0)
  })

  // EDITOR-33. The assertion above proves the MECHANISM — no element was
  // built, so no renderer ran — and it would fail the day someone reached for
  // markdown. It cannot prove the OUTCOME, because a file of harmless prose
  // renders identically however it is handled.
  //
  // So the fixture carries live markup: a `<script>` and an inline `onerror`,
  // each of which would set a sentinel on `window` the instant anything parsed
  // them. Both halves are asserted, and they pull in opposite directions, which
  // is why neither is enough on its own:
  //
  //   nothing RAN     — no sentinel, and no element built from the markup;
  //   nothing was LOST — the bytes on screen are the file's own, character for
  //                      character, because the claim this dialog makes is that
  //                      what the CLI writes to disk is what is being read.
  //
  // A sanitiser passes the first and fails the second; a markdown renderer
  // fails both. Only escaping-and-showing passes.
  test("shows a hostile SKILL.md verbatim and runs none of it", async ({
    configure,
    page,
  }) => {
    await configure.skillIn(DOMAINS.web, CATEGORY, SKILL_NAME).openContents()

    const { body } = configure.skillContentsDialog
    await expect(body).toBeVisible()

    // The fixture really does carry the markup, so a version of it that stopped
    // carrying it would fail here rather than passing vacuously.
    expect(MANIFEST_TEXT).toContain("<script>")
    expect(MANIFEST_TEXT).toContain("onerror=")

    expect(await body.textContent()).toBe(MANIFEST_TEXT)
    expect(
      await body.evaluate((node) => node.querySelectorAll("*").length)
    ).toBe(0)
    expect(await page.evaluate((name) => name in window, XSS_SENTINEL)).toBe(
      false
    )
  })

  // The second way in, and the one the ruling is really about: the reader is
  // looking at the list of what is about to be written to their disk and can
  // open any of it without losing their place in that list.
  //
  // "Still there" is asked of the sheet rather than of the dialog role, because
  // while the preview is on top Base UI marks the dialog underneath
  // `aria-hidden` — correct for stacked modals, and invisible to `getByRole`.
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

  // Escape dismisses the topmost dialog and only the topmost. Worth pinning:
  // two modals that are siblings in the React tree rather than nested is the
  // arrangement where "Escape closed both" is the obvious way to be wrong, and
  // it would drop the reader out of the flow they were checking.
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

  // The catalogue's own skills are not somebody else's content: they are
  // generated from the marketplace repository this app is built from, and the
  // panel's Source code link already says where. Nothing to preview, so nothing
  // offering to.
  test("a catalogue skill offers no contents to read", async ({
    configure,
  }) => {
    const cell = configure.skillIn(DOMAINS.web, CATEGORY, CATALOGUE_SKILL)

    await expect(cell.contentsButton).toBeHidden()
  })
})
