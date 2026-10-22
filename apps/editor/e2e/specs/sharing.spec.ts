import { SEED_VERSION } from "@workspace/matrix/seed"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  DEAD_LINK_ID,
  OUT_OF_DATE,
  STORED_ID,
  STORED_PAYLOAD,
  STORE_UNAVAILABLE,
  captureCreateConfig,
  stubCreateConfig,
  stubCreateConfigRefusal,
  stubCreateConfigUnreachable,
  stubGetConfig,
  stubGetConfigMissing,
} from "../support/sharing"

const REACT_ID = "web-framework-react"

// Longer than `RESET_DELAY_MS` in `use-share-link.ts`. A fixed wait, because
// what is checked is that nothing happens.
const PAST_THE_DECAY_WINDOW_MS = 3_000

test.describe("sharing a configuration", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test("share stores the config and copies a fromId link", async ({
    configure,
    page,
  }) => {
    stubCreateConfig(page)
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()

    await configure.roster.shareButton.click()
    await expect(
      configure.roster.root.getByRole("button", { name: "Link copied" })
    ).toBeVisible()

    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toContain(`/editor/?fromId=${STORED_ID}`)
  })

  test("share offers nothing to an empty selection", async ({ configure }) => {
    await expect(configure.roster.shareButton).toBeDisabled()
  })

  // Model and effort are the agent's, so a skill carries neither.
  test("posts the v2 shape: skills without model, agents in their own map", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)

    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()
    // Pinned on with nothing assigned: the base agent case.
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

    // Every agent the rule reached rests, so only the pin has an entry.
    expect(body!.agents).toStrictEqual({ "api-developer": { on: true } })
  })

  // A stale bundle is refused on every click, so this ending does not decay.
  test("a stale page is told to reload, and the instruction stays", async ({
    configure,
    page,
  }) => {
    stubCreateConfigRefusal(page, OUT_OF_DATE)
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()

    await configure.roster.shareButton.click()

    const instruction = configure.roster.root.getByRole("button", {
      name: "Out of date — reload",
    })
    await expect(instruction).toBeVisible()

    await page.waitForTimeout(PAST_THE_DECAY_WINDOW_MS)
    await expect(instruction).toBeVisible()
  })

  test("a refused store reads as failure and recovers", async ({
    configure,
    page,
  }) => {
    stubCreateConfigRefusal(page, STORE_UNAVAILABLE)
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()

    await configure.roster.shareButton.click()

    await expect(
      configure.roster.root.getByRole("button", { name: "Sharing failed" })
    ).toBeVisible()
    await expect(configure.roster.shareButton).toBeVisible()
  })

  // No answer at all: the unreachable path, not a refusal.
  test("an unreachable worker reads as offline and recovers", async ({
    configure,
    page,
  }) => {
    stubCreateConfigUnreachable(page)
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()

    await configure.roster.shareButton.click()

    await expect(
      configure.roster.root.getByRole("button", { name: "Offline — try again" })
    ).toBeVisible()
    await expect(configure.roster.shareButton).toBeVisible()
  })
})

test.describe("opening a share link", () => {
  test("loads the shared config and keeps the param", async ({
    configure,
    page,
  }) => {
    stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    const react = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.first
    )
    await expect(react.root).toHaveAttribute("aria-pressed", "true")
    // Kept; `shared-link.spec.ts` covers what it buys.
    await expect(page).toHaveURL(`/editor/?fromId=${STORED_ID}`)
  })

  test("carries the shared load states through to the roster", async ({
    configure,
    page,
  }) => {
    stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    const skillNames = Object.keys(STORED_PAYLOAD.skills)
    expect(skillNames).toHaveLength(1)
    // One agent carries the skill, one travelled pinned on with nothing.
    await expect(configure.roster.installButton).toContainText(
      "2 agents · 1 skill"
    )
    await expect(
      configure.roster.loadWord(EXCLUSIVE_CATEGORY.first, "web-developer")
    ).toHaveAccessibleName("Load mode: preloaded")
  })

  test("applies the shared model and effort to the agent", async ({
    configure,
    page,
  }) => {
    stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    const cards = configure.subAgents
    await expect(cards.modelOption("web-developer", "haiku")).toBeChecked()
    await expect(cards.effortOption("web-developer", "max")).toBeChecked()
  })

  // `on: true` lets an agent with no skills travel.
  test("a bare pinned agent arrives as a base agent", async ({
    configure,
    page,
  }) => {
    stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    await expect(
      configure.roster.agentButton("api", "developer")
    ).toHaveAttribute("aria-pressed", "true")
    await expect(configure.subAgents.card("API", "Developer")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.roster.root).toContainText("no skills — base agent")
  })

  test("a dead link reports itself and leaves the config alone", async ({
    configure,
    page,
  }) => {
    stubGetConfigMissing(page, DEAD_LINK_ID)
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.second)
      .toggle()

    await page.goto(`/?fromId=${DEAD_LINK_ID}`)

    await expect(page.getByRole("alert")).toContainText("points to nothing")
    // A dead id governs nothing, so the visitor's own selection stands.
    const vue = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.second
    )
    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
    // Kept, so retrying a worker that was briefly down is a reload.
    await expect(page).toHaveURL(`/editor/?fromId=${DEAD_LINK_ID}`)
  })
})
