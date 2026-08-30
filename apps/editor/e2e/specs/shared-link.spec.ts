import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY, MULTI_CATEGORY } from "../support/catalog"
import { stubMarketplaceCatalog } from "../support/marketplace"
import {
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  STORED_ID,
  stubGetConfig,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

// A shared link is its own URL with its own state, and reloading it reopens
// that same state (EDITOR-37, owner 2026-08-17).
//
// The id used to be STRIPPED from the address the moment it was applied, so a
// reload had no idea it had ever been a shared link and restored this browser's
// own marketplace and configuration over the top of it. Every fix inside that
// model was bad — clearing the stored marketplace destroys a PAT that cannot be
// recovered, keeping it leaves a trap that springs on reload, and warning at
// import time patches over a surprise rather than removing it. Separating the
// addresses removes it: the stored marketplace governs the normal editor URL,
// and the shared URL governs itself.
//
// Two claims are made throughout, and they are deliberately made separately:
// what is ON SCREEN at the shared address, and what is IN THE SLOT this browser
// saves into. The whole of the separation is that the second never follows the
// first.

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
    await expect(page).toHaveURL(`/?fromId=${STORED_ID}`)
  })

  // The owner's sentence, and the acceptance test for the whole row.
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

  // The line is not decoration: the address holds a configuration that is not
  // this browser's, edits to it are not saved anywhere, and the way back to
  // one's own is a nav item rather than something to guess at.
  test("says whose configuration is on screen, and where one's own is", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${STORED_ID}`)

    await expect(configure.importNotice).toContainText("shared configuration")
    await expect(configure.importNotice).toContainText("Configure")
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

  // Seated, never stored. A marketplace an arriving link named is not one this
  // browser chose, and the slot holds exactly one — so storing it would replace
  // whatever the visitor had, PAT and all, for a link they only looked at.
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
  // The case that motivated the row: a visitor on `acme/skills` opens a link
  // built on the public catalogue. It used to apply, display correctly, and
  // then prune itself to nothing on the next reload.
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

  // The way back the notice actually names, which is a nav item rather than a
  // fresh page load — so the escape has to work without one.
  test("returns to the visitor's own from the Configure nav item", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${STORED_ID}`)
    await expect(configure.skill(SHARED_SKILL).root).toBeVisible()

    await page.getByRole("link", { name: "Configure" }).click()

    await expect(page).toHaveURL("/")
    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})

// The branch every describe above misses: a visitor with NOTHING in the slot.
//
// `readSavedConfig` hands this browser's slot back and re-reads it, and an
// empty slot answers `merge` with `undefined` — which returns what is already
// in memory. Correct at startup, where that is empty state; on the way back
// from a shared address it is somebody else's configuration. A visitor who HAD
// saved something takes the other branch and returns correctly, which is why
// every spec in this file passes while driving this exact path: each one
// populates the slot in its `beforeEach` before it ever leaves the shared
// address.
//
// So the fixture's own guarantee is the thing under test here — a fresh
// context, and not one click before the navigation.
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

    // The way the notice itself names, rather than a fresh page load — which
    // is what makes this a return to their own address instead of a boot.
    await configure.page.getByRole("link", { name: "Configure" }).click()
    await expect(configure.page).toHaveURL("/")
  }

  // Their own editor is empty, because they have never configured anything.
  // Following the notice's own instruction must not hand them a stranger's
  // selection to adopt.
  test("does not leave the shared selection on their own grid", async ({
    configure,
  }) => {
    await goToOwn(configure)

    await expect(configure.skill(SHARED_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  // The slot is written by their FIRST click, whatever it was for — so what
  // reaches it is asked after one, which is the earliest moment the answer can
  // be wrong rather than merely pending.
  test("writes no borrowed selection into their slot", async ({
    configure,
  }) => {
    await goToOwn(configure)

    await configure
      .skillIn(DOMAINS.web, MULTI_CATEGORY.name, EDITED_SKILL)
      .toggle()

    expect(await configure.storedConfig()).not.toContain(SHARED_SKILL_ID)
  })

  // The compounding half. Their first click saves what is on screen, and a
  // reload drops the skill they actually added through `partialize` — leaving a
  // configuration they never chose, quietly smaller than the one they saw.
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

  // EDITOR-43, and it is what makes EDITOR-42 land: the notice is the thing
  // that promises the visitor their own configuration is untouched, so leaving
  // it standing over their own grid is the app vouching for the swap.
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

  // Not on arrival, and not one click later either. A guarantee that lasts
  // until the visitor touches anything is not a guarantee.
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
