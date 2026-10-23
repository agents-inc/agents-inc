import {
  cliMintedPayload,
  cliMintedStackPayload,
  freshlyPickedSkill,
  projectMintedPayload,
  projectOwnSkill,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  STACKS,
  stackIdOf,
} from "../support/catalog"
import { captureCreateConfig, stubGetConfig } from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"
import type { Page } from "@playwright/test"

// A bare `edit` run inside a project mints a link holding the global install's
// entries as well as the project's own. A run in that project cannot switch the
// global ones off or change them, so the editor draws them disabled; switching
// one to project gives the project a copy of its own and leaves the global one.

const LINK_ID = "ProjMnt1"
const API_LINK_ID = "ProjApi1"
const STACK_LINK_ID = "ProjStk1"
const HOME_LINK_ID = "HomeMnt1"
const SHARED_LINK_ID = "EdShare1"

const REACT_ID = "web-framework-react"
const HONO_ID = "api-framework-hono"
const WEB_DEV = "web-developer"
const API_DEV = "api-developer"

// Mirrored, not imported: a rendering assertion keeps its literal.
const SWITCH_OFF_REFUSED =
  "Installed globally, so this project can't switch it off."
const CHANGE_REFUSED =
  "Installed globally, so this project can't change it. Switch it to project to change a copy of its own."
const SWAP_REFUSED =
  "React is installed globally, so this project can't swap it out."

const { web } = DOMAINS
const { name: FRAMEWORK, first: REACT, second: VUE } = EXCLUSIVE_CATEGORY
const { name: STYLING, first: TAILWIND } = MULTI_CATEGORY

// React in the global install; Hono and the API developer the project's own.
const projectLink = () =>
  projectMintedPayload(
    {
      [REACT_ID]: freshlyPickedSkill(REACT_ID),
      [HONO_ID]: projectOwnSkill([API_DEV]),
    },
    [API_DEV]
  )

// Hono global too, so the link holds the API developer as well.
const linkHoldingApiDeveloper = () =>
  projectMintedPayload({
    [REACT_ID]: freshlyPickedSkill(REACT_ID),
    [HONO_ID]: freshlyPickedSkill(HONO_ID),
  })

const react = (configure: ConfigurePage) =>
  configure.skillIn(web, FRAMEWORK, REACT)

// Playwright waits out `aria-disabled`; the claim is what the press changes.
const REFUSED_PRESS = { force: true }

const reactOnApiDeveloper = (configure: ConfigurePage) =>
  configure.roster.skillRow(REACT, API_DEV)

const giveReactToApiDeveloper = async (
  configure: ConfigurePage,
  page: Page
) => {
  const held = react(configure)
  await held.openOptions()
  await held.options.cycleAssignment("API", "dev")
  await page.keyboard.press("Escape")
  await expect(held.options.root).toBeHidden()
  await expect(reactOnApiDeveloper(configure)).toHaveCount(1)
}

