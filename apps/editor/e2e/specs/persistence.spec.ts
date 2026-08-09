import { SKILL_INDEX } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import {
  DOMAIN_REACH,
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"
import { stubSkillIndex } from "../support/skill-index"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY
const CONFIG_KEY = "agents-inc:config:v1"
const [FIRST] = SKILL_INDEX.skills
const ADDED_SKILL = FIRST!.name

// A readable configuration saved under a version the app has moved past —
// zustand's own envelope, so the store reaches `migrate` rather than failing
// the parse the way the corrupt blob below does. Version 1 is pinned rather
// than derived: what is being tested is a payload written by an older release,
// and one that tracks the current version can never be older than it.
const STALE_VERSION_BLOB = JSON.stringify({
  state: { stackId: null, skills: {}, remembered: {}, agents: {} },
  version: 1,
})

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
    // The rule reached only the web roster, so pinning an api agent ON — bare,
    // with nothing assigned — is the direction the rule cannot re-derive.
    await configure.roster.agentButton("api", "developer").click()

    await page.reload()
    await configure.stacks.waitFor()

    const row = configure.roster.skillRow(REACT, "web-developer")
    await expect(row).toBeVisible()
    await expect(row).toHaveAttribute("aria-pressed", "false")
    await expect(
      configure.roster.agentButton("api", "developer")
    ).toHaveAttribute("aria-pressed", "true")
    // One off the rule's reach — the agent whose only row was switched off
    // derives off on its own — and one pinned on beside it.
    await expect(configure.roster.installButton).toContainText(
      `${DOMAIN_REACH.web - 1 + 1} sub-agents and 1 skill`
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

  // Nothing saved is not the same as something unreadable, and the store is
  // handed both as `undefined` — zustand calls `merge` on every load, including
  // the ones that found an empty storage. Every visitor who has never saved
  // anything goes through this path, so getting it wrong files an issue about
  // discarded work against people who had none.
  //
  // The listener has to be attached before the load it is watching, which is
  // why this reloads rather than using the already-navigated fixture. Storage
  // is still empty at that point: nothing is written until something changes.
  test("a load that finds nothing saved reports nothing", async ({
    configure,
    page,
  }) => {
    const issues: string[] = []
    page.on("console", (message) => {
      if (message.text().startsWith("[issue]")) issues.push(message.text())
    })

    await page.reload()
    await configure.stacks.waitFor()

    expect(issues).toEqual([])
  })

  // The pre-release policy is no migrations: a version bump discards every
  // saved configuration in the app. That is a decision, not a fault — but a
  // discard nobody can see is the same silence the unreadable blob beside it
  // was given a warning for, and this one hits everybody at once.
  test("a configuration from an older version reports the discard", async ({
    configure,
    page,
  }) => {
    const issues: string[] = []
    page.on("console", (message) => {
      if (message.text().startsWith("[issue]")) issues.push(message.text())
    })

    await page.evaluate(
      ([key, blob]) => localStorage.setItem(key!, blob!),
      [CONFIG_KEY, STALE_VERSION_BLOB]
    )
    await page.reload()
    await configure.stacks.waitFor()

    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain(
      "Discarded saved configuration from another version"
    )
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
    await stubSkillIndex(page)
  })

  test("an added skill disappears on reload", async ({ configure, page }) => {
    await configure.addSkillButton.click()
    await configure.addSkillDialog.stage(ADDED_SKILL)
    await configure.addSkillDialog.confirm()
    await configure.skill(ADDED_SKILL).toggle()

    await expect(configure.skill(ADDED_SKILL).root).toBeVisible()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.skill(ADDED_SKILL).root).toBeHidden()
  })

  test("its selection never reaches storage", async ({ configure, page }) => {
    await configure.addSkillButton.click()
    await configure.addSkillDialog.stage(ADDED_SKILL)
    await configure.addSkillDialog.confirm()
    await configure.skill(ADDED_SKILL).toggle()

    const stored = await page.evaluate(
      (key) => localStorage.getItem(key) ?? "",
      CONFIG_KEY
    )
    // The repository, not the skill name: no catalogue id could ever contain
    // an `owner/name`, so this cannot pass by the id simply having moved.
    expect(stored).not.toContain(FIRST!.repo)
  })
})
