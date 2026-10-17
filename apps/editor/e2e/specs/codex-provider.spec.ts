import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  SINGLE_AGENT_SKILL,
  STACKS,
} from "../support/catalog"
import {
  OUT_OF_DATE,
  STORED_ID,
  captureCreateConfigBodies,
  stubCreateConfig,
  stubCreateConfigRefusal,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"
import type { Locator, Page } from "@playwright/test"

// Measured on the pinned @openai/codex@0.155.1: no plugin+project, the two
// summoners left out, and the provider never in the payload. Copy is mirrored,
// never imported.

const { web } = DOMAINS
const { name: FRAMEWORK, first: REACT, second: VUE } = EXCLUSIVE_CATEGORY

const REACT_ID = "web-framework-react"

const CLAUDE_COMMAND = `npx agents-inc init --from ${STORED_ID}`
const CODEX_COMMAND = `${CLAUDE_COMMAND} --provider codex`
// `--provider` without `--from` exits INVALID_ARGS, so the fallback stays bare.
const BARE_COMMAND = "npx agents-inc init"
const PROVIDER_FLAG = "--provider"

const CLAUDE_LINE = "plugins at project or global scope"
const CODEX_LINE = "plugins install globally only"

const CODEX_OFFERED_CELLS = [
  "plugin+global",
  "eject+global",
  "eject+project",
] as const
const CODEX_REFUSED_CELL = "plugin+project"

const CODEX_ERROR_LEAD = "Codex has no project-level plugins."

// As the roster draws them: lowercased, the uppercasing is CSS.
const AGENTS_NOT_ON_CODEX = ["agent summoner", "skill summoner"] as const
// Same band, compiled on Codex: the control for the two above.
const AGENT_ON_CODEX = "reviewer"

const withSelection = async (configure: ConfigurePage) => {
  await configure.chooseStack(STACKS.nextjs)
  await configure.roster.root.waitFor()
}

// A selected plugin+project skill, checked unmarked on Claude: every such
// test's Claude control.
const withAProjectScopedPluginSkill = async (configure: ConfigurePage) => {
  await withSelection(configure)

  const skill = configure.skillIn(
    web,
    SINGLE_AGENT_SKILL.category,
    SINGLE_AGENT_SKILL.name
  )
  await skill.flipScope()
  await expect(skill.scope).toHaveText("project")
  await expect(skill.errorMark).toHaveCount(0)

  return skill
}

// The same, installable on Claude: its one sub-agent moves to project too, or
// the scope rule blocks Install.
const withAnInstallableProjectScopedPluginSkill = async (
  configure: ConfigurePage
) => {
  const skill = await withAProjectScopedPluginSkill(configure)
  await configure.subAgents.setScope(SINGLE_AGENT_SKILL.agentId, "project")
  await expect(configure.roster.installButton).toBeEnabled()

  return skill
}

const switchedWithAProjectScopedPluginSkill = async (
  configure: ConfigurePage
) => {
  const skill = await withAProjectScopedPluginSkill(configure)
  await configure.provider.choose("codex")
  return skill
}

const switchedWithAnInstallableProjectScopedPluginSkill = async (
  configure: ConfigurePage
) => {
  const skill = await withAnInstallableProjectScopedPluginSkill(configure)
  await configure.provider.choose("codex")
  return skill
}

const paintOf = (target: Locator) =>
  target.evaluate((node) => {
    const style = getComputedStyle(node)
    return {
      color: style.color,
      background: style.backgroundColor,
      border: style.borderColor,
      shadow: style.boxShadow,
      cursor: style.cursor,
    }
  })

const rootFontSize = (page: Page) =>
  page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).fontSize)
  )

const storedSkills = async (configure: ConfigurePage) =>
  JSON.stringify(
    (
      JSON.parse(await configure.storedConfig()) as {
        state: { skills: unknown }
      }
    ).state.skills
  )

