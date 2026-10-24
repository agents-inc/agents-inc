import { SKILL_INDEX } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { DOMAIN_REACH, DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import { stubSkillContents } from "../support/skill-contents"
import { stubSkillIndex } from "../support/skill-index"

import type { ConfigurePage } from "../pages/configure-page"

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY
const MATRIX_DOMAIN = "Web"
const MATRIX_ROLE = "dev"
// The first agent behind the Meta fold: a Tab out of the fold's toggle lands
// on it.
const FIRST_META_AGENT = "agent-summoner"

// The one piece of explanatory copy in the panel, behind the info glyph.
const SCOPE_TIP =
  "Determines where the skill is installed to. Project-level skills inherit global, but not vice versa."

// Written out rather than derived the way the code derives it. Resolved by hand
// against GitHub; it is `EXCLUSIVE_CATEGORY.first`'s directory.
const CATALOG_SOURCE_URL =
  "https://github.com/agents-inc/skills/tree/HEAD/src/skills/web-framework-react"

// An entry of the mocked index: a real skill in a real repository.
const [ADDED] = SKILL_INDEX.skills
const ADDED_NAME = ADDED!.name
const ADDED_SOURCE_URL = `https://github.com/${ADDED!.repo}/tree/HEAD/${ADDED!.path}`
// Where the intake files it, as the dropdown spells it.
const ADDED_CATEGORY = `${web.toLowerCase()} · ${CATEGORY.toLowerCase()}`

test.describe("skill options panel", () => {
  test("the ellipsis opens the panel", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.options.root).toBeHidden()
    await skill.openOptions()
    await expect(skill.options.root).toBeVisible()
  })

  // The ••• configures a skill without choosing it, showing the assignments
  // picking it would give.
  test("opening on an unselected skill does not select it", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await skill.openOptions()

    await expect(skill.options.root).toBeVisible()
    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await expect(
      skill.options.matrixCell(MATRIX_DOMAIN, MATRIX_ROLE)
    ).toHaveText("pre")
  })

  test("the ellipsis closes an open panel", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await skill.openOptions()
    await expect(skill.options.root).toBeHidden()
  })

  // Hidden by opacity, so revealing it cannot reflow the row; the fade is
  // polled.
  test("the ellipsis only shows on hover", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    expect(await skill.optionsOpacity()).toBe(0)
    await skill.root.hover()

    await expect.poll(() => skill.optionsOpacity()).toBe(1)
  })

  test("the ellipsis draws a focus ring", async ({ configure, page }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.root.focus()
    await page.keyboard.press("Tab")

    const { focused, ringVisible } = await configure.focusRing(
      skill.optionsButton
    )
    expect(focused).toBe(true)
    expect(ringVisible).toBe(true)
  })

  test("the ellipsis stays out while the panel is open", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await configure.roster.heading.hover()

    await expect.poll(() => skill.optionsOpacity()).toBe(1)
  })

  // Every control inside the cell sits on top of the cell's own select.
  test("the controls inside a cell do not toggle it", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.toggle()

    await skill.flipInstall()
    await skill.flipScope()
    await skill.openOptions()

    await expect(skill.root).toHaveAttribute("aria-pressed", "true")
  })

  // Install mode rather than scope: every sub-agent rests at global, so project
  // would leave no assignment.
  test("options set before selecting survive being selected", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await skill.options.choose("eject")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(skill.root).toHaveAttribute("aria-pressed", "false")

    await configure.roster.heading.click()
    await skill.toggle()

    await expect(configure.roster.skillRowsFor(SKILL)).toHaveCount(
      DOMAIN_REACH.web - 1
    )
    await expect(skill.installMode).toHaveText("eject")
    await skill.openOptions()
    await expect(skill.options.segment("eject")).toHaveAttribute(
      "aria-checked",
      "true"
    )
  })

  test("Escape closes the panel", async ({ configure, page }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await page.keyboard.press("Escape")
    await expect(skill.options.root).toBeHidden()
  })

  test("a press outside closes the panel", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await configure.roster.heading.click()
    await expect(skill.options.root).toBeHidden()
  })

  // A skill configures where it installs and which agents carry it, nothing
  // about how they think.
  test("the panel is install mode, install scope and sub-agents", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()
    const labels = skill.options.sectionLabels

    await expect(labels).toHaveCount(3)
    await expect(labels.nth(0)).toContainText("Install mode")
    await expect(labels.nth(1)).toContainText("Install scope")
    await expect(labels.nth(2)).toContainText("Sub-agents")
  })

  test("model and thinking effort have left the panel", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await expect(skill.options.root).not.toContainText("Thinking effort")
    await expect(skill.options.option("opus")).toBeHidden()
    await expect(skill.options.option("max")).toBeHidden()
  })

  test("the panel's install mode stays in sync with the cell badge", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await skill.options.choose("eject")

    await expect(skill.installMode).toHaveText("eject")
  })

  test("a cell badge flip is reflected back in the panel", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    // Scope rests at global, so one flip lands on project.
    await skill.flipScope()
    await skill.openOptions()

    await expect(skill.options.segment("project")).toHaveAttribute(
      "aria-checked",
      "true"
    )
  })
})

