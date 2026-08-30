import { SKILL_INDEX } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import {
  DOMAIN_REACH,
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"
import { stubSkillContents } from "../support/skill-contents"
import { stubSkillIndex } from "../support/skill-index"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY
const CONFIG_KEY = "agents-inc:config:v1"
const [FIRST] = SKILL_INDEX.skills
const ADDED_SKILL = FIRST!.name
// Where the intake files it, as the dropdown spells it.
const ADDED_CATEGORY = `${web.toLowerCase()} · ${CATEGORY.toLowerCase()}`

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

  // How the panel is banded and whether the stack grid is folded are
  // ARRANGEMENT, in the same sense a collapsed roster band is: they describe
  // how the screen is laid out rather than something the visitor is in the
  // middle of. So they survive, and the slot is read back rather than inferred
  // from the screen — the two claims come apart the moment a write is dropped.
  test("the roster's grouping mode survives a reload", async ({
    configure,
    page,
  }) => {
    await configure.roster.groupBy("scope")
    await expect(configure.roster.scopeBand("global")).toBeVisible()

    expect(await configure.storedUi()).toMatchObject({
      rosterGroupBy: "scope",
    })

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.roster.scopeBand("global")).toBeVisible()
    await expect(configure.roster.domainBand("web")).toHaveCount(0)
  })

  test("a folded stack grid is still folded after a reload", async ({
    configure,
    page,
  }) => {
    await configure.stackToggle.click()
    await expect(configure.stacks).toHaveCount(0)

    expect(await configure.storedUi()).toMatchObject({ stackCollapsed: true })

    await page.reload()
    await configure.stackToggle.waitFor()

    await expect(configure.stacks).toHaveCount(0)
    await expect(configure.stackToggle).toHaveAccessibleName("Show stacks")
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

// An added skill is a real catalogue entry, but its DIRECTORY is not in
// localStorage — it is resolved at add time and travels in a payload. So a
// selection naming one must not survive into a session that has the id and none
// of the bytes, and could therefore neither describe nor install it. Saving the
// stack is the way to carry one across a reload: that slot holds a payload, and
// a payload carries the content.
test.describe("added skills do not survive a reload on their own", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubSkillIndex(page)
    stubSkillContents(page)

    await configure.addSkillButton.click()
    await configure.addSkillDialog.stage(ADDED_SKILL)
    await configure.addSkillDialog.categorise(ADDED_SKILL, ADDED_CATEGORY)
    await configure.addSkillDialog.confirm()
    await configure.skill(ADDED_SKILL).toggle()
  })

  test("an added skill disappears on reload", async ({ configure, page }) => {
    await expect(configure.skill(ADDED_SKILL).root).toBeVisible()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.skill(ADDED_SKILL).root).toBeHidden()
  })

  test("its selection never reaches storage", async ({ configure, page }) => {
    const stored = await page.evaluate(
      (key) => localStorage.getItem(key) ?? "",
      CONFIG_KEY
    )
    // The `external-` namespace, which no catalogue id can wear: Journey 26
    // reserves it, so this cannot pass by the id simply having moved.
    expect(stored).not.toContain("external-")
    expect(configure.skill(ADDED_SKILL).root).toBeDefined()
  })
})