test.describe("the provider step", () => {
  test("sits in the main column", async ({ configure }) => {
    await expect(configure.provider.root).toBeVisible()
  })

  test("names each provider with what it installs", async ({ configure }) => {
    await expect(configure.provider.option("claude")).toContainText(
      "Claude Code"
    )
    await expect(configure.provider.option("claude")).toContainText(CLAUDE_LINE)
    await expect(configure.provider.option("codex")).toContainText(CODEX_LINE)
  })

  test("is two cards", async ({ configure }) => {
    await expect(configure.provider.cards).toHaveCount(2)
  })

  test("draws each card a stack card's width", async ({ configure }) => {
    await expect(configure.provider.cards).toHaveCount(2)
    const card = (await configure.provider.cards.first().boundingBox())!
    const stack = (await configure.stackCell(0).boundingBox())!

    expect(card.width).toBeCloseTo(stack.width, 0)
  })

  test("sits above the stacks, on their left edge", async ({ configure }) => {
    await expect(configure.provider.root).toBeVisible()
    const provider = (await configure.provider.root.boundingBox())!
    const stacks = (await configure.stacks.boundingBox())!

    expect(provider.y + provider.height).toBeLessThanOrEqual(stacks.y)
    expect(provider.x).toBeCloseTo(stacks.x, 0)
  })

  test("draws each card's line on its ::after", async ({ configure }) => {
    await expect(configure.provider.cards).toHaveCount(2)

    const content = await configure.provider.cards
      .first()
      .evaluate((cell) => getComputedStyle(cell, "::after").content)
    expect(content).not.toBe("none")
  })

  test("folds away under its title", async ({ configure }) => {
    await expect(configure.provider.root).toBeVisible()

    await configure.stepTitle("choose your provider").click()

    await expect(configure.provider.root).toHaveCount(0)
  })
})

test.describe("the provider control", () => {
  test("rests on Claude before anybody chooses", async ({ configure }) => {
    await expect(configure.provider.chosen).toHaveText(/claude/i)
  })

  test("offers Codex as the alternative rather than as a second switch", async ({
    configure,
  }) => {
    await expect(configure.provider.option("codex")).toHaveAttribute(
      "aria-checked",
      "false"
    )
    await expect(configure.provider.chosen).toHaveCount(1)
  })

  test("moves to Codex when Codex is pressed", async ({ configure }) => {
    await configure.provider.choose("codex")

    await expect(configure.provider.chosen).toHaveText(/codex/i)
  })

  test("moves back to Claude", async ({ configure }) => {
    await configure.provider.choose("codex")
    await configure.provider.choose("claude")

    await expect(configure.provider.chosen).toHaveText(/claude/i)
  })

  test("changes with the arrow keys once it has focus", async ({
    configure,
    page,
  }) => {
    await configure.provider.option("claude").focus()
    await page.keyboard.press("ArrowRight")

    await expect(configure.provider.chosen).toHaveText(/codex/i)
  })

  test("is one tab stop, on the chosen card", async ({ configure }) => {
    await expect(configure.provider.option("claude")).toHaveAttribute(
      "tabindex",
      "0"
    )
    await expect(configure.provider.option("codex")).toHaveAttribute(
      "tabindex",
      "-1"
    )

    await configure.provider.choose("codex")

    await expect(configure.provider.option("codex")).toHaveAttribute(
      "tabindex",
      "0"
    )
    await expect(configure.provider.option("claude")).toHaveAttribute(
      "tabindex",
      "-1"
    )
  })

  test("chooses with Enter and Space", async ({ configure, page }) => {
    await configure.provider.option("codex").focus()
    await page.keyboard.press("Enter")
    await expect(configure.provider.chosen).toHaveText(/codex/i)

    await configure.provider.option("claude").focus()
    await page.keyboard.press(" ")
    await expect(configure.provider.chosen).toHaveText(/claude/i)
  })
})

