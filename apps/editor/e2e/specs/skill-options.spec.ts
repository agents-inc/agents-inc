import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"

const { web } = DOMAINS
const { name: CATEGORY, first: SKILL } = EXCLUSIVE_CATEGORY
const MATRIX_DOMAIN = "Web"
const MATRIX_ROLE = "dev"

// The one piece of explanatory copy in the panel, behind the info glyph.
const SCOPE_TIP =
  "Determines where the skill is installed to. Project-level skills inherit global, but not vice versa."

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
  test("options set before selecting survive being selected", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.openOptions()
    await skill.options.choose("global")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(skill.root).toHaveAttribute("aria-pressed", "false")

    await configure.roster.heading.click()
    await skill.toggle()

    await expect(skill.agentCount).toHaveText("3 agents")
    await expect(skill.scopeBadge).toHaveAccessibleName("Scope: global")
    await skill.openOptions()
    await expect(skill.options.option("global")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // A label, not a control: only the ••• reaches the panel.
  test("the agent count does not open the panel", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.toggle()

    await skill.agentCount.click()

    await expect(skill.options.root).toBeHidden()
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

    await expect(skill.installBadge).toHaveAccessibleName("Install mode: eject")
  })

  test("a cell badge flip is reflected back in the panel", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)

    await skill.flipScope()
    await skill.openOptions()

    await expect(skill.options.option("global")).toHaveAttribute(
      "aria-pressed",
      "true"
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

  test("unassigning updates the cell's agent count", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    // The count only shows on a selected skill, and the ••• no longer selects.
    await skill.toggle()
    await skill.openOptions()

    await expect(skill.agentCount).toHaveText("4 agents")
    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)
    await expect(skill.agentCount).toHaveText("3 agents")
  })

  // A web skill never reaches API on its own, so that cell starts empty and
  // assigning it is what switches the agent on in the roster.
  test("assigning an out-of-domain agent moves it into the roster", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    // The roster only carries a selected skill's assignments.
    await skill.toggle()
    await skill.openOptions()

    await expect(configure.roster.domainBand("api")).toContainText("0 of")
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

  // Meta is never auto-assigned, so the fold is the only path to it.
  test("assigning through the meta fold reaches the roster", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, SKILL)
    await skill.toggle()
    await skill.openOptions()
    await skill.options.root.getByRole("button", { name: "Meta" }).click()

    await expect(configure.roster.domainBand("meta")).toContainText("0 of")
    await skill.options.option("agent-summoner").click()

    await expect(configure.roster.domainBand("meta")).toContainText("1 of")
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
