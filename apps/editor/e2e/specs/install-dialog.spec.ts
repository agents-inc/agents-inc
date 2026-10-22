import { TOO_MANY } from "@workspace/api-mocks"
import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  SINGLE_AGENT_SKILL,
  STACKS,
  STACK_MEMBER_SKILL,
} from "../support/catalog"
import { stubMarketplaceCatalog } from "../support/marketplace"
import {
  OUT_OF_DATE,
  STORED_ID,
  STORE_UNAVAILABLE,
  captureCreateConfig,
  holdCreateConfig,
  stubCreateConfig,
  stubCreateConfigRefusal,
  stubCreateConfigRefusalOnce,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY
const { name: STYLING, first: TAILWIND } = MULTI_CATEGORY

// Written out: a payload names skills by id.
const REACT_ID = "web-framework-react"
const TAILWIND_ID = "web-styling-tailwind"

// `ref` is typed; `stored` is what the install command must name.
const ACME = {
  ref: MARKETPLACE_REF,
  stored: MARKETPLACE_CANONICAL_REF,
  skill: "Acme Widgets",
} as const

/** Distinct tops of the boxes its words were broken into. Runs in the page. */
const linesOf = (element: HTMLElement) => {
  const words = document.createRange()
  words.selectNodeContents(element)
  const tops = [...words.getClientRects()].map((line) => Math.round(line.top))
  return new Set(tops).size
}

test.describe("install dialog", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test.beforeEach(async ({ configure, page }) => {
    // Opening mints an id, so the worker must answer first.
    stubCreateConfig(page)
    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()
  })

  // Wrapped, `edit` sits alone and the footer reads as naming `npx agents-inc`.
  test("keeps the footer's edit command on one line", async ({ configure }) => {
    const lines = await configure.installDialog.footerCommand.evaluate(linesOf)

    expect(lines).toBe(1)
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

  test("names the config file the installer actually writes", async ({
    configure,
  }) => {
    await expect(configure.installDialog.root).toContainText(
      ".agents-inc/claude/config.ts"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "agents/config.ts"
    )
  })

  test("shows both commands", async ({ configure }) => {
    await expect(
      configure.installDialog.command("cd ~/code/your-project")
    ).toBeVisible()
    await expect(
      configure.installDialog.command("npx agents-inc init")
    ).toBeVisible()
  })

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

  // The block takes focus, and Enter reaches the click handler.
  test("copies from the keyboard", async ({ configure, page }) => {
    await configure.installDialog.command("npx agents-inc init").focus()
    await page.keyboard.press("Enter")

    const clipboard = await page.evaluate(() => navigator.clipboard.readText())
    expect(clipboard).toBe(`npx agents-inc init --from ${STORED_ID}`)
  })

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

// Minting happens on open, so this dialog meets every share refusal too.
test.describe("install dialog when the id cannot be minted", () => {
  test("a stale page is told to reload", async ({ configure, page }) => {
    stubCreateConfigRefusal(page, OUT_OF_DATE)

    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "out of date — reload the page for an id"
    )
  })

  // No remedy for these, so the note must not send anyone to reload.
  test("a refused store says what the command will do instead", async ({
    configure,
    page,
  }) => {
    stubCreateConfigRefusal(page, STORE_UNAVAILABLE)

    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "id unavailable — this command starts over in the editor"
    )
    await expect(configure.installDialog.root).not.toContainText("out of date")
  })

  // Opening on a new selection mints, so the dialog meets the write limit too.
  test("a rate-limited mint says when to try again", async ({
    configure,
    page,
  }) => {
    stubCreateConfigRefusal(page, TOO_MANY)

    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "rate limit reached — try again in 1 minute"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "id unavailable"
    )
  })
})

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

    // Named in full: every domain has a researcher. The positive guards the
    // negative against a blank pane.
    await expect(configure.installDialog.agentsPane).toContainText(
      "web · researcher"
    )
    await expect(configure.installDialog.agentsPane).not.toContainText(
      "web · developer"
    )
  })
})

test.describe("install dialog counts", () => {
  // Opening mints an id, so the POST must be answered here.
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

  // A project skill on a global sub-agent blocks Install, so the sub-agent
  // moves too.
  test("a skill set to project moves to the Project group", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure
      .skillIn(web, SINGLE_AGENT_SKILL.category, SINGLE_AGENT_SKILL.name)
      .flipScope()
    await configure.subAgents.setScope(SINGLE_AGENT_SKILL.agentId, "project")

    await configure.roster.installButton.click()

    await expect(configure.installDialog.skillsPane).toContainText("Project")
  })

  test("counts a single skill in the singular", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await configure.roster.installButton.click()

    await expect(configure.installDialog.footerNote).toContainText("1 skill ·")
  })

  test("counts a single sub-agent in the singular", async ({ configure }) => {
    await configure.roster.agentButton("web", "developer").click()

    await configure.roster.installButton.click()

    await expect(configure.installDialog.footerNote).toContainText(
      "1 sub-agent ·"
    )
  })
})