test.describe("the command the app prints", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test.beforeEach(async ({ configure, page }) => {
    // Opening the dialog mints an id.
    stubCreateConfig(page)
    await withSelection(configure)
  })

  test("carries no provider flag on Claude", async ({ configure }) => {
    await configure.roster.installButton.click()

    await expect(configure.installDialog.command(CLAUDE_COMMAND)).toBeVisible()
    await expect(configure.installDialog.root).not.toContainText(PROVIDER_FLAG)
  })

  test("names Codex once Codex is chosen", async ({ configure }) => {
    await configure.provider.choose("codex")
    await configure.roster.installButton.click()

    await expect(configure.installDialog.command(CODEX_COMMAND)).toBeVisible()
  })

  test("copies the whole command, provider flag and all", async ({
    configure,
    page,
  }) => {
    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
    await configure.installDialog.command(BARE_COMMAND).click()

    await expect(configure.installDialog.root).toContainText("copied")
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      CODEX_COMMAND
    )
  })

  test("drops the flag again when the choice goes back to Claude", async ({
    configure,
  }) => {
    await configure.provider.choose("codex")
    await configure.provider.choose("claude")
    await configure.roster.installButton.click()

    await expect(configure.installDialog.command(CLAUDE_COMMAND)).toBeVisible()
    await expect(configure.installDialog.root).not.toContainText(PROVIDER_FLAG)
  })
})

test.describe("the command when no id could be minted", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubCreateConfigRefusal(page, OUT_OF_DATE)
    await withSelection(configure)
    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
  })

  test("stays bare rather than carrying a flag the CLI would refuse", async ({
    configure,
  }) => {
    // The whole text: `command()` matches by `hasText`, which a flagged
    // command satisfies too.
    await expect(configure.installDialog.command(BARE_COMMAND)).toHaveText(
      BARE_COMMAND
    )
    await expect(configure.installDialog.root).not.toContainText(
      `${PROVIDER_FLAG} codex`
    )
  })

  test("says that the provider needs the id", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText("--from")
  })
})

// The dialog's folder names are hand-copied strings (install-dialog.tsx keeps
// `@workspace/compile` off the first-paint path), so this suite is what moves
// them.
test.describe("what the install dialog says a Codex install writes", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubCreateConfig(page)
    await withSelection(configure)
    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
  })

  test("names the Codex config pair rather than the Claude one", async ({
    configure,
  }) => {
    await expect(configure.installDialog.root).toContainText(
      ".agents-inc/codex/config.ts"
    )
    await expect(configure.installDialog.root).not.toContainText(
      ".agents-inc/claude/config.ts"
    )
  })

  // A project skill on Codex lands in `<repo>/.agents/skills/`. Ejected first
  // and moved second, because Codex has no plugin at project scope.
  test("names where an ejected skill actually lands", async ({ configure }) => {
    await configure.installDialog.close()
    const skill = configure.skillIn(
      web,
      SINGLE_AGENT_SKILL.category,
      SINGLE_AGENT_SKILL.name
    )
    await skill.setInstallMode("eject")
    await skill.setScope("project")
    await configure.subAgents.setScope(SINGLE_AGENT_SKILL.agentId, "project")
    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "into .agents/skills/"
    )
    await expect(configure.installDialog.root).not.toContainText(
      ".claude/skills/"
    )
  })

  test("names where an ejected global skill lands", async ({ configure }) => {
    await configure.installDialog.close()
    await configure.skillIn(web, FRAMEWORK, REACT).flipInstall()
    await configure.roster.installButton.click()

    await expect(configure.installDialog.root).toContainText(
      "into ~/.codex/skills/"
    )
    await expect(configure.installDialog.root).not.toContainText(
      ".agents/skills/"
    )
  })

  // `$CODEX_HOME`, which on a clean machine is `~/.codex`.
  test("names the global root Codex reads", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText("~/.codex")
    await expect(configure.installDialog.root).not.toContainText("~/.claude")
  })

  // A Codex sub-agent is a TOML role file under `.codex/agents/`, with no
  // front-matter in it.
  test("says role files rather than front-matter", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText(
      "sub-agent role files"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "sub-agent front-matter"
    )
  })

  // An untrusted Codex project is half live, silently: skills reach the model,
  // role files and plugin enablement do not.
  test("says what an untrusted project costs", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText(
      "only once the project is trusted"
    )
  })
})

