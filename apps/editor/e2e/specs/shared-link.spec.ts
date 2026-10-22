import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
  seedPayload,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY, MULTI_CATEGORY } from "../support/catalog"
import { stubMarketplaceCatalog } from "../support/marketplace"
import {
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  STORED_ID,
  captureCreateConfig,
  stubGetConfig,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

// A shared link is its own URL with its own state; reloading it reopens that
// state.

// What the public payload carries, and a sibling of it this browser picked for
// itself. One exclusive category, so the two cannot both be selected — which is
// what makes "whose configuration is showing" a fact rather than a count.
const SHARED_SKILL = EXCLUSIVE_CATEGORY.first
const OWN_SKILL = EXCLUSIVE_CATEGORY.second
const SHARED_SKILL_ID = "web-framework-react"

// A third skill, from a category that allows several, added while looking at
// someone else's configuration.
const EDITED_SKILL = MULTI_CATEGORY.first

// Only the marketplace fixture ships it, so its presence names which catalogue
// answered rather than counting what rendered.
const ACME_SKILL = "Acme Widgets"

test.describe("a shared link keeps its own address", () => {
  test.beforeEach(({ page }) => {
    stubGetConfig(page, STORED_ID)
  })

  test("keeps the id in the URL rather than consuming it", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${STORED_ID}`)

    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(page).toHaveURL(`/editor/?fromId=${STORED_ID}`)
  })

  test("reopens the same state on a reload", async ({ configure, page }) => {
    await page.goto(`/?fromId=${STORED_ID}`)
    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await page.reload()

    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("says whose configuration is on screen, and where one's own is", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${STORED_ID}`)

    await expect(configure.importNotice).toContainText("shared configuration")
    await expect(configure.importNotice).toContainText("Editor")
  })
})

test.describe("a shared link naming a marketplace this browser has not stored", () => {
  test.beforeEach(({ page }) => {
    stubMarketplaceCatalog(page)
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
  })

  test("reopens on that marketplace's catalogue after a reload", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await page.reload()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // The slot holds one marketplace, so storing a link's would replace the
  // visitor's own, PAT and all.
  test("does not store the marketplace it named", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.skill(ACME_SKILL).root).toBeVisible()

    expect(await configure.savedMarketplaces()).toBeNull()
  })
})