test.describe("install dialog, where ejected skills go", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubCreateConfig(page)
    await configure.chooseStack(STACKS.nextjs)
  })

  test("counts one ejected skill in the singular", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()

    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "ejects 1 skill into"
    )
  })

  test("names the home folder for a global skill", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()

    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "into ~/.claude/skills/"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "into .claude/skills/"
    )
  })

  // `SINGLE_AGENT_SKILL`, as above, so only its one sub-agent has to move.
  test("names each scope's folder when both eject", async ({ configure }) => {
    const projectSkill = configure.skillIn(
      web,
      SINGLE_AGENT_SKILL.category,
      SINGLE_AGENT_SKILL.name
    )
    await projectSkill.setInstallMode("eject")
    await projectSkill.setScope("project")
    await configure.subAgents.setScope(SINGLE_AGENT_SKILL.agentId, "project")
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()

    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "ejects 1 skill into .claude/skills/ and 1 skill into ~/.claude/skills/"
    )
  })

  // The positive first: "names no folder" passes on a step that is not drawn.
  test("names no skills folder when nothing is ejected", async ({
    configure,
  }) => {
    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText("ejects no skills")
    await expect(configure.installDialog.root).not.toContainText(
      ".claude/skills/"
    )
  })
})

// The header names the seated marketplace, which the CLI installs from.
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

  // Read before opening: the modal makes everything under it `aria-hidden`.
  test("agrees with the floating button it opens over", async ({
    configure,
  }) => {
    await load(configure)
    await expect(configure.marketplaceButton).toContainText(ACME.ref)

    await configure.roster.installButton.click()

    await expect(configure.installDialog.header).toContainText(ACME.ref)
  })
})

// The dialog stays mounted, so a reopening finds the last answer.
test.describe("install dialog, opened again", () => {
  const MINTED_COMMAND = `npx agents-inc init --from ${STORED_ID}`

  const skillsPosted = (posted: Record<string, unknown>[]) =>
    posted.map((body) => Object.keys(body.skills as object).sort())

  const reopen = async (configure: ConfigurePage) => {
    await configure.installDialog.close()
    await configure.roster.installButton.click()
  }

  test("keeps the id it minted while the selection is unchanged", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.installButton.click()
    await expect(configure.installDialog.command(MINTED_COMMAND)).toBeVisible()

    await reopen(configure)
    await expect(configure.installDialog.command(MINTED_COMMAND)).toBeVisible()

    // The channel: a changed selection posts, after anything the reopening
    // sent.
    await configure.installDialog.close()
    await configure.skillIn(web, STYLING, TAILWIND).toggle()
    await configure.roster.installButton.click()
    await expect
      .poll(() => skillsPosted(posted).some((ids) => ids.includes(TAILWIND_ID)))
      .toBe(true)

    expect(skillsPosted(posted)).toStrictEqual([
      [REACT_ID],
      [REACT_ID, TAILWIND_ID],
    ])
  })

  for (const [label, status, said] of [
    ["a refusal", STORE_UNAVAILABLE, "id unavailable"],
    ["the rate limit", TOO_MANY, "rate limit reached"],
  ] as const) {
    test(`asks again after ${label}`, async ({ configure, page }) => {
      stubCreateConfig(page)
      stubCreateConfigRefusalOnce(page, status)
      await configure.skillIn(web, CATEGORY, REACT).toggle()
      await configure.roster.installButton.click()
      await expect(configure.installDialog.root).toContainText(said)

      await reopen(configure)

      await expect(
        configure.installDialog.command(MINTED_COMMAND)
      ).toBeVisible()
    })
  }

  test("says nothing of a refusal an earlier opening met", async ({
    configure,
    page,
  }) => {
    stubCreateConfig(page)
    const release = holdCreateConfig(page)
    stubCreateConfigRefusalOnce(page, STORE_UNAVAILABLE)
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toContainText("id unavailable")

    await reopen(configure)

    await expect(configure.installDialog.root).toContainText(
      "preparing your id"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "id unavailable"
    )
    release()
    await expect(configure.installDialog.command(MINTED_COMMAND)).toBeVisible()
  })
})

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