test.describe("what the install dialog says a Claude install writes", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubCreateConfig(page)
    await withSelection(configure)
    await configure.roster.installButton.click()
  })

  test("says front-matter rather than role files", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText(
      "sub-agent front-matter"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "sub-agent role files"
    )
  })

  // The Claude sentence is the subject guard for the absence.
  test("says nothing about trusting a project", async ({ configure }) => {
    await expect(configure.installDialog.root).toContainText(
      "sub-agent front-matter"
    )
    await expect(configure.installDialog.root).not.toContainText(
      "only once the project is trusted"
    )
  })
})

// The provider is where an install goes, not what it holds: choosing Codex
// leaves the selected skills and the payload alone. Remembered setups on
// unselected skills may move (the plugin+project rule below).
test.describe("what choosing Codex does not change", () => {
  test("leaves the selected skills byte-identical", async ({ configure }) => {
    await withSelection(configure)
    const before = await storedSkills(configure)
    expect(before).toContain(REACT_ID)

    await configure.provider.choose("codex")
    await expect(configure.provider.chosen).toHaveText(/codex/i)

    expect(await storedSkills(configure)).toBe(before)
  })

  test("leaves the skills where they were", async ({ configure }) => {
    await withSelection(configure)
    const skill = configure.skillIn(web, FRAMEWORK, REACT)

    await configure.provider.choose("codex")

    await expect(skill.root).toHaveAttribute("aria-pressed", "true")
    await expect(skill.installMode).toHaveText("plugin")
    await expect(skill.scope).toHaveText("global")
  })
})

// Codex drops both summoners, so the count is the provider's; the dialog's rows
// are the number.
test.describe("how many sub-agents an install writes", () => {
  const openInstall = async (
    configure: ConfigurePage,
    provider: "claude" | "codex"
  ) => {
    await configure.provider.choose(provider)
    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()
  }

  test.beforeEach(async ({ configure, page }) => {
    stubCreateConfig(page)
    await withSelection(configure)
  })

  test("says the same number in the dialog, its footer and the button", async ({
    configure,
  }) => {
    await openInstall(configure, "codex")
    const written = await configure.installDialog.agentRows.count()

    await expect(configure.installDialog.footerNote).toContainText(
      `${written} sub-agents`
    )
    await configure.installDialog.close()
    await expect(configure.roster.installButton).toContainText(
      `${written} agents`
    )
  })

  test("writes two fewer of them on Codex than on Claude", async ({
    configure,
  }) => {
    await openInstall(configure, "claude")
    const onClaude = await configure.installDialog.agentRows.count()
    await configure.installDialog.close()

    await openInstall(configure, "codex")

    expect(await configure.installDialog.agentRows.count()).toBe(onClaude - 2)
  })

  test("names the two it left out rather than dropping them in silence", async ({
    configure,
  }) => {
    await openInstall(configure, "codex")

    for (const summoner of AGENTS_NOT_ON_CODEX) {
      await expect(configure.installDialog.agentsPane).toContainText(summoner)
    }
    await expect(configure.installDialog.agentsPane).toContainText(
      "not installed on Codex"
    )
  })

  test("lists them as ordinary rows on Claude", async ({ configure }) => {
    await openInstall(configure, "claude")

    for (const summoner of AGENTS_NOT_ON_CODEX) {
      await expect(configure.installDialog.agentsPane).toContainText(summoner)
    }
    await expect(configure.installDialog.agentsPane).not.toContainText(
      "not installed on Codex"
    )
  })
})

