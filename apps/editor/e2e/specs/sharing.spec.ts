import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  SHARE_API,
  STORED_ID,
  STORED_PAYLOAD,
  stubCreateConfig,
  stubGetConfig,
  stubGetConfigMissing,
} from "../support/sharing"

const SEED_VERSION = 3
const REACT_ID = "web-framework-react"

test.describe("sharing a configuration", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test("share stores the config and copies a fromId link", async ({
    configure,
    page,
  }) => {
    await stubCreateConfig(page)
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()

    await configure.roster.shareButton.click()
    await expect(
      configure.roster.root.getByRole("button", { name: "Link copied" })
    ).toBeVisible()

    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain(`?fromId=${STORED_ID}`)
  })

  test("share offers nothing to an empty selection", async ({ configure }) => {
    await expect(configure.roster.shareButton).toBeDisabled()
  })

  // What actually leaves the browser. Model and effort are the agent's now, so
  // a skill carries neither, and the agents map is what makes a bare pinned
  // agent shareable at all — v1 could not express one.
  test("posts the v2 shape: skills without model, agents in their own map", async ({
    configure,
    page,
  }) => {
    const posted: Record<string, unknown>[] = []
    await page.route(`${SHARE_API}/configs`, (route) => {
      posted.push(route.request().postDataJSON())
      return route.fulfill({ status: 201, json: { id: STORED_ID } })
    })

    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()
    // Pinned on with nothing assigned — the base agent case.
    await configure.roster.agentButton("api", "developer").click()

    await configure.roster.shareButton.click()
    await expect(
      configure.roster.root.getByRole("button", { name: "Link copied" })
    ).toBeVisible()

    const [body] = posted
    expect(body).toBeDefined()
    expect(body!.v).toBe(SEED_VERSION)

    const skill = (body!.skills as Record<string, Record<string, unknown>>)[
      REACT_ID
    ]!
    expect(skill).not.toHaveProperty("model")
    expect(skill).not.toHaveProperty("effort")
    expect(skill.assignments).toMatchObject({ "web-developer": "preloaded" })

    // Only the pin has anything to say: the four agents the selection reached
    // rest on their catalogue model and medium effort, so they say nothing.
    expect(body!.agents).toEqual({ "api-developer": { on: true } })
  })

  test("a failed store reads as failure and recovers", async ({
    configure,
    page,
  }) => {
    await page.route("**/configs", (route) => route.abort())
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()

    await configure.roster.shareButton.click()

    await expect(
      configure.roster.root.getByRole("button", { name: "Sharing failed" })
    ).toBeVisible()
    // The terminal state decays back to an actionable button.
    await expect(configure.roster.shareButton).toBeVisible()
  })
})

test.describe("opening a share link", () => {
  test("loads the shared config and strips the param", async ({
    configure,
    page,
  }) => {
    await stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    const react = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.first
    )
    await expect(react.root).toHaveAttribute("aria-pressed", "true")
    // Consumed once: a reload must show the user's edits, not the snapshot.
    await expect(page).toHaveURL("/")
  })

  test("carries the shared load states through to the roster", async ({
    configure,
    page,
  }) => {
    await stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    const skillNames = Object.keys(STORED_PAYLOAD.skills)
    expect(skillNames).toHaveLength(1)
    // One agent carries the skill, one travelled pinned on with nothing.
    await expect(configure.roster.installButton).toContainText(
      "2 sub-agents and 1 skill"
    )
    await expect(
      configure.roster.loadWord(EXCLUSIVE_CATEGORY.first, "web-developer")
    ).toHaveAccessibleName("Load mode: preloaded")
  })

  test("applies the shared model and effort to the agent", async ({
    configure,
    page,
  }) => {
    await stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    await expect(
      configure.roster.modelWord("web-developer")
    ).toHaveAccessibleName("Model for web-developer: haiku")
    await expect(
      configure.roster.effortMeter("web-developer")
    ).toHaveAccessibleName("Effort for web-developer: max")
  })

  // The capability v2 added: an agent with no skills at all can now travel,
  // because `on: true` says so rather than being inferred from assignments.
  test("a bare pinned agent arrives as a base agent", async ({
    configure,
    page,
  }) => {
    await stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    await expect(
      configure.roster.agentButton("api", "developer")
    ).toHaveAttribute("aria-pressed", "true")
    await expect(configure.roster.root).toContainText("no skills — base agent")
    await expect(configure.roster.domainBand("api")).toContainText("1 of")
  })

  test("a dead link reports itself and leaves the config alone", async ({
    configure,
    page,
  }) => {
    await stubGetConfigMissing(page, "gone0000")
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.second)
      .toggle()

    await page.goto("/?fromId=gone0000")

    await expect(page.getByRole("alert")).toContainText("points to nothing")
    // Vue was selected before following the link and must still be.
    const vue = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.second
    )
    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
    await expect(page).toHaveURL("/")
  })
})
