import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"
import {
  SEARCH_RESULTS,
  SEARCH_TERM,
  mockGitHubSearch,
  repoSkillName,
} from "../support/github"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY
const CONFIG_KEY = "agents-inc:config:v1"
const [FIRST] = SEARCH_RESULTS
const ADDED_SKILL = repoSkillName(FIRST!.full_name)

test.describe("persistence", () => {
  test("the configuration survives a reload", async ({ configure, page }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(
      configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).installBadge
    ).toHaveAccessibleName("Install mode: eject")
  })

  // The two v5 surfaces — a row switched off and an explicit pin — must
  // rebuild exactly from rehydrated state, not re-derive from the rule.
  test("pins and switched-off rows survive a reload", async ({
    configure,
    page,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.skillRow(REACT, "web-developer").click()
    await configure.roster.agentButton("api", "developer").click()

    await page.reload()
    await configure.stacks.waitFor()

    const row = configure.roster.skillRow(REACT, "web-developer")
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute("aria-pressed", "false")
    await expect(
      configure.roster.agentButton("api", "developer")
    ).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.installButton).toContainText(
      "4 sub-agents and 1 skill"
    )
  })

  // Model and effort are decisions about an agent exactly as a pin is, and they
  // are just as expensive to make twice.
  test("an agent's model choice survives a reload", async ({
    configure,
    page,
  }) => {
    await configure.roster.modelWord("web-developer").click()
    await expect(
      configure.roster.modelWord("web-developer")
    ).toHaveAccessibleName("Model for web-developer: fable")

    await page.reload()
    await configure.stacks.waitFor()

    await expect(
      configure.roster.modelWord("web-developer")
    ).toHaveAccessibleName("Model for web-developer: fable")
  })

  // Corrupt storage must reset to empty rather than take the app down.
  test("unreadable storage falls back to an empty configuration", async ({
    configure,
    page,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await page.evaluate(
      (key) => localStorage.setItem(key, "{ not json at all"),
      CONFIG_KEY
    )

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.stack(STACKS.scratch)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.roster.installButton).toContainText("0 skills")
  })
})

// Added skills are session-only by design: they have no catalogue entry, so a
// selection referencing one must not survive into a session that cannot
// describe or install it.
test.describe("session-added skills are not persisted", () => {
  test.beforeEach(async ({ page }) => {
    await mockGitHubSearch(page)
  })

  test("an added skill disappears on reload", async ({ configure, page }) => {
    await configure.addSkillButton.click()
    await configure.addSkillDialog.search(SEARCH_TERM)
    await configure.addSkillDialog.stage(FIRST!.full_name)
    await configure.addSkillDialog.confirm()
    await configure.skill(ADDED_SKILL).toggle()

    await expect(configure.skill(ADDED_SKILL).root).toBeVisible()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.skill(ADDED_SKILL).root).toBeHidden()
  })

  test("its selection never reaches storage", async ({ configure, page }) => {
    await configure.addSkillButton.click()
    await configure.addSkillDialog.search(SEARCH_TERM)
    await configure.addSkillDialog.stage(FIRST!.full_name)
    await configure.addSkillDialog.confirm()
    await configure.skill(ADDED_SKILL).toggle()

    const stored = await page.evaluate(
      (key) => localStorage.getItem(key) ?? "",
      CONFIG_KEY
    )
    expect(stored).not.toContain(FIRST!.full_name)
  })
})