// The bytes that leave the browser are the same on either provider.
test.describe("the payload", () => {
  test("is byte-identical on either provider", async ({ configure, page }) => {
    const bodies = captureCreateConfigBodies(page)
    await withSelection(configure)

    await configure.roster.installButton.click()
    await expect(configure.installDialog.command(CLAUDE_COMMAND)).toBeVisible()
    await configure.installDialog.close()

    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
    // Subject guard: a control that did nothing would also send equal bodies.
    await expect(configure.installDialog.command(CODEX_COMMAND)).toBeVisible()

    expect(bodies).toHaveLength(2)
    expect(bodies[1]).toBe(bodies[0])
  })

  test("carries no provider of its own", async ({ configure, page }) => {
    const bodies = captureCreateConfigBodies(page)
    await withSelection(configure)

    await configure.provider.choose("codex")
    await configure.roster.installButton.click()
    await expect(configure.installDialog.command(CODEX_COMMAND)).toBeVisible()

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).not.toContain('"provider"')
  })
})

// Codex has no plugin+project. `aria-disabled`, not `disabled`, so the `title`
// reason still opens; refused presses are forced.
test.describe("a placement Codex does not offer", () => {
  test("refuses the press that would produce it", async ({ configure }) => {
    await withSelection(configure)
    await configure.provider.choose("codex")

    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    await expect(skill.installMode).toHaveText("plugin")
    await expect(skill.scopeCell("project")).toHaveAttribute(
      "aria-disabled",
      "true"
    )

    await skill.scopeCell("project").click({ force: true })
    await expect(skill.scope).toHaveText("global")
  })

  test("takes a project skill to global when plugin is pressed", async ({
    configure,
  }) => {
    await withSelection(configure)
    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    await skill.setInstallMode("eject")
    await skill.setScope("project")
    await skill.setInstallMode("plugin")
    await expect(skill.scope).toHaveText("project")

    await skill.setInstallMode("eject")
    await configure.provider.choose("codex")
    await expect(skill.installCell("plugin")).not.toHaveAttribute(
      "aria-disabled",
      "true"
    )
    await skill.setInstallMode("plugin")

    await expect(skill.installMode).toHaveText("plugin")
    await expect(skill.scope).toHaveText("global")
  })

  test("takes it to global through the options panel too", async ({
    configure,
    page,
  }) => {
    await withSelection(configure)
    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    await skill.openOptions()
    await skill.options.choose("eject")
    await skill.options.choose("project")
    await skill.options.choose("plugin")
    await expect(skill.scope).toHaveText("project")
    await skill.options.choose("eject")
    await page.keyboard.press("Escape")

    await configure.provider.choose("codex")
    await skill.openOptions()
    await expect(skill.options.segment("plugin")).not.toHaveAttribute(
      "aria-disabled",
      "true"
    )
    await skill.options.choose("plugin")

    await expect(skill.installMode).toHaveText("plugin")
    await expect(skill.scope).toHaveText("global")
  })

  test("leaves the project press open on a cell Codex does offer", async ({
    configure,
  }) => {
    await withSelection(configure)
    await configure.provider.choose("codex")

    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    await skill.setInstallMode("eject")
    await skill.setScope("project")

    await expect(skill.scope).toHaveText("project")
    await expect(skill.installMode).toHaveText("eject")
  })

  test("leaves the same press open on Claude", async ({ configure }) => {
    await withSelection(configure)

    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    await skill.setScope("project")

    await expect(skill.scope).toHaveText("project")
    await expect(skill.installMode).toHaveText("plugin")
  })

  test("names the three it does offer, and the one it does not", async ({
    configure,
  }) => {
    await withSelection(configure)
    await configure.provider.choose("codex")

    const refused = configure
      .skillIn(web, FRAMEWORK, REACT)
      .scopeCell("project")
    await expect(refused).toHaveAttribute("aria-disabled", "true")

    const reason = await refused.getAttribute("title")
    expect(reason).toContain(CODEX_REFUSED_CELL)
    for (const offered of CODEX_OFFERED_CELLS) {
      expect(reason).toContain(offered)
    }
  })
})

