import { MARKETPLACE_CANONICAL_REF } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  SINGLE_AGENT_SKILL,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"
import { stubMarketplaceCatalog } from "../support/marketplace"
import {
  OUT_OF_DATE,
  STORED_ID,
  STORE_UNAVAILABLE,
  stubCreateConfig,
  stubCreateConfigRefusal,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY

// The fixture marketplace, and one skill only it ships — so "the dialog names
// the loaded marketplace" is observable rather than a matter of counting.
// `ref` is what a visitor types; `stored` is what the app then holds and what
// the install command has to name — the form `--marketplace` reads as a
// repository rather than as a directory on the receiver's disk.
const ACME = {
  ref: "acme/skills",
  stored: MARKETPLACE_CANONICAL_REF,
  skill: "Acme Widgets",
} as const

test.describe("install dialog", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test.beforeEach(async ({ configure, page }) => {
    // Opening the dialog mints an id for the command, so the worker has to be
    // answering before the dialog is opened.
    stubCreateConfig(page)
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

// The SECOND door on `createSharedConfig` (SERVER-04), and it was never
// touched. Minting happens when this dialog OPENS, so a tab running a bundle
// from before the last deploy is refused here exactly as the Share button is —
// and the line under the command is the only surface that can say so. It said
// "id unavailable — this command starts a fresh wizard" for all three
// refusals, which told the one reader with a remedy nothing about it.
test.describe("install dialog when the id cannot be minted", () => {
  test("a stale page is told to reload", async ({ configure, page }) => {
    stubCreateConfigRefusal(page, OUT_OF_DATE)

    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "out of date — reload the page for an id"
    )
  })

  // The other two have no remedy, so the note says what the command on screen
  // will do instead — and must not send anyone to reload a page that is fine.
  test("a refused store says what the command will do instead", async ({
    configure,
    page,
  }) => {
    stubCreateConfigRefusal(page, STORE_UNAVAILABLE)

    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "id unavailable — this command starts a fresh wizard"
    )
    await expect(configure.installDialog.root).not.toContainText("out of date")
  })
})

// The agents pane follows the derived on/off state, pins included.
test.describe("install dialog with pins", () => {
  test.beforeEach(({ page }) => {
    stubCreateConfig(page)
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
  // Opening the dialog mints an id for the command, the same as it does above:
  // the counts these two read are painted beside a POST that has to be answered
  // here rather than by whatever is listening on the worker's port.
  test.beforeEach(({ page }) => {
    stubCreateConfig(page)
  })

  test("the ejected count follows the cell badges", async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)

    await configure.roster.installButton.click()
    await expect(configure.installDialog.footerNote).toContainText("0 ejected")
    await configure.installDialog.close()

    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()

    await configure.roster.installButton.click()
    await expect(configure.installDialog.footerNote).toContainText("1 ejected")
  })

  // Two clicks rather than one since EDITOR-08: a project-scoped skill on a
  // sub-agent resting at global blocks Install outright, so the sub-agent
  // carrying it has to move too. `SINGLE_AGENT_SKILL` is the stack's one skill
  // that reaches a single sub-agent, which is what keeps that to one extra
  // click instead of seven.
  test("a skill set to project moves to the Project group", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure
      .skillIn(web, SINGLE_AGENT_SKILL.category, SINGLE_AGENT_SKILL.name)
      .flipScope()
    await configure.roster.scopeControl(SINGLE_AGENT_SKILL.agentId).click()

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
  test.beforeEach(({ page }) => {
    stubCreateConfig(page)
    stubMarketplaceCatalog(page)
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
      `marketplace ${ACME.stored}`
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
  stubCreateConfig(page)
  await configure.roster.installButton.click()

  await expect(configure.installDialog.header).toContainText(
    "marketplace agents-inc/skills"
  )
})
