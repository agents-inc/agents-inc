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

// Longer than `RESET_DELAY_MS` in `use-share-link.ts`, with room for a render
// after it. The one fixed wait in this suite, and here it IS the assertion
// rather than a workaround for a flaky one: what is being checked is that
// nothing happens.
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
    // THE PATH IS HALF THE ASSERTION. This read `toContain("?fromId=…")`
    // until the apex was split, which passed whether or not the link carried
    // the app's own base path — so a Share button minting
    // `agentsinc.sh/?fromId=…`, which lands a recipient on the landing
    // page with the configuration silently dropped, was green here.
    expect(copied).toContain(`/editor/?fromId=${STORED_ID}`)
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
    const posted = captureCreateConfig(page)

    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
      .toggle()
    // Pinned on with nothing assigned — the base agent case. Relevance keeps
    // the web skill inside its own domain, so any agent outside it can be
    // pinned on bare — a state the broadcast era reserved for the meta roster.
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

    // Only the pin has anything to say: every agent the rule reached rests on
    // its catalogue model and medium effort, so they say nothing.
    expect(body!.agents).toEqual({ "api-developer": { on: true } })
  })

  // The stale tab, and the one ending that names an action. This bundle
  // predates the last deploy, so it mints a seed version the worker no longer
  // serves and is refused on this click and on every click after it — which is
  // why the words say what to do, and why they have to survive being looked
  // away from. Every other ending clears itself inside the window below.
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

  // The worker answered and would not take it — an outage, a quota, or a bug
  // here. Nothing to do but try later, so it reports and clears.
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
    // The terminal state decays back to an actionable button.
    await expect(configure.roster.shareButton).toBeVisible()
  })

  // Aborting is the request never getting an answer at all, which is the
  // unreachable path and not a refusal — the worker never saw it. Retrying is
  // the whole of what a laptop off the network can do, so the words say so.
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
    // The terminal state decays back to an actionable button.
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
    // The address of a shared configuration rather than a one-shot command
    // (EDITOR-37): stripping it is what left a reload with no idea it had ever
    // been a shared link. `shared-link.spec.ts` covers what the address buys.
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
    stubGetConfig(page, STORED_ID)

    await page.goto(`/?fromId=${STORED_ID}`)

    await expect(
      configure.roster.modelWord("web-developer")
    ).toHaveAccessibleName("Model for web-developer: haiku")
    await expect(
      configure.roster.effortWord("web-developer")
    ).toHaveAccessibleName("Effort for web-developer: max")
  })

  // The capability v2 added: an agent with no skills at all can now travel,
  // because `on: true` says so rather than being inferred from assignments.
  test("a bare pinned agent arrives as a base agent", async ({
    configure,
    page,
  }) => {
    stubGetConfig(page, STORED_ID)

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
    stubGetConfigMissing(page, DEAD_LINK_ID)
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.second)
      .toggle()

    await page.goto(`/?fromId=${DEAD_LINK_ID}`)

    await expect(page.getByRole("alert")).toContainText("points to nothing")
    // Vue was selected before following the link and must still be: an id that
    // names nothing has no shared state to govern, so this IS the visitor's own
    // editor and it opens as one.
    const vue = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.second
    )
    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
    // Kept, like every other id: retrying a worker that was briefly down is
    // then a reload rather than a lost link.
    await expect(page).toHaveURL(`/editor/?fromId=${DEAD_LINK_ID}`)
  })
})