// The refused PROJECT takes the unavailable ink, `not-allowed`, and nothing
// under the pointer, at both doors.
test.describe("the PROJECT cell Codex cannot install", () => {
  test("recedes in the skill cell, and the pointer changes nothing", async ({
    configure,
  }) => {
    await withSelection(configure)
    const cell = configure.skillIn(web, FRAMEWORK, REACT).scopeCell("project")
    expect((await paintOf(cell)).cursor).toBe("pointer")

    await configure.provider.choose("codex")
    await expect(cell).toHaveAttribute("aria-disabled", "true")

    const atRest = await paintOf(cell)
    expect(atRest.color).toBe(await configure.tokenColor("--color-unavailable"))
    expect(atRest.cursor).toBe("not-allowed")
    await cell.hover()
    expect(await paintOf(cell)).toStrictEqual(atRest)
  })

  test("recedes in the options panel, and the pointer changes nothing", async ({
    configure,
    page,
  }) => {
    await withSelection(configure)
    const skill = configure.skillIn(web, FRAMEWORK, REACT)
    const segment = skill.options.segment("project")
    await skill.openOptions()
    expect((await paintOf(segment)).cursor).toBe("pointer")
    await page.keyboard.press("Escape")

    await configure.provider.choose("codex")
    await skill.openOptions()
    await expect(segment).toHaveAttribute("aria-disabled", "true")

    const atRest = await paintOf(segment)
    expect(atRest.color).toBe(await configure.tokenColor("--color-unavailable"))
    expect(atRest.cursor).toBe("not-allowed")
    await segment.hover()
    expect(await paintOf(segment)).toStrictEqual(atRest)
  })
})

// On Codex no unselected plugin skill rests at project. Nothing selected moves,
// and nothing moves back.
test.describe("a remembered project plugin on the way to Codex", () => {
  test("moves to global, and stays there back on Claude", async ({
    configure,
  }) => {
    const chosen = await withAProjectScopedPluginSkill(configure)
    const remembered = configure.skillIn(web, FRAMEWORK, VUE)
    await remembered.setScope("project")
    await expect(remembered.root).toHaveAttribute("aria-pressed", "false")
    await expect(remembered.scope).toHaveText("project")

    await configure.provider.choose("codex")

    await expect(remembered.scope).toHaveText("global")
    await expect(chosen.installMode).toHaveText("plugin")
    await expect(chosen.scope).toHaveText("project")

    await configure.provider.choose("claude")

    await expect(remembered.scope).toHaveText("global")
  })

  test("is set aside at global when the errored skill is deselected", async ({
    configure,
  }) => {
    const skill = await withAProjectScopedPluginSkill(configure)
    await skill.toggle()
    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await expect(skill.scope).toHaveText("project")
    await skill.toggle()

    await configure.provider.choose("codex")
    await expect(skill.scope).toHaveText("project")
    await skill.toggle()

    await expect(skill.root).toHaveAttribute("aria-pressed", "false")
    await expect(skill.scope).toHaveText("global")
  })
})

