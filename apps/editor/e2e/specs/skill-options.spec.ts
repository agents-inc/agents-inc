import type { Locator } from "@playwright/test"
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
// The first agent behind the Meta fold, and so the first cell a Tab out of the
// fold's own toggle reaches.
const FIRST_META_AGENT = "agent-summoner"

// The design system draws one focus ring and nothing machine-decidable can
// check it — axe does not look at focus indicators — so photographing it is
// the whole gate. A computed box-shadow is not enough: a parent's clip hid
// every pixel of the skill cell's ring while its shadow read back fine (audit
// issue 23). So the control's neighbourhood is photographed twice with focus
// left where it is, once as drawn and once with the ring's colour made
// transparent, and identical pictures mean nobody could see the ring. Blurring
// instead would also hide the •••, since focus is what reveals it.
//
// Focus has to arrive by keyboard rather than through `focus()`, which makes
// these tests read oddly: Chromium only matches `:focus-visible` on a
// programmatic move when the element it left matched too, and every control
// here is reached past a click.
const RING_ROOM = 4

const focusRing = async (locator: Locator) => {
  const focused = await locator.evaluate(
    (node) => node === document.activeElement
  )
  const box = await locator.boundingBox()
  if (!box) throw new Error("the focused control has no box on screen")

  const clip = {
    x: box.x - RING_ROOM,
    y: box.y - RING_ROOM,
    width: box.width + 2 * RING_ROOM,
    height: box.height + 2 * RING_ROOM,
  }
  const photograph = () =>
    locator.page().screenshot({ clip, animations: "disabled" })

  const drawn = await photograph()
  await locator.evaluate((node) =>
    node.style.setProperty("--tw-ring-color", "transparent")
  )
  const withoutTheRing = await photograph()
  await locator.evaluate((node) => node.style.removeProperty("--tw-ring-color"))

  return { focused, ringVisible: !drawn.equals(withoutTheRing) }
}

// The one piece of explanatory copy in the panel, behind the info glyph.
const SCOPE_TIP =
  "Determines where the skill is installed to. Project-level skills inherit global, but not vice versa."

// Where React's own directory sits in the marketplace repository, written out
// rather than rebuilt from the app's own rule — a spec that derives the URL the
// same way the code does would agree with it however wrong both were. Resolved
// by hand against GitHub, and it is `EXCLUSIVE_CATEGORY.first`'s id, so a
// catalogue that renames the skill fails here naming this line.
const CATALOG_SOURCE_URL =
  "https://github.com/agents-inc/skills/tree/HEAD/src/skills/web-framework-react"

// An entry of the mocked index, which is a real skill in a real repository —
// the index only holds skills whose SKILL.md was read.
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

  // The ••• configures a skill; it is not a way of choosing one. It shows what
  // picking the skill would give — the rule's assignments already in place.
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

  // It stays in the layout at zero opacity, so revealing it cannot reflow the
  // row — which means "hidden" is asserted on opacity, not visibility, and the
  // 120ms fade has to be polled rather than read once.
  test("the ellipsis only shows on hover", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    expect(await skill.optionsOpacity()).toBe(0)
    await skill.root.hover()

    await expect.poll(() => skill.optionsOpacity()).toBe(1)
  })

  // Focus reveals the ••• as hover does, but being visible is not the same as
  // being marked as focused: the ring is what says which control the keyboard
  // is on.
  test("the ellipsis draws a focus ring", async ({ configure, page }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.root.focus()
    await page.keyboard.press("Tab")

    const { focused, ringVisible } = await focusRing(skill.optionsButton)
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

  // Configuring an unselected skill is kept, so picking it later arrives with
  // the setup already applied rather than starting over.
  //
  // Install mode is the exclusive row under test rather than install scope, and
  // that is EDITOR-08 rather than an arbitrary pick: every sub-agent rests at
  // global, so choosing `project` here would put the whole matrix out of reach
  // and there would be no assignment left to unmake. `scope-reach.spec.ts`
  // covers that on its own terms; the claim here is that an option and an
  // assignment both survive, which needs a pair that can coexist.
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

  // A test that the cell's `N agents` label could not open the panel stood here
  // until 2026-09-07. The label is gone, so the claim has nothing to be true
  // of — deleted rather than re-pointed at some other span, since "this
  // particular non-control is not a control" is only worth asserting about a
  // thing that exists.

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

  // A skill is a plugin from someone else's repo — it configures where it
  // installs and which agents carry it, and nothing about how they think.
  test("the panel is install mode, install scope and sub-agents", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()
    const labels = skill.options.sectionLabels

    await expect(labels).toHaveCount(3)
    await expect(labels.nth(0)).toContainText("Install mode")
    // Scope used to share the install-mode label; it names itself now, because
    // the info affordance hangs off that name.
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

// A skill is somebody else's repository, and until now the panel described
// everything about installing one and nothing about where it comes from.
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

  // The link owes the keyboard the same ring as the cells above it. This is
  // the panel's last tab stop, so reaching it pulls the panel's foot into view
  // — which is precisely the Tab that used to lose its focus to the filter
  // bar, and why this test could not be written until the bar stopped taking
  // it. With the Meta fold shut the link is the stop straight after it.
  test("the source link draws a focus ring", async ({ configure, page }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await skill.options.root.getByRole("button", { name: "Meta" }).focus()
    await page.keyboard.press("Tab")

    const { focused, ringVisible } = await focusRing(skill.options.sourceLink)
    expect(focused).toBe(true)
    expect(ringVisible).toBe(true)
  })

  // An added skill is a directory in a repository that is not ours, and the
  // index it arrived through carries both halves of that address.
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

// Project versus global is the one option in the panel whose consequence is not
// self-evident, so it is the one that gets explained — on demand, not as
// standing hint text.
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

    // Nothing is on screen until it is asked for.
    await expect(tip).toBeHidden()

    await skill.options.infoGlyph("install scope").hover()

    await expect(tip).toBeVisible()
  })

  // Keyboard equivalence: the glyph is focusable precisely so the explanation
  // is not pointer-only.
  test("focusing it explains the same thing", async ({ configure, page }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.openOptions()

    await skill.options.infoGlyph("install scope").focus()

    await expect(page.getByText(SCOPE_TIP)).toBeVisible()
  })
})