test.describe("a link a bare edit minted inside a project", () => {
  // Share copies the link.
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test.beforeEach(async ({ configure, page }) => {
    stubGetConfig(page, LINK_ID, projectLink())
    await page.goto(`/?fromId=${LINK_ID}`)
    await expect(react(configure).root).toHaveAttribute("aria-pressed", "true")
  })

  test("draws a global skill it holds disabled, and keeps it on", async ({
    configure,
  }) => {
    const held = react(configure)

    await expect(held.root).toHaveAttribute("aria-disabled", "true")
    await expect(held.root).toHaveAttribute("title", SWITCH_OFF_REFUSED)

    await held.root.click(REFUSED_PRESS)

    await expect(held.root).toHaveAttribute("aria-pressed", "true")
  })

  // The control: the guard holds the global entries, not the whole link.
  test("leaves a skill the project holds for itself free to switch off", async ({
    configure,
  }) => {
    const hono = configure.skill("Hono")
    await expect(hono.root).not.toHaveAttribute("aria-disabled")

    await hono.toggle()

    await expect(hono.root).toHaveAttribute("aria-pressed", "false")
  })

  test("keeps the global skill's install mode until its scope goes to project", async ({
    configure,
  }) => {
    const held = react(configure)
    await expect(held.installCell("eject")).toHaveAttribute(
      "title",
      CHANGE_REFUSED
    )

    await held.installCell("eject").click(REFUSED_PRESS)
    await expect(held.installCell("plugin")).toHaveAttribute(
      "aria-checked",
      "true"
    )

    await held.setScope("project")
    await held.setInstallMode("eject")

    await expect(held.scopeCell("project")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(held.installCell("eject")).toHaveAttribute(
      "aria-checked",
      "true"
    )
  })

  test("puts the global skill back as it arrived once its scope returns to global", async ({
    configure,
  }) => {
    const held = react(configure)
    await held.setScope("project")
    await held.setInstallMode("eject")

    await held.setScope("global")

    await expect(held.installCell("plugin")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(held.installCell("eject")).toHaveAttribute(
      "title",
      CHANGE_REFUSED
    )
  })

  // The control: only the rows on sub-agents the link holds go back.
  test("keeps the row it gave the project's own sub-agent once its scope returns to global", async ({
    configure,
    page,
  }) => {
    const held = react(configure)
    await held.setScope("project")
    await giveReactToApiDeveloper(configure, page)

    await held.setScope("global")

    await expect(held.scopeCell("global")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(reactOnApiDeveloper(configure)).toHaveCount(1)
  })

  test("keeps the row it gave the project's own sub-agent when global is pressed again", async ({
    configure,
    page,
  }) => {
    await giveReactToApiDeveloper(configure, page)

    await react(configure).setScope("global")

    await expect(reactOnApiDeveloper(configure)).toHaveCount(1)
  })

  test("keeps the global skill on even once its copy is the project's", async ({
    configure,
  }) => {
    const held = react(configure)
    await held.setScope("project")

    await held.root.click(REFUSED_PRESS)

    await expect(held.root).toHaveAttribute("aria-pressed", "true")
    await expect(held.root).toHaveAttribute("title", SWITCH_OFF_REFUSED)
  })

  test("will not swap the global skill out of its one-of category", async ({
    configure,
  }) => {
    const vue = configure.skillIn(web, FRAMEWORK, VUE)
    await expect(vue.root).toHaveAttribute("aria-disabled", "true")
    await expect(vue.root).toHaveAttribute("title", SWAP_REFUSED)

    await vue.root.click(REFUSED_PRESS)

    await expect(vue.root).toHaveAttribute("aria-pressed", "false")
    await expect(react(configure).root).toHaveAttribute("aria-pressed", "true")
  })

  test("draws a global sub-agent it holds disabled, and keeps it on", async ({
    configure,
  }) => {
    const card = configure.subAgents.card("Web", "Developer")
    await expect(card).toHaveAttribute("aria-disabled", "true")
    await expect(card).toHaveAttribute("title", SWITCH_OFF_REFUSED)

    await configure.subAgents.toggle("Web", "Developer", REFUSED_PRESS)

    await expect(card).toHaveAttribute("aria-pressed", "true")
  })

  test("keeps the roster's switch on a global sub-agent it holds", async ({
    configure,
  }) => {
    const pin = configure.roster.agentButton("web", "developer")
    await expect(pin).toHaveAttribute("title", SWITCH_OFF_REFUSED)

    await pin.click(REFUSED_PRESS)

    await expect(pin).toHaveAttribute("aria-pressed", "true")
  })

  test("keeps the global sub-agent's model until its scope goes to project", async ({
    configure,
  }) => {
    const haiku = configure.subAgents.modelOption(WEB_DEV, "haiku")
    await expect(haiku).toHaveAttribute("title", CHANGE_REFUSED)

    await haiku.click(REFUSED_PRESS)
    await expect(haiku).toHaveAttribute("aria-checked", "false")

    await configure.subAgents.setScope(WEB_DEV, "project")
    await configure.subAgents.setModel(WEB_DEV, "haiku")

    await expect(haiku).toHaveAttribute("aria-checked", "true")
  })

  test("leaves a sub-agent the project holds for itself free to switch off", async ({
    configure,
  }) => {
    const card = configure.subAgents.card("API", "Developer")
    await expect(card).not.toHaveAttribute("aria-disabled")

    await configure.subAgents.toggle("API", "Developer")

    await expect(card).toHaveAttribute("aria-pressed", "false")
  })

  test("will not give a global sub-agent it holds a skill picked here", async ({
    configure,
  }) => {
    const tailwind = configure.skillIn(web, STYLING, TAILWIND)
    await tailwind.toggle()

    await expect(tailwind.root).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.skillRow(REACT, WEB_DEV)).toHaveCount(1)
    await expect(configure.roster.skillRow(TAILWIND, WEB_DEV)).toHaveCount(0)
  })

  test("keeps the global entries through another stack, and says so", async ({
    configure,
  }) => {
    await configure.chooseStack(STACKS.nextjs)
    await expect(configure.stackSwitchDialog.root).toContainText(
      "discarding 1 selected skill"
    )
    await expect(configure.stackSwitchDialog.root).toContainText(
      "What is installed globally stays."
    )
    await configure.stackSwitchDialog.confirm()

    await expect(react(configure).root).toHaveAttribute("aria-pressed", "true")
    await expect(react(configure).root).toHaveAttribute("aria-disabled", "true")
    const card = configure.subAgents.card("Web", "Developer")
    await expect(card).toHaveAttribute("aria-pressed", "true")
    await expect(card).toHaveAttribute("aria-disabled", "true")
  })

  test("names what clearing keeps", async ({ configure }) => {
    await expect(configure.stackCell(0)).toContainText(
      "removes 1 skill and every sub-agent not installed globally"
    )
  })

  // Codex installs no plugin at project, so the copy is ejected.
  test("switches a global plugin to project on Codex as an ejected copy", async ({
    configure,
  }) => {
    await configure.provider.choose("codex")
    const held = react(configure)
    await expect(held.scopeCell("project")).not.toHaveAttribute("aria-disabled")

    await held.setScope("project")

    await expect(held.scopeCell("project")).toHaveAttribute(
      "aria-checked",
      "true"
    )
    await expect(held.installCell("eject")).toHaveAttribute(
      "aria-checked",
      "true"
    )

    await held.setScope("global")

    await expect(held.installCell("plugin")).toHaveAttribute(
      "aria-checked",
      "true"
    )
  })

  // Only a bare `edit` run in a project marks a link; Share is the editor's own.
  test("shares a link that opens with a skill picked here free to switch off", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const tailwind = configure.skillIn(web, STYLING, TAILWIND)
    await tailwind.toggle()

    await configure.roster.shareLink()
    expect(posted.map((body) => "fromProject" in body)).toStrictEqual([false])

    // Served back as captured: what the editor minted is the whole claim.
    stubGetConfig(page, SHARED_LINK_ID, posted[0])
    await page.goto(`/?fromId=${SHARED_LINK_ID}`)
    await expect(tailwind.root).toHaveAttribute("aria-pressed", "true")
    await expect(tailwind.root).not.toHaveAttribute("aria-disabled")

    await tailwind.toggle()

    await expect(tailwind.root).toHaveAttribute("aria-pressed", "false")
  })
})

test.describe("a project's link holding the API developer globally", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubGetConfig(page, API_LINK_ID, linkHoldingApiDeveloper())
    await page.goto(`/?fromId=${API_LINK_ID}`)
    await expect(react(configure).root).toHaveAttribute("aria-pressed", "true")
  })

  // Held is where it rests now: moved to project, its rows are the project's.
  test("keeps the row the global skill gave it at project when global is pressed", async ({
    configure,
    page,
  }) => {
    await configure.subAgents.setScope(API_DEV, "project")
    await giveReactToApiDeveloper(configure, page)

    await react(configure).setScope("global")

    await expect(configure.subAgents.card("API", "Developer")).toHaveAttribute(
      "title",
      SWITCH_OFF_REFUSED
    )
    await expect(reactOnApiDeveloper(configure)).toHaveCount(1)
  })
})

