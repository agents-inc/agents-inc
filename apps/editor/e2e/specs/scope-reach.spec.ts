import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  OUT_OF_SCOPE_IMPORT_ID,
  OUT_OF_SCOPE_PAYLOAD,
  captureCreateConfig,
  stubCreateConfig,
  stubGetConfig,
} from "../support/sharing"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

const DEVELOPER = "web-developer"
const MATRIX_DOMAIN = "API"
const MATRIX_ROLE = "dev"

// The marker's own words, written out rather than imported from the app — a
// spec that agrees with a rewording has to be rewritten to say so.
const SCOPE_ERROR = "This sub-agent must be set to project scope too"

// EDITOR-08. A global sub-agent's front-matter is written to `~/.claude`, where
// every project on the machine sees it; a project-scoped skill is installed
// under one project's `.claude`. So a global agent carrying a project skill
// names something that does not exist from anywhere else — and the CLI's own
// `init --from` throws on a payload holding one rather than installing a
// quieter configuration than the one that was shared.
//
// It is an ERROR to resolve, not an action to prevent: the assignment is made,
// the scope moves, nothing is dropped — and Install and Share are blocked until
// the user fixes it, which takes one click on the sub-agent's own scope word.

test.describe("a project skill on a global sub-agent", () => {
  test("marks the roster row and says what to do", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()

    // The control: the row is unmarked before the scope moves.
    await expect(configure.roster.skillRow(REACT, DEVELOPER)).toBeVisible()
    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()

    await skill.flipScope()

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeVisible()
    await expect(
      configure.roster.scopeError(REACT, DEVELOPER)
    ).toHaveAccessibleName(SCOPE_ERROR)
  })

  // The sub-agent is on, and that is load-bearing rather than incidental: it
  // holds a skill, which is exactly why the pair is a problem — and its scope
  // word has to read as a live control, because it is the one-click fix.
  test("leaves the sub-agent on and the counts honest", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    const assigned = await skill.agentCount.textContent()

    await skill.flipScope()

    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "true")
    await expect(skill.agentCount).toHaveText(assigned ?? "")
  })

  test("blocks Install and says how many sub-agents to change", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await expect(configure.roster.installButton).toBeEnabled()

    await skill.flipScope()

    await expect(configure.roster.installButton).toBeDisabled()
    await expect(configure.roster.installButton).toContainText("project scope")
  })

  test("counts the sub-agents to change, not the assignments", async ({
    configure,
  }) => {
    const react = configure.skillIn(web, CATEGORY, REACT)
    await react.toggle()
    await react.flipScope()

    // React reaches several sub-agents, so the number is plural and reads as
    // the count of CLICKS it takes to resolve.
    await expect(configure.roster.installButton).toContainText(
      /\d+ sub-agents need project scope/
    )
  })

  // One rule, both doors: a link minted from here would be one `init --from`
  // refuses outright, and that failure lands on the recipient.
  test("blocks Share too", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await expect(configure.roster.shareButton).toBeEnabled()

    await skill.flipScope()

    await expect(configure.roster.shareButton).toBeDisabled()
  })

  test("mints nothing while it is blocked", async ({ configure, page }) => {
    const posted = await captureCreateConfig(page)
    const skill = configure.skillIn(web, CATEGORY, REACT)

    await skill.toggle()
    await skill.flipScope()
    await configure.roster.shareButton.click({ force: true })

    await expect(configure.roster.installButton).toBeDisabled()
    expect(posted).toStrictEqual([])
  })

  // Save is the local snapshot, not an export — it never reaches the worker and
  // never reaches the CLI, so parking a half-finished configuration stays
  // possible. Blocking it would leave nowhere to put work in progress.
  test("leaves Save alone", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()

    await skill.flipScope()

    await expect(configure.roster.saveButton).toBeEnabled()
  })

  // The owner's flow, end to end: see the marker, click the sub-agent's scope
  // word, install.
  test("one click on the sub-agent's scope resolves it", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.flipScope()
    await expect(configure.roster.installButton).toBeDisabled()

    await configure.roster.scopeControl(DEVELOPER).click()

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()
    // The other sub-agents React reaches are still global, so one click fixes
    // one row — and the button stays blocked until the last of them is done.
    await expect(configure.roster.installButton).toBeDisabled()
    await expect(configure.roster.installButton).toContainText("project scope")
  })

  test("setting the skill back to global resolves every row at once", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.flipScope()
    await expect(configure.roster.installButton).toBeDisabled()

    await skill.flipScope()

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()
    await expect(configure.roster.installButton).toBeEnabled()
    await expect(configure.roster.shareButton).toBeEnabled()
  })

  // Assigning is not refused. A user pointing the ••• panel at a sub-agent is
  // asking for a configuration, and the answer is the row plus the marker
  // beside it — not a click that silently does nothing.
  test("assigning from the options panel is allowed, and marked", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.openOptions()
    await skill.options.choose("project")

    await skill.options.cycleAssignment(MATRIX_DOMAIN, MATRIX_ROLE)

    await expect(
      skill.options.matrixCell(MATRIX_DOMAIN, MATRIX_ROLE)
    ).toHaveText("lazy")
    await expect(
      configure.roster.scopeError(REACT, "api-developer")
    ).toBeVisible()
  })
})

// The other door the pair arrives through. Nothing is dropped — silently losing
// assignments somebody SHARED is the outcome the ruling forbids — so it lands
// in the error state with Install blocked, and the line above the grid says
// what to do about it.
test.describe("a shared link holding the pair", () => {
  test.beforeEach(async ({ page }) => {
    await stubGetConfig(page, OUT_OF_SCOPE_IMPORT_ID, OUT_OF_SCOPE_PAYLOAD)
    await stubCreateConfig(page)
  })

  test("applies the skill and marks the row", async ({ configure, page }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)

    await expect(configure.skill(REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeVisible()
  })

  test("says what must be done, above the grid", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)

    await expect(configure.importNotice).toContainText("project scope")
    await expect(configure.importNotice).toContainText("Sub-agents")
  })

  // The line is an explanation, not a substitute for what the address already
  // had to say about itself.
  test("keeps what the shared address already said", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)

    await expect(configure.importNotice).toContainText("shared configuration")
  })

  test("arrives with Install and Share blocked", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)
    await expect(configure.skill(REACT).root).toBeVisible()

    await expect(configure.roster.installButton).toBeDisabled()
    await expect(configure.roster.shareButton).toBeDisabled()
  })

  test("resolves in one click from the row the notice points at", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)
    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeVisible()

    await configure.roster.scopeControl(DEVELOPER).click()

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()
    await expect(configure.roster.installButton).toBeEnabled()
    await expect(configure.importNotice).not.toContainText("project scope")
  })
})