test.describe("sub-agent assignment", () => {
  // Selecting a framework already assigned it, preloaded, to the domain's
  // core agents — so the cycle starts from `pre` and wraps through empty.
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

  // Read off the roster, which is the surface that both shows the assignments
  // and loses one — the cell used to state the number under its own badges and
  // no longer does.
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

  // A web skill never reaches API on its own — relevance keeps it inside its
  // domain — so the out-of-domain cell arrives empty, and assigning it by hand
  // is what brings the agent into the roster.
  test("an out-of-domain agent stays out until assigned by hand", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    // The roster only carries a selected skill's assignments.
    await skill.toggle()
    await skill.openOptions()

    await expect(configure.roster.domainBand("api")).toContainText("0 of")
    await expect(configure.roster.skillRow(SKILL, "api-developer")).toBeHidden()

    await skill.options.cycleAssignment("API", MATRIX_ROLE)

    await expect(configure.roster.domainBand("api")).toContainText("1 of")
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

  // A labelled agent cell is drawn from the grid's own cell variants and is
  // just as much a button, so it owes the keyboard the same ring the cells
  // beside it draw.
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

    const { focused, ringVisible } = await focusRing(
      skill.options.option(FIRST_META_AGENT)
    )
    expect(focused).toBe(true)
    expect(ringVisible).toBe(true)
  })

  // A meta-flavor agent is never auto-assigned, so the fold is the only path
  // to it. The band starts at two, not zero: the consolidated `pm` and
  // `reviewer` share the meta group and auto-carry the selected web skill.
  test("assigning through the meta fold reaches the roster", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.toggle()
    await skill.openOptions()
    await skill.options.root.getByRole("button", { name: "Meta" }).click()

    await expect(configure.roster.domainBand("meta")).toContainText("2 of")
    await skill.options.option("agent-summoner").click()

    await expect(configure.roster.domainBand("meta")).toContainText("3 of")
    await expect(
      configure.roster.skillRow(SKILL, "agent-summoner")
    ).toBeVisible()
  })

  // A row the roster switched off reads as unassigned in the matrix, and
  // cycling it starts over at lazy — with the row itself re-enabled.
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

/**
 * Where the app's frame sits in the window: the top edge of the nav rail, which
 * is sticky and one screen tall, so it reads 0 for as long as the frame holds
 * still. Positive is the frame lifted off the top of the window by that many
 * pixels, with a strip of bare page under it.
 *
 * Compared to the nearest pixel rather than exactly: the grid's height is rem
 * at a 110% root, so at the foot of the page the rail sits a fraction of a
 * pixel off with no panel open at all — the page landing on a whole pixel, not
 * the frame moving. The defect this is about lifted it by a hundred.
 */
const frameLift = async (configure: ConfigurePage) => {
  const rail = await configure.navRail.boundingBox()
  if (!rail) throw new Error("the rail must be drawn")

  return -rail.y
}

/**
 * How much air there is between the open panel's foot and the composer's top
 * edge. Negative is the overlap, in pixels: the panel drawn past the dock.
 */
const panelToDockGap = async (configure: ConfigurePage) => {
  const panel = await configure.skillOptions.root.boundingBox()
  const dock = await configure.composer.dock.boundingBox()
  if (!panel || !dock) throw new Error("the panel and the dock must be drawn")

  return dock.y - (panel.y + panel.height)
}

// A PANEL OPENED AT THE FOOT OF THE COLUMN. It hangs from the top of its cell
// and is taller than the cell, so on the last row it reached past the end of
// the page — and the page grew to hold it, outside the frame: scrolling to
// see it lifted the rail, the roster and the dock together, and drew the
// panel's foot below the dock with bare page beneath the lot.
//
// Opened on whichever cell the column ends on and read at the bottom of the
// page, which is the only scroll position this is about.
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

  // The panel grows after it opens — the Meta fold adds a row per agent — so
  // whatever holds the frame still has to follow the panel rather than know
  // its first height.
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