// A project whose every entry is global, so the grid recognises its stack.
test.describe("a project's link the grid recognises as a stack", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubGetConfig(page, STACK_LINK_ID, {
      ...cliMintedStackPayload(stackIdOf(STACKS.nextjs)),
      fromProject: true,
    })
    await page.goto(`/?fromId=${STACK_LINK_ID}`)
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("keeps the global entries when started from scratch", async ({
    configure,
  }) => {
    await configure.stackCell(0).click()

    await expect(react(configure).root).toHaveAttribute("aria-pressed", "true")
    await expect(react(configure).root).toHaveAttribute("aria-disabled", "true")
  })
})

// The same global entries, minted where a run can change them.
test.describe("a link minted anywhere but a project", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubGetConfig(
      page,
      HOME_LINK_ID,
      cliMintedPayload({ [REACT_ID]: freshlyPickedSkill(REACT_ID) })
    )
    await page.goto(`/?fromId=${HOME_LINK_ID}`)
    await expect(react(configure).root).toHaveAttribute("aria-pressed", "true")
  })

  test("leaves its global skill free to switch off", async ({ configure }) => {
    const free = react(configure)
    await expect(free.root).not.toHaveAttribute("aria-disabled")

    await free.toggle()

    await expect(free.root).toHaveAttribute("aria-pressed", "false")
  })

  test("leaves its global sub-agent free to switch off", async ({
    configure,
  }) => {
    const card = configure.subAgents.card("Web", "Developer")
    await expect(card).not.toHaveAttribute("aria-disabled")

    await configure.subAgents.toggle("Web", "Developer")

    await expect(card).toHaveAttribute("aria-pressed", "false")
  })
})