// The panel leaves the page as it closes, so a keyboard inside it goes back to
// the ellipsis that opened it rather than to `body`; one anywhere else stays.
test.describe("where the keyboard goes when the panel closes", () => {
  test("goes back to the ellipsis when Escape closes the panel from inside it", async ({
    configure,
    page,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.optionsButton.focus()
    await page.keyboard.press("Enter")
    await skill.options.tabIn()
    await expect(skill.options.focused).toHaveCount(1)

    await page.keyboard.press("Escape")

    await expect(skill.options.root).toBeHidden()
    await expect(skill.optionsButton).toBeFocused()
  })

  test("goes back to the ellipsis when Escape follows a press inside the panel", async ({
    configure,
    page,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await skill.options.choose("project")
    await expect(skill.options.segment("project")).toBeFocused()

    await page.keyboard.press("Escape")

    await expect(skill.options.root).toBeHidden()
    await expect(skill.optionsButton).toBeFocused()
  })

  test("stays on the ellipsis when Escape closes the panel it just opened", async ({
    configure,
    page,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.optionsButton.focus()
    await page.keyboard.press("Enter")
    await expect(skill.options.root).toBeVisible()

    await page.keyboard.press("Escape")

    await expect(skill.options.root).toBeHidden()
    await expect(skill.optionsButton).toBeFocused()
  })

  test("stays where it is when Escape closes the panel from outside it", async ({
    configure,
    page,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await configure.composer.field.focus()

    await page.keyboard.press("Escape")

    await expect(skill.options.root).toBeHidden()
    await expect(configure.composer.field).toBeFocused()
  })

  test("goes where a press outside the panel put it", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await skill.options.choose("project")

    await configure.composer.field.click()

    await expect(skill.options.root).toBeHidden()
    await expect(configure.composer.field).toBeFocused()
  })
})

test.describe("source code link", () => {
  test("a catalogue skill links into the marketplace repository", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await expect(skill.options.sourceLink).toHaveAttribute(
      "href",
      CATALOG_SOURCE_URL
    )
  })

  // With the Meta fold shut, the link is the stop straight after it.
  test("the source link draws a focus ring", async ({ configure, page }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await skill.options.root.getByRole("button", { name: "Meta" }).focus()
    await page.keyboard.press("Tab")

    const { focused, ringVisible } = await configure.focusRing(
      skill.options.sourceLink
    )
    expect(focused).toBe(true)
    expect(ringVisible).toBe(true)
  })

  test("an added skill links into the repository it came from", async ({
    configure,
    page,
  }) => {
    stubSkillIndex(page)
    stubSkillContents(page)
    await configure.addSkillButton.click()
    await configure.addSkillDialog.stage(ADDED_NAME)
    await configure.addSkillDialog.categorise(ADDED_NAME, ADDED_CATEGORY)
    await configure.addSkillDialog.confirm()

    const added = configure.skill(ADDED_NAME)
    await added.openOptions()

    await expect(added.options.sourceLink).toHaveAttribute(
      "href",
      ADDED_SOURCE_URL
    )
  })
})

test.describe("install scope info affordance", () => {
  test("the scope label carries an info glyph", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await expect(skill.options.infoGlyph("install scope")).toBeVisible()
  })

  test("hovering it explains what scope decides", async ({
    configure,
    page,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()
    const tip = page.getByText(SCOPE_TIP)

    await expect(tip).toBeHidden()

    await skill.options.infoGlyph("install scope").hover()

    await expect(tip).toBeVisible()
  })

  test("focusing it explains the same thing", async ({ configure, page }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await skill.options.infoGlyph("install scope").focus()

    await expect(page.getByText(SCOPE_TIP)).toBeVisible()
  })
})

test.describe("sub-agent assignment", () => {
  // A selected framework starts preloaded, so the cycle wraps through empty.
  test("a matrix cell cycles preloaded, unassigned, lazy", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()
    const cell = skill.options.matrixCell(MATRIX_DOMAIN, MATRIX_ROLE)

    await expect(cell).toHaveText("pre")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(cell).toHaveText("")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(cell).toHaveText("lazy")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(cell).toHaveText("pre")
  })

  test("unassigning drops the skill's row from that agent", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.toggle()
    await skill.openOptions()

    await expect(configure.roster.skillRowsFor(SKILL)).toHaveCount(
      DOMAIN_REACH.web
    )
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(configure.roster.skillRowsFor(SKILL)).toHaveCount(
      DOMAIN_REACH.web - 1
    )
  })

  // Relevance keeps a web skill out of API until it is assigned by hand.
  test("an out-of-domain agent stays out until assigned by hand", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.toggle()
    await skill.openOptions()

    const apiDeveloper = configure.roster.agentButton("api", "developer")
    await expect(apiDeveloper).toHaveAttribute("aria-pressed", "false")
    await expect(configure.roster.skillRow(SKILL, "api-developer")).toBeHidden()

    await skill.options.cycleAssignment("API", MATRIX_ROLE)

    await expect(apiDeveloper).toHaveAttribute("aria-pressed", "true")
    await expect(
      configure.roster.skillRow(SKILL, "api-developer")
    ).toBeVisible()
  })

  test("meta agents sit folded behind their own toggle", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()
    const metaAgent = skill.options.option("agent-summoner")

    await expect(metaAgent).toBeHidden()
    await skill.options.root.getByRole("button", { name: "Meta" }).click()
    await expect(metaAgent).toBeVisible()
  })

  test("a cell behind the meta fold draws a focus ring", async ({
    configure,
    page,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()
    const fold = skill.options.root.getByRole("button", { name: "Meta" })
    await fold.click()

    await fold.focus()
    await page.keyboard.press("Tab")

    const { focused, ringVisible } = await configure.focusRing(
      skill.options.option(FIRST_META_AGENT)
    )
    expect(focused).toBe(true)
    expect(ringVisible).toBe(true)
  })

  // A meta-flavor agent is never auto-assigned; the fold is the only path.
  test("assigning through the meta fold reaches the roster", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.toggle()
    await skill.openOptions()
    await skill.options.root.getByRole("button", { name: "Meta" }).click()

    const summoner = configure.roster.agentButton("meta", "agent summoner")
    await expect(summoner).toHaveAttribute("aria-pressed", "false")
    await skill.options.option("agent-summoner").click()

    await expect(summoner).toHaveAttribute("aria-pressed", "true")
    await expect(
      configure.roster.skillRow(SKILL, "agent-summoner")
    ).toBeVisible()
  })

  test("cycling a switched-off cell re-enables it at lazy", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.toggle()
    const row = configure.roster.skillRow(SKILL, "web-developer")
    await row.click()
    await expect(row).toHaveAttribute("aria-pressed", "false")

    await skill.openOptions()
    const cell = skill.options.matrixCell(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(cell).toHaveText("")

    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)

    await expect(cell).toHaveText("lazy")
    await expect(row).toHaveAttribute("aria-pressed", "true")
  })
})