// A plugin+project skill chosen before the switch keeps its placement as an
// error on its cell.
test.describe("switching to Codex with that placement already chosen", () => {
  test("marks the skill asking for it, and no other", async ({ configure }) => {
    const skill = await switchedWithAProjectScopedPluginSkill(configure)

    await expect(skill.errorMark).toBeVisible()
    await expect(
      configure.skillIn(web, FRAMEWORK, REACT).errorMark
    ).toHaveCount(0)
  })

  test("draws the mark in the error ink", async ({ configure }) => {
    const skill = await switchedWithAProjectScopedPluginSkill(configure)

    await expect(skill.errorMark).toBeVisible()
    expect((await paintOf(skill.errorMark)).color).toBe(
      await configure.tokenColor("--color-error-ink")
    )
  })

  test("draws its PROJECT cell in the error colours", async ({ configure }) => {
    const skill = await withAProjectScopedPluginSkill(configure)
    const cell = skill.scopeCell("project")
    const wash = await configure.tokenColor("--color-error-wash")
    const ink = await configure.tokenColor("--color-error-ink")
    expect((await paintOf(cell)).background).not.toBe(wash)

    await configure.provider.choose("codex")

    await expect.poll(async () => (await paintOf(cell)).background).toBe(wash)
    expect((await paintOf(cell)).color).toBe(ink)
  })

  test("opens the reason when the mark takes focus", async ({ configure }) => {
    const skill = await switchedWithAProjectScopedPluginSkill(configure)
    await expect(skill.errorMark).toBeVisible()
    await expect(skill.errorTip).toBeHidden()

    await skill.errorMark.focus()

    await expect(skill.errorTip).toBeVisible()
  })

  test("opens the reason under the pointer", async ({ configure }) => {
    const skill = await switchedWithAProjectScopedPluginSkill(configure)
    await expect(skill.errorTip).toBeHidden()

    await skill.errorMark.hover()

    await expect(skill.errorTip).toBeVisible()
  })

  test("leads the reason in the error ink", async ({ configure }) => {
    const skill = await switchedWithAProjectScopedPluginSkill(configure)
    await skill.errorMark.focus()

    const lead = skill.errorTip.getByText(CODEX_ERROR_LEAD, { exact: true })
    await expect(lead).toBeVisible()
    const style = await lead.evaluate((node) => {
      const computed = getComputedStyle(node)
      return { color: computed.color, weight: computed.fontWeight }
    })
    expect(style).toStrictEqual({
      color: await configure.tokenColor("--color-error-ink"),
      weight: "500",
    })
  })

  test("draws the reason 196 design px wide", async ({ configure, page }) => {
    const skill = await switchedWithAProjectScopedPluginSkill(configure)
    await skill.errorMark.focus()
    await expect(skill.errorTip).toBeVisible()

    const { width } = (await skill.errorTip.boundingBox())!
    expect(width).toBeCloseTo((196 / 16) * (await rootFontSize(page)), 0)
  })

  // Nothing selected but the one skill, so no stack rule refuses it.
  test("keeps the reason inside the grid from the last column", async ({
    configure,
  }) => {
    const lattice = configure.skillLattice(web, FRAMEWORK)
    const tracks = await configure.latticeTracks(lattice)
    const name = await lattice
      .locator('[data-slot="lattice-cell"]')
      .nth(tracks - 1)
      .locator("button[aria-pressed]")
      .getAttribute("aria-label")
    const skill = configure.skillIn(web, FRAMEWORK, name!)
    await skill.toggle()
    await skill.setScope("project")
    await expect(skill.errorMark).toHaveCount(0)

    await configure.provider.choose("codex")
    await skill.errorMark.hover()
    await expect(skill.errorTip).toBeVisible()

    const tip = (await skill.errorTip.boundingBox())!
    const grid = (await lattice.boundingBox())!
    expect(tip.x + tip.width).toBeLessThanOrEqual(grid.x + grid.width)
  })

  test("changes nothing the visitor chose", async ({ configure }) => {
    const skill = await switchedWithAProjectScopedPluginSkill(configure)

    await expect(skill.errorMark).toBeVisible()
    await expect(skill.installMode).toHaveText("plugin")
    await expect(skill.scope).toHaveText("project")
  })

  // A command the CLI refuses is worse than none.
  test("refuses to hand over a command the CLI would reject", async ({
    configure,
  }) => {
    await switchedWithAnInstallableProjectScopedPluginSkill(configure)

    await expect(configure.roster.installButton).toBeDisabled()
  })

  test("clears once the skill is ejected", async ({ configure }) => {
    const skill =
      await switchedWithAnInstallableProjectScopedPluginSkill(configure)
    await expect(skill.errorMark).toBeVisible()

    await skill.setInstallMode("eject")

    await expect(skill.errorMark).toHaveCount(0)
    await expect(configure.roster.installButton).toBeEnabled()
  })

  test("clears once the skill moves to global instead", async ({
    configure,
  }) => {
    const skill =
      await switchedWithAnInstallableProjectScopedPluginSkill(configure)
    await expect(skill.errorMark).toBeVisible()

    await skill.setScope("global")

    await expect(skill.errorMark).toHaveCount(0)
    await expect(configure.roster.installButton).toBeEnabled()
  })

  test("clears on the way back to Claude", async ({ configure }) => {
    const skill =
      await switchedWithAnInstallableProjectScopedPluginSkill(configure)
    await expect(skill.errorMark).toBeVisible()

    await configure.provider.choose("claude")

    await expect(skill.errorMark).toHaveCount(0)
    await expect(configure.roster.installButton).toBeEnabled()
  })
})