test.describe("a shared link naming no marketplace while one is stored", () => {
  // A visitor on `acme/skills` opens a link built on the public catalogue; a
  // reload must not prune it.
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceCatalog(page)
    stubGetConfig(page, STORED_ID)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(MARKETPLACE_REF)
    await configure.marketplaceDialog.load()
    await configure.skill(ACME_SKILL).toggle()
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
  })

  test("shows the link's own catalogue, and the same again after a reload", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${STORED_ID}`)
    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.skill(ACME_SKILL).root).toBeHidden()

    await page.reload()

    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.skill(ACME_SKILL).root).toBeHidden()
  })

  test("leaves the visitor's own marketplace and selection at the normal URL", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${STORED_ID}`)
    await expect(configure.skill(SHARED_SKILL).root).toBeVisible()

    await page.goto("/")

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(await configure.chosenMarketplace()).toBe(MARKETPLACE_CANONICAL_REF)
  })

  // The notice names a nav item, so the escape has to work without a page
  // load.
  test("returns to the visitor's own from the Editor nav item", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${STORED_ID}`)
    await expect(configure.skill(SHARED_SKILL).root).toBeVisible()

    await page.getByRole("link", { name: "Editor" }).click()

    await expect(page).toHaveURL("/editor/")
    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})

// Nothing saved: an empty slot makes `merge` keep what is in memory, which here
// is somebody else's.
test.describe("a visitor who has saved nothing", () => {
  test.beforeEach(({ page }) => {
    stubGetConfig(page, STORED_ID)
  })

  const goToOwn = async (configure: ConfigurePage) => {
    await configure.page.goto(`/?fromId=${STORED_ID}`)
    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    // The notice's nav item, not a page load: a return, not a boot.
    await configure.page.getByRole("link", { name: "Editor" }).click()
    await expect(configure.page).toHaveURL("/editor/")
  }

  // Their own editor is empty: they have never configured anything.
  test("does not leave the shared selection on their own grid", async ({
    configure,
  }) => {
    await goToOwn(configure)

    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  // The slot is written by their first click, so it is read after one: the
  // earliest it can be wrong rather than pending.
  test("writes no borrowed selection into their slot", async ({
    configure,
  }) => {
    await goToOwn(configure)

    await configure
      .skillIn(DOMAINS.web, MULTI_CATEGORY.name, EDITED_SKILL)
      .toggle()

    expect(await configure.storedConfig()).not.toContain(SHARED_SKILL_ID)
  })

  // A first click saving the borrowed selection, then a reload dropping their
  // own pick through `partialize`, would leave a configuration they never
  // chose.
  test("saves only what they chose, and the same again after a reload", async ({
    configure,
    page,
  }) => {
    await goToOwn(configure)

    await configure
      .skillIn(DOMAINS.web, MULTI_CATEGORY.name, EDITED_SKILL)
      .toggle()
    await page.reload()

    await expect(configure.skill(EDITED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  // The notice promises the visitor's own configuration is untouched, so it
  // must leave with the address.
  test("takes its notice with it when the address is left", async ({
    configure,
  }) => {
    await goToOwn(configure)

    await expect(configure.importNotice).toBeHidden()
  })
})

test.describe("editing someone else's configuration", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubGetConfig(page, STORED_ID)
    await configure
      .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, OWN_SKILL)
      .toggle()
  })

  // Not on arrival, and not one click later either.
  test("writes nothing to this browser's saved configuration", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${STORED_ID}`)
    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await configure
      .skillIn(DOMAINS.web, MULTI_CATEGORY.name, EDITED_SKILL)
      .toggle()

    expect(await configure.storedConfig()).not.toContain(SHARED_SKILL_ID)
  })

  test("leaves the visitor's own selection to come back to", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${STORED_ID}`)
    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await configure
      .skillIn(DOMAINS.web, MULTI_CATEGORY.name, EDITED_SKILL)
      .toggle()

    await page.goto("/")

    const own = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      OWN_SKILL
    )
    const shared = configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      SHARED_SKILL
    )
    const edited = configure.skillIn(
      DOMAINS.web,
      MULTI_CATEGORY.name,
      EDITED_SKILL
    )

    await expect(own.root).toHaveAttribute("aria-pressed", "true")
    await expect(shared.root).toHaveAttribute("aria-pressed", "false")
    await expect(edited.root).toHaveAttribute("aria-pressed", "false")
  })
})

// As `init --from` installs it: a sub-agent never depends on a skill loading.
test.describe("a shared link whose only skill for a sub-agent this catalogue does not carry", () => {
  const LINK_ID = "Unknown1"
  const UNKNOWN_SKILL_ID = "web-framework-gone-from-catalogue"

  // As the editor mints: no sub-agent pinned, each reached by its skills.
  test.beforeEach(({ page }) => {
    stubGetConfig(
      page,
      LINK_ID,
      seedPayload({
        skills: {
          [SHARED_SKILL_ID]: {
            install: "plugin",
            scope: "global",
            assignments: { "web-developer": "preloaded" },
          },
          [UNKNOWN_SKILL_ID]: {
            install: "plugin",
            scope: "global",
            assignments: { "web-tester": "lazy" },
          },
        },
        agents: {},
      })
    )
  })

  test("names the skill and keeps that sub-agent on without it", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${LINK_ID}`)

    await expect(configure.importNotice).toContainText(UNKNOWN_SKILL_ID)
    await expect(configure.roster.agentButton("web", "tester")).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("mints that sub-agent on, so the install keeps it too", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    await page.goto(`/?fromId=${LINK_ID}`)
    await expect(configure.importNotice).toContainText(UNKNOWN_SKILL_ID)

    await configure.roster.installButton.click()
    await expect(
      configure.installDialog.command(`npx agents-inc init --from ${STORED_ID}`)
    ).toBeVisible()

    expect(posted.at(-1)).toHaveProperty(["agents", "web-tester"], { on: true })
  })
})
