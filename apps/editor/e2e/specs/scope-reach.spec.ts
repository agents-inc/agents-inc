import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stubSignedIn } from "../support/auth"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  OUT_OF_SCOPE_IMPORT_ID,
  OUT_OF_SCOPE_PAYLOAD,
  STORED_ID,
  captureCreateConfig,
  stubCreateConfig,
  stubGetConfig,
} from "../support/sharing"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

const DEVELOPER = "web-developer"
const MATRIX_DOMAIN = "API"
const MATRIX_ROLE = "dev"

const REACT_ID = "web-framework-react"

// Written out rather than imported, so a rewording has to be said here too.
const SCOPE_ERROR = "This sub-agent must be set to project scope too"
const SAVE_SCOPE_CONFLICT = "Scope conflict — fix marked rows"

// The action row's label inset (`px-1.5` at the root's 110%).
const MIN_LABEL_INSET_PX = 6

/**
 * How the Install button's words sit in it: how far they run past its box, and
 * the air between them and each side. Runs in the page.
 */
const fitOfLabel = (button: HTMLElement) => {
  const words = document.createRange()
  words.selectNodeContents(button)
  const text = words.getBoundingClientRect()
  const box = button.getBoundingClientRect()

  return {
    overflow: button.scrollWidth - button.clientWidth,
    left: Math.round(text.left - box.left),
    right: Math.round(box.right - text.right),
  }
}

// A global sub-agent cannot carry a project skill: an error to resolve, never a
// selection refused.
test.describe("a project skill on a global sub-agent", () => {
  test("marks the roster row and says what to do", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()

    await expect(configure.roster.skillRow(REACT, DEVELOPER)).toBeVisible()
    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()

    await skill.flipScope()

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeVisible()
    await expect(
      configure.roster.scopeError(REACT, DEVELOPER)
    ).toHaveAccessibleName(SCOPE_ERROR)
  })

  test("leaves the sub-agent on and the counts honest", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    const assigned = await configure.roster.skillRowsFor(REACT).count()

    await skill.flipScope()

    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.skillRowsFor(REACT)).toHaveCount(assigned)
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

    await expect(configure.roster.installButton).toContainText(
      /\d+ sub-agents need project scope/
    )
  })

  test("blocks Share too", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await expect(configure.roster.shareButton).toBeEnabled()

    await skill.flipScope()

    await expect(configure.roster.shareButton).toBeDisabled()
  })

  test("mints nothing while it is blocked", async ({ configure, page }) => {
    const posted = captureCreateConfig(page)
    const skill = configure.skillIn(web, CATEGORY, REACT)

    await skill.toggle()
    await skill.flipScope()
    await configure.roster.shareButton.click({ force: true })

    await expect(configure.roster.installButton).toBeDisabled()
    expect(posted).toStrictEqual([])
  })

  test("mints once nothing is blocking it", async ({ configure, page }) => {
    const posted = captureCreateConfig(page)
    const skill = configure.skillIn(web, CATEGORY, REACT)

    await skill.toggle()
    await configure.roster.shareButton.click()

    await expect.poll(() => posted.length).toBe(1)
    const [body] = posted
    expect(body).toBeDefined()
    expect(body!.skills).toHaveProperty(REACT_ID)
  })

  test("leaves Save alone", async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()

    await skill.flipScope()

    await expect(configure.roster.saveButton).toBeEnabled()
  })

  test("one click on the sub-agent's scope resolves it", async ({
    configure,
  }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.flipScope()
    await expect(configure.roster.installButton).toBeDisabled()

    await configure.subAgents.setScope(DEVELOPER, "project")

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()
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

// The refusal is the label, so it has to be readable inside the button.
test.describe("the blocked Install button", () => {
  test.beforeEach(async ({ configure }) => {
    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.flipScope()
    await expect(configure.roster.installButton).toBeDisabled()
    await expect(configure.roster.installButton).toContainText(
      /\d+ sub-agents need project scope/
    )
  })

  test("keeps its words inside it, clear of its edges", async ({
    configure,
  }) => {
    const fit = await configure.roster.installButton.evaluate(fitOfLabel)

    expect(fit.overflow).toBe(0)
    expect(fit.left).toBeGreaterThanOrEqual(MIN_LABEL_INSET_PX)
    expect(fit.right).toBeGreaterThanOrEqual(MIN_LABEL_INSET_PX)
  })
})

// Nothing shared is dropped: the pair lands marked, with Install blocked.
test.describe("a shared link holding the pair", () => {
  test.beforeEach(({ page }) => {
    stubGetConfig(page, OUT_OF_SCOPE_IMPORT_ID, OUT_OF_SCOPE_PAYLOAD)
    stubCreateConfig(page)
  })

  test("applies the skill and marks the row", async ({ configure, page }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)

    await expect(configure.skill(REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeVisible()
  })

  test("keeps the notice to what the shared address said", async ({
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

  test("resolves in one click from the marked row", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${OUT_OF_SCOPE_IMPORT_ID}`)
    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeVisible()

    await configure.subAgents.setScope(DEVELOPER, "project")

    await expect(configure.roster.scopeError(REACT, DEVELOPER)).toBeHidden()
    await expect(configure.roster.installButton).toBeEnabled()
  })
})

// Save is the one door left open. Signed in it mints, and `createSharedConfig`
// refuses the pair first.
test.describe("a signed-in save of the pair", () => {
  test("refuses it before the POST, and says so in the dialog", async ({
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const { created } = stubSignedIn(page)
    const configure = new ConfigurePage(page)
    await configure.goto()
    const dialog = configure.saveStackDialog

    const skill = configure.skillIn(web, CATEGORY, REACT)
    await skill.toggle()
    await skill.flipScope()
    await configure.roster.saveButton.click()
    await dialog.fill("Weekday")
    await dialog.save()

    await expect(dialog.alert).toHaveText(SAVE_SCOPE_CONFLICT)
    await expect(dialog.nameInput).toHaveValue("Weekday")
    // Both logs: no mint, and no row pointing at nothing.
    expect(posted).toStrictEqual([])
    expect(created).toStrictEqual([])
  })

  // The permitted case, one `flipScope` apart: the same channels carry values.
  test("mints and stores an ordinary configuration under its name", async ({
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const { created } = stubSignedIn(page)
    const configure = new ConfigurePage(page)
    await configure.goto()

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.saveButton.click()
    await configure.saveStackDialog.saveAs("Weekday")

    await expect.poll(() => created).toHaveLength(1)
    expect(posted).toHaveLength(1)

    const [body] = posted
    expect(body).toBeDefined()
    expect(body!.skills).toHaveProperty(REACT_ID)

    expect(created).toStrictEqual([{ name: "Weekday", configId: STORED_ID }])
  })
})
