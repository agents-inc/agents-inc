import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"
import { STORED_ID, stubCreateConfig } from "../support/sharing"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

test.describe("install dialog", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test.beforeEach(async ({ configure, page }) => {
    // Opening the dialog mints an id for the command, so the worker has to be
    // answering before the dialog is opened.
    await stubCreateConfig(page)
    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()
  })

  test("lists the selected skills", async ({ configure }) => {
    await expect(configure.installDialog.skillsPane).toContainText(
      STACK_MEMBER_SKILL
    )
  })

  test("groups skills by scope", async ({ configure }) => {
    await expect(configure.installDialog.skillsPane).toContainText("Global")
  })

  test("lists the sub-agents that will be written", async ({ configure }) => {
    await expect(configure.installDialog.agentsPane).toContainText("Agents")
    await expect(configure.installDialog.agentsPane).toContainText("developer")
  })

  test("shows both commands", async ({ configure }) => {
    await expect(
      configure.installDialog.command("cd ~/code/your-project")
    ).toBeVisible()
    await expect(
      configure.installDialog.command("npx agents-inc init")
    ).toBeVisible()
  })

  // The id is what carries this configuration to the CLI; without it the
  // command would start a fresh wizard and silently discard everything the
  // user just chose.
  test("appends the minted id to the init command", async ({ configure }) => {
    await expect(
      configure.installDialog.command(`npx agents-inc init --from ${STORED_ID}`)
    ).toBeVisible()
  })

  test("copies the full command, id included", async ({ configure, page }) => {
    await configure.installDialog.command("npx agents-inc init").click()

    await expect(configure.installDialog.root).toContainText("copied")

    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe(`npx agents-inc init --from ${STORED_ID}`)
  })

  // Copying is the only thing this dialog does, so it cannot be pointer-only:
  // the block takes focus and Enter reaches the same handler a click does.
  test("copies from the keyboard", async ({ configure, page }) => {
    await configure.installDialog.command("npx agents-inc init").focus()
    await page.keyboard.press("Enter")

    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe(`npx agents-inc init --from ${STORED_ID}`)
  })

  // Installing is a CLI action, so the only button is Close.
  test("offers no install action", async ({ configure }) => {
    await expect(
      configure.installDialog.root.getByRole("button", { name: /^Install$/ })
    ).toHaveCount(0)
  })

  test("closes on the footer button", async ({ configure }) => {
    await configure.installDialog.close()
    await expect(configure.installDialog.root).toBeHidden()
  })

  test("closes on Escape", async ({ configure, page }) => {
    await page.keyboard.press("Escape")
    await expect(configure.installDialog.root).toBeHidden()
  })
})

// The agents pane follows the derived on/off state, pins included.
test.describe("install dialog with pins", () => {
  test.beforeEach(async ({ page }) => {
    await stubCreateConfig(page)
  })

  test("a pinned bare agent is listed as a base agent", async ({
    configure,
  }) => {
    await configure.roster.agentButton("web", "developer").click()
    await configure.roster.installButton.click()

    await expect(configure.installDialog.agentsPane).toContainText(
      "web · developer"
    )
    await expect(configure.installDialog.agentsPane).toContainText(
      "no skills — base agent"
    )
  })

  test("a pinned-off agent is excluded from the agents pane", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.agentButton("web", "developer").click()
    await configure.roster.installButton.click()

    // Named in full: the roster fields a researcher in every other domain, so
    // the bare role could find one of those and pass on the wrong agent.
    // The positive assertion guards the negative one against a blank pane.
    await expect(configure.installDialog.agentsPane).toContainText(
      "web · researcher"
    )
    await expect(configure.installDialog.agentsPane).not.toContainText(
      "web · developer"
    )
  })
})

test.describe("install dialog counts", () => {
  test("the ejected count follows the cell badges", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)

    await configure.roster.installButton.click()
    await expect(configure.installDialog.footerNote).toContainText("0 ejected")
    await configure.installDialog.close()

    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()

    await configure.roster.installButton.click()
    await expect(configure.installDialog.footerNote).toContainText("1 ejected")
  })

  test("a skill set to project moves to the Project group", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipScope()

    await configure.roster.installButton.click()

    await expect(configure.installDialog.skillsPane).toContainText("Project")
  })
})
