import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"
import { stubMarketplaceCatalog } from "../support/marketplace"
import { STORED_ID, stubCreateConfig } from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

// The fixture marketplace, and one skill only it ships — so "the dialog names
// the loaded marketplace" is observable rather than a matter of counting.
const ACME = { ref: "acme/skills", skill: "Acme Widgets" } as const

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

// EDITOR-44. The header used to write the literal `marketplace agents-inc`,
// so on a loaded marketplace this dialog named a repository the CLI is not
// about to install from — while the floating button behind it named the right
// one and the payload the command carries stamped the right one too.
//
// It names the SEATED marketplace, and that is the one of the three notions
// this surface has any business reading: the dialog describes what `--from`
// will install, `toSeedPayload` stamps the payload with `activeMarketplace()`,
// and a shared address can seat a marketplace this browser never chose.
test.describe("install dialog on a loaded marketplace", () => {
  test.beforeEach(async ({ page }) => {
    await stubCreateConfig(page)
    await stubMarketplaceCatalog(page)
  })

  const load = async (configure: ConfigurePage) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
  }

  test("names the marketplace the grid is running on", async ({
    configure,
  }) => {
    await load(configure)
    await configure.skill(ACME.skill).toggle()
    await configure.roster.installButton.click()

    await expect(configure.installDialog.header).toContainText(
      `marketplace ${ACME.ref}`
    )
  })

  test("does not name the public marketplace it is not installing from", async ({
    configure,
  }) => {
    await load(configure)
    await configure.skill(ACME.skill).toggle()
    await configure.roster.installButton.click()

    await expect(configure.installDialog.header).not.toContainText("agents-inc")
  })

  // The button is the only other place on screen that answers "which catalogue
  // am I looking at?", and the two disagreeing is the whole of this row. Read
  // before the dialog opens, because a modal makes everything under it
  // `aria-hidden` and the button is then unreachable by role.
  test("agrees with the floating button it opens over", async ({
    configure,
  }) => {
    await load(configure)
    await expect(configure.marketplaceButton).toContainText(ACME.ref)

    await configure.roster.installButton.click()

    await expect(configure.installDialog.header).toContainText(ACME.ref)
  })
})

// The public catalogue is a marketplace like any other, and this is its name.
test("the install dialog names the public marketplace when none is loaded", async ({
  configure,
  page,
}) => {
  await stubCreateConfig(page)
  await configure.roster.installButton.click()

  await expect(configure.installDialog.header).toContainText(
    "marketplace agents-inc/skills"
  )
})