// Shown disabled with the reason rather than hidden: the CLI drops them at
// install.
test.describe("the sub-agents Codex leaves out", () => {
  test.beforeEach(async ({ configure }) => {
    await withSelection(configure)
  })

  test("are both named, with the reason, once Codex is chosen", async ({
    configure,
  }) => {
    await configure.provider.choose("codex")

    for (const name of AGENTS_NOT_ON_CODEX) {
      const row = configure.roster.agentNamed(name)
      await expect(row).toHaveAttribute("aria-disabled", "true")
      expect(await row.getAttribute("title")).toMatch(/codex/i)
    }
  })

  test("leaves the rest of the roster alone", async ({ configure }) => {
    await configure.provider.choose("codex")

    await expect(
      configure.roster.agentNamed(AGENT_ON_CODEX)
    ).not.toHaveAttribute("aria-disabled", "true")
  })

  test("are ordinary rows on Claude", async ({ configure }) => {
    for (const name of AGENTS_NOT_ON_CODEX) {
      await expect(configure.roster.agentNamed(name)).not.toHaveAttribute(
        "aria-disabled",
        "true"
      )
    }
  })

  // Forced: the row is `aria-disabled`, which Playwright reads as not enabled.
  test("cannot be pinned on while Codex is chosen", async ({ configure }) => {
    await configure.provider.choose("codex")
    const row = configure.roster.agentNamed(AGENTS_NOT_ON_CODEX[0])

    await expect(row).toHaveAttribute("aria-pressed", "false")
    await row.click({ force: true })

    await expect(row).toHaveAttribute("aria-pressed", "false")
  })

  test("while the rest of the roster still responds", async ({ configure }) => {
    await configure.provider.choose("codex")
    const row = configure.roster.agentNamed(AGENT_ON_CODEX)

    await expect(row).toHaveAttribute("aria-pressed", "true")
    await row.click()

    await expect(row).toHaveAttribute("aria-pressed", "false")
  })
})

// The bytes of each role file are held against the renderer in
// `codex-in-the-preview.test.ts`; this is the tree the dialog paints.
test.describe("the output preview on Codex", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, FRAMEWORK, REACT).toggle()
  })

  test("draws the Codex source folder", async ({ configure }) => {
    await configure.provider.choose("codex")
    await configure.roster.previewButton.click()

    const paths = await configure.outputPreviewDialog.rowPaths()
    expect(paths).toContain("~/.agents-inc/codex/")
    expect(paths).not.toContain("~/.agents-inc/claude/")
  })

  test("draws the Claude one when Claude is chosen", async ({ configure }) => {
    await configure.roster.previewButton.click()

    const paths = await configure.outputPreviewDialog.rowPaths()
    expect(paths).toContain("~/.agents-inc/claude/")
    expect(paths).not.toContain("~/.agents-inc/codex/")
  })

  test("draws the sub-agents as Codex agent role files", async ({
    configure,
  }) => {
    await configure.provider.choose("codex")
    await configure.roster.previewButton.click()

    const paths = await configure.outputPreviewDialog.rowPaths()
    expect(paths).toContain("~/.codex/agents/web-developer.toml")
    expect(paths).not.toContain("~/.claude/agents/web-developer.md")
  })

  test("draws no role file for the two Codex leaves out", async ({
    configure,
  }) => {
    await configure.provider.choose("codex")
    await configure.roster.previewButton.click()

    const paths = await configure.outputPreviewDialog.rowPaths()
    const roles = paths.filter(
      (path): path is string => path?.endsWith(".toml") === true
    )

    // Subject guard: a tree with no role files passes the absence for free.
    expect(roles).not.toHaveLength(0)
    expect(
      roles.filter(
        (path) =>
          path.endsWith("agent-summoner.toml") ||
          path.endsWith("skill-summoner.toml")
      )
    ).toStrictEqual([])
  })
})
