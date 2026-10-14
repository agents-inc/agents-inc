import { SEED_VERSION } from "@workspace/matrix/seed"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import { captureCreateConfig, stubCreateConfig } from "../support/sharing"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY
const REACT_ID = "web-framework-react"

const DEVELOPER = "web-developer"
const REVIEWER = "reviewer"

// Scope is set on the agent's 03 card, beside its model and effort.
test.describe("agent scope", () => {
  test("each scope is picked directly", async ({ configure }) => {
    const cards = configure.subAgents
    await expect(cards.scopeGroup(DEVELOPER)).toBeVisible()

    await cards.setScope(DEVELOPER, "project")
    await expect(cards.scopeOption(DEVELOPER, "project")).toBeChecked()

    await cards.setScope(DEVELOPER, "global")
    await expect(cards.scopeOption(DEVELOPER, "global")).toBeChecked()
  })

  test("the choice belongs to one agent, not the domain", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.scopeGroup(DEVELOPER)).toBeVisible()

    await cards.setScope(DEVELOPER, "project")

    await expect(cards.scopeOption(DEVELOPER, "project")).toBeChecked()
    await expect(cards.scopeOption(REVIEWER, "global")).toBeChecked()
  })

  test("a scope choice survives a reload", async ({ configure, page }) => {
    const cards = configure.subAgents
    await expect(cards.scopeGroup(DEVELOPER)).toBeVisible()
    await cards.setScope(DEVELOPER, "project")
    await expect(cards.scopeOption(DEVELOPER, "project")).toBeChecked()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(cards.scopeOption(DEVELOPER, "project")).toBeChecked()
  })

  test("a pinned-off agent keeps a working scope control", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.card("Web", "Developer")).toBeVisible()
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await cards.toggle("Web", "Developer")
    await expect(cards.card("Web", "Developer")).toHaveAttribute(
      "aria-pressed",
      "false"
    )

    await cards.setScope(DEVELOPER, "project")
    await expect(cards.scopeOption(DEVELOPER, "project")).toBeChecked()
  })
})

// Scope travels on the agent's entry, and only when it is not the resting
// global.
test.describe("sharing an agent's scope", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test("posts the agent's scope in its entry, at the version that carries it", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const cards = configure.subAgents
    await expect(cards.scopeGroup(DEVELOPER)).toBeVisible()

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await cards.setScope(DEVELOPER, "project")

    await configure.roster.shareLink()

    const [body] = posted
    // The skill's own `scope` is where the plugin installs, a different field.
    expect(body).toStrictEqual({
      v: SEED_VERSION,
      matrixVersion: expect.any(String),
      stackId: null,
      skills: {
        [REACT_ID]: {
          install: "plugin",
          scope: "global",
          assignments: expect.any(Object),
        },
      },
      agents: { [DEVELOPER]: { scope: "project" } },
    })
  })

  test("an agent left at global travels no scope key", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const cards = configure.subAgents
    await expect(cards.scopeGroup(DEVELOPER)).toBeVisible()

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await cards.setScope(DEVELOPER, "project")
    await cards.setModel(REVIEWER, "sonnet")

    await configure.roster.shareLink()

    const [body] = posted
    expect(body!.agents).toStrictEqual({
      [DEVELOPER]: { scope: "project" },
      [REVIEWER]: { model: "sonnet" },
    })
  })

  test("returning an agent to global drops the key again", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const cards = configure.subAgents
    await expect(cards.scopeGroup(DEVELOPER)).toBeVisible()

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await cards.setScope(DEVELOPER, "project")
    await expect(cards.scopeOption(DEVELOPER, "project")).toBeChecked()

    await cards.setScope(DEVELOPER, "global")
    await expect(cards.scopeOption(DEVELOPER, "global")).toBeChecked()

    await configure.roster.shareLink()

    const [body] = posted
    expect(body!.agents).toStrictEqual({})
  })
})

test.describe("install dialog agent scope", () => {
  test.beforeEach(({ page }) => {
    stubCreateConfig(page)
  })

  test("groups the agents pane by scope", async ({ configure }) => {
    const cards = configure.subAgents
    await expect(cards.scopeGroup(DEVELOPER)).toBeVisible()
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await cards.setScope(DEVELOPER, "project")

    await configure.roster.installButton.click()

    const pane = configure.installDialog.agentsPane
    await expect(pane).toContainText(/Project[\s\S]*web · developer/)
    await expect(pane).toContainText(/Global[\s\S]*meta · reviewer/)
  })

  test("the Project group appears only once an agent is project", async ({
    configure,
  }) => {
    const cards = configure.subAgents
    await expect(cards.scopeGroup(DEVELOPER)).toBeVisible()
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await configure.roster.installButton.click()
    await expect(configure.installDialog.agentsPane).toContainText("Global")
    await expect(configure.installDialog.agentsPane).not.toContainText(
      "Project"
    )
    await configure.installDialog.close()

    await cards.setScope(DEVELOPER, "project")
    await configure.roster.installButton.click()

    await expect(configure.installDialog.agentsPane).toContainText("Project")
  })
})
