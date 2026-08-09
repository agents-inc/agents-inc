import { expect, test } from "../fixtures"
import { AGENT_OPTIONS, DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import { captureCreateConfig, stubCreateConfig } from "../support/sharing"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT } = EXCLUSIVE_CATEGORY
const REACT_ID = "web-framework-react"

const DEVELOPER = "web-developer"
const REVIEWER = "reviewer"

// The CLI already carries scope on every `AgentScopeConfig`; the web had no
// surface for it, so `--from` wrote `project` unconditionally. The field is
// additive-optional, but the CLI's vendored zod object strips what it does not
// know — so the version is what says the field is really there.
const SEED_VERSION = 3

// Scope is a decision about the agent, exactly as model and effort are, and it
// sits with them on the agent's own row.
test.describe("agent scope", () => {
  test("the scope control rests on global", async ({ configure }) => {
    await expect(configure.roster.scopeControl(DEVELOPER)).toHaveAccessibleName(
      `Scope for ${DEVELOPER}: ${AGENT_OPTIONS.restingScope}`
    )
  })

  test("clicking the scope control toggles it to project and back", async ({
    configure,
  }) => {
    const scope = configure.roster.scopeControl(DEVELOPER)

    await scope.click()
    await expect(scope).toHaveAccessibleName(`Scope for ${DEVELOPER}: project`)

    await scope.click()
    await expect(scope).toHaveAccessibleName(`Scope for ${DEVELOPER}: global`)
  })

  // It sits on the agent's row, so the one thing it must never do is pin it —
  // the same guard the model word and the effort meter carry.
  test("choosing a scope does not switch the agent on", async ({
    configure,
  }) => {
    const developer = configure.roster.agentButton("web", "developer")

    await expect(developer).toHaveAttribute("aria-pressed", "false")
    await configure.roster.scopeControl(DEVELOPER).click()

    await expect(developer).toHaveAttribute("aria-pressed", "false")
    await expect(configure.roster.installButton).toContainText("0 sub-agents")
  })

  test("the choice belongs to one agent, not the domain", async ({
    configure,
  }) => {
    await configure.roster.scopeControl(DEVELOPER).click()

    await expect(configure.roster.scopeControl(REVIEWER)).toHaveAccessibleName(
      `Scope for ${REVIEWER}: global`
    )
  })

  // As expensive to make twice as a model or an effort, and stored the same
  // way — so it has to rebuild from storage rather than re-derive.
  test("a scope choice survives a reload", async ({ configure, page }) => {
    await configure.roster.scopeControl(DEVELOPER).click()
    await expect(configure.roster.scopeControl(DEVELOPER)).toHaveAccessibleName(
      `Scope for ${DEVELOPER}: project`
    )

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.roster.scopeControl(DEVELOPER)).toHaveAccessibleName(
      `Scope for ${DEVELOPER}: project`
    )
  })

  test("a pinned-off agent keeps its scope control", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    const developer = configure.roster.agentButton("web", "developer")

    await developer.click()
    await expect(developer).toHaveAttribute("aria-pressed", "false")

    await expect(configure.roster.scopeControl(DEVELOPER)).toBeVisible()
  })
})

// What actually leaves the browser. Scope travels on the agent's entry, and
// only when it is the user's choice rather than the resting default.
test.describe("sharing an agent's scope", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test("posts the v3 shape with the agent's scope in its entry", async ({
    configure,
    page,
  }) => {
    const posted = await captureCreateConfig(page)

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.scopeControl(DEVELOPER).click()

    await configure.roster.shareButton.click()
    await expect(
      configure.roster.root.getByRole("button", { name: "Link copied" })
    ).toBeVisible()

    const [body] = posted
    // The skill's own `scope` is a different field with the same name — where
    // the plugin is installed, not where the agent is written — and scope on
    // the agent must leave it exactly as it was.
    expect(body).toEqual({
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

  // Absent means global, matching the shared selection default, so the resting
  // value is the one thing the payload never says.
  test("an agent left at global travels no scope key", async ({
    configure,
    page,
  }) => {
    const posted = await captureCreateConfig(page)

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.scopeControl(DEVELOPER).click()
    // An entry of its own, earned by the model — and still no scope on it.
    await configure.roster.modelWord(REVIEWER).click()

    await configure.roster.shareButton.click()
    await expect(
      configure.roster.root.getByRole("button", { name: "Link copied" })
    ).toBeVisible()

    const [body] = posted
    expect(body!.agents).toEqual({
      [DEVELOPER]: { scope: "project" },
      [REVIEWER]: { model: "fable" },
    })
  })

  // The same drop-on-resting rule model and effort follow: cycling back to the
  // default removes the choice rather than recording it.
  test("returning an agent to global drops the key again", async ({
    configure,
    page,
  }) => {
    const posted = await captureCreateConfig(page)
    const scope = configure.roster.scopeControl(DEVELOPER)

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await scope.click()
    await scope.click()

    await configure.roster.shareButton.click()
    await expect(
      configure.roster.root.getByRole("button", { name: "Link copied" })
    ).toBeVisible()

    const [body] = posted
    expect(body!.agents).toEqual({})
  })
})

// The pane's Project heading used to be unconditional, because sub-agent
// front-matter was always written into the project. Scope is what makes it a
// real split, exactly as the skills pane already splits.
test.describe("install dialog agent scope", () => {
  test.beforeEach(async ({ page }) => {
    await stubCreateConfig(page)
  })

  test("groups the agents pane by scope", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.scopeControl(DEVELOPER).click()

    await configure.roster.installButton.click()

    const pane = configure.installDialog.agentsPane
    await expect(pane).toContainText(/Project[\s\S]*web · developer/)
    await expect(pane).toContainText(/Global[\s\S]*meta · reviewer/)
  })

  test("the Project group appears only once an agent is project", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await configure.roster.installButton.click()
    await expect(configure.installDialog.agentsPane).toContainText("Global")
    await expect(configure.installDialog.agentsPane).not.toContainText(
      "Project"
    )
    await configure.installDialog.close()

    await configure.roster.scopeControl(DEVELOPER).click()
    await configure.roster.installButton.click()

    await expect(configure.installDialog.agentsPane).toContainText("Project")
  })
})
