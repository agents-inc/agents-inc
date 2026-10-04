import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
} from "@workspace/api-mocks/fixtures"

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
// repository rather than as a directory on the receiver's disk. Both come from
// the fixture as a PAIR, because `stored` is the canonical form of `ref` and
// the header assertion reads one after the spec typed the other: a typed ref
// and a bound canonical one could drift apart, and the spec would then assert
// a marketplace it never loaded. The skill's name stays written out — it is
// text the grid renders.
const ACME = {
  ref: MARKETPLACE_REF,
  stored: MARKETPLACE_CANONICAL_REF,
  skill: "Acme Widgets",
} as const

/**
 * How many lines an element's text is laid out on: the distinct tops of the
 * boxes its words were broken into. Runs in the page.
 */
const linesOf = (element: HTMLElement) => {
  const words = document.createRange()
  words.selectNodeContents(element)
  const tops = [...words.getClientRects()].map((line) => Math.round(line.top))
  return new Set(tops).size
}

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

  // A command is read and typed as a whole, so it does not break across lines:
  // wrapped, `edit` sat on a line of its own and the footer read as naming
  // `npx agents-inc`. Counted as the distinct lines its text is laid out on.
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

  /**
   * D11. Step 2 has named `agents/config.ts` since 2026-08-04 — a path the
   * installer writes nowhere, under a directory that does not exist at either
   * root. Nothing here pinned the sentence, which is the whole reason it stood:
   * every other assertion in this file is about the panes or the command.
   *
   * What the installer writes is the config pair, in the source folder, and
   * `apps/www`'s `editor/install-and-share.md` has said so all along.
   *
   * The string is written out rather than imported, the rule this suite follows
   * everywhere: an assertion reading the constant the product renders moves with
   * it and can never fail. And the wrong path is pinned as an ABSENCE beside it,
   * because a sentence naming both would satisfy the first assertion alone.
   */
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
    await configure.roster.setScope(SINGLE_AGENT_SKILL.agentId, "project")

    await configure.roster.installButton.click()

    await expect(configure.installDialog.skillsPane).toContainText("Project")
  })

  // One skill is one skill. The Install button that opens this dialog already
  // says so; the footer under it said `1 skills`.
  test("counts a single skill in the singular", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await configure.roster.installButton.click()

    await expect(configure.installDialog.footerNote).toContainText("1 skill ·")
  })

  // A pinned sub-agent with nothing selected is an install of exactly one.
  test("counts a single sub-agent in the singular", async ({ configure }) => {
    await configure.roster.agentButton("web", "developer").click()

    await configure.roster.installButton.click()

    await expect(configure.installDialog.footerNote).toContainText(
      "1 sub-agent ·"
    )
  })
})

/**
 * WHERE STEP 2 SAYS AN EJECTED SKILL IS COPIED, which is a fact about its
 * scope. It said `ejects N skills into .claude/skills/` for every
 * configuration, so a global skill — and every skill rests at global — was
 * sent to the project's folder while the CLI copies it under the home
 * directory, the very next sentence said global skills land in `~/.claude`,
 * and one skill read as `1 skills`.
 *
 * The strings are written out for the reason the config-file pin above gives,
 * and every folder named is pinned beside the one it must not be: `.claude/`
 * is a substring of `~/.claude/`, so each assertion carries the word before
 * the path.
 */
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

  // Both scopes at once, each with its own folder and its own count. The
  // project skill is `SINGLE_AGENT_SKILL` for the reason the Project-group test
  // above gives: its one sub-agent moving too is what lets Install open.
  test("names each scope's folder when both eject", async ({ configure }) => {
    const projectSkill = configure.skillIn(
      web,
      SINGLE_AGENT_SKILL.category,
      SINGLE_AGENT_SKILL.name
    )
    await projectSkill.setInstallMode("eject")
    await projectSkill.setScope("project")
    await configure.roster.setScope(SINGLE_AGENT_SKILL.agentId, "project")
    await configure.skillIn(web, CATEGORY, STACK_MEMBER_SKILL).flipInstall()

    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "ejects 1 skill into .claude/skills/ and 1 skill into ~/.claude/skills/"
    )
  })

  // Nothing ejected is nothing copied, so no folder is named — the step used
  // to promise `0 skills into .claude/skills/`, a folder nothing is written to.
  // The positive first, because "names no folder" is satisfied by a step that
  // is not drawn at all.
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