// How far the frame is lifted off the top of the window: the sticky nav rail's
// top edge, negated. Compared to the nearest pixel, since rem at a 110% root
// lands a fraction off.
const frameLift = async (configure: ConfigurePage) => {
  const rail = await configure.navRail.boundingBox()
  if (!rail) throw new Error("the rail must be drawn")

  return -rail.y
}

// Air between the open panel's foot and the composer; negative is overlap.
const panelToDockGap = async (configure: ConfigurePage) => {
  const panel = await configure.skillOptions.root.boundingBox()
  const dock = await configure.composer.dock.boundingBox()
  if (!panel || !dock) throw new Error("the panel and the dock must be drawn")

  return dock.y - (panel.y + panel.height)
}

// A panel on the column's last cell must not grow the page past the frame.
test.describe("an options panel at the foot of the column", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.openLastSkillOptions()
    await expect(configure.skillOptions.root).toBeVisible()
  })

  test("leaves the frame where it is", async ({ configure }) => {
    await configure.scrollToBottom()

    expect(await frameLift(configure)).toBeCloseTo(0, 0)
  })

  test("is drawn above the composer", async ({ configure }) => {
    await configure.scrollToBottom()

    expect(await panelToDockGap(configure)).toBeGreaterThanOrEqual(0)
  })

  // The Meta fold grows the panel after it opens.
  test("leaves the frame where it is once the Meta fold opens", async ({
    configure,
  }) => {
    await configure.skillOptions.root
      .getByRole("button", { name: "Meta" })
      .click()
    await configure.scrollToBottom()

    expect(await frameLift(configure)).toBeCloseTo(0, 0)
    expect(await panelToDockGap(configure)).toBeGreaterThanOrEqual(0)
  })
})
