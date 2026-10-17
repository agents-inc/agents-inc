import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_CANONICAL_REF,
  PRIVATE_MARKETPLACE_REF,
} from "@workspace/api-mocks/fixtures"

import { SKILL_INDEX } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  stubHeldMissingMarketplace,
  stubMalformedCatalog,
  stubMarketplaceCatalog,
  stubMissingMarketplace,
  stubPrivateMarketplaceCatalog,
} from "../support/marketplace"
import { stubSkillContents } from "../support/skill-contents"
import { stubSkillIndex } from "../support/skill-index"
import {
  ACME_SKILL_ID,
  DEAD_LINK_ID,
  DRIFTED_IMPORT_ID,
  DRIFTED_MARKETPLACE_PAYLOAD,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  PRIVATE_IMPORT_ID,
  PRIVATE_MARKETPLACE_PAYLOAD,
  RETIRED_SKILL_ID,
  stubGetConfig,
  stubGetConfigMissing,
} from "../support/sharing"

import type { Page } from "@playwright/test"

// Nothing may resolve an id before the catalogue it was minted against is
// seated: neither the saved configuration nor a share link's.

// Marketplace ids are prefixed, so which catalogue answered is observable.
const ACME_SKILL = "Acme Widgets"
const PUBLIC_SKILL = EXCLUSIVE_CATEGORY.first

// Its directory lives for the session and never reaches storage: the witness
// that storage was not reread.
const ADDED_SKILL = SKILL_INDEX.skills[0]!.name
const ADDED_CATEGORY = `${DOMAINS.web.toLowerCase()} · ${EXCLUSIVE_CATEGORY.name.toLowerCase()}`

// The private stub refuses anything but the real token, as with an expired one.
const STALE_TOKEN = "ghp_staleaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

test.describe("a configuration saved against a marketplace", () => {
  test.beforeEach(({ page }) => {
    stubMarketplaceCatalog(page)
  })

  // Hydration runs at import, before any fetch resolves.
  test("survives a reload rather than pruning before its catalogue arrives", async ({
    configure,
    page,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(MARKETPLACE_REF)
    await configure.marketplaceDialog.load()
    await configure.skill(ACME_SKILL).toggle()
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)

    await page.reload()

    await expect(configure.skill(ACME_SKILL).root).toBeVisible()
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
  })
})

// A saved marketplace that fails on startup prompts like a first load, and the
// picks are kept.
test.describe("a saved marketplace that no longer loads", () => {
  // Loaded with a good token, a skill picked, then the token gone stale.
  test.beforeEach(async ({ configure, page }) => {
    stubPrivateMarketplaceCatalog(page)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(PRIVATE_MARKETPLACE_REF)
    await configure.marketplaceDialog.load()
    await expect(configure.marketplaceDialog.tokenInput).toBeVisible()
    await configure.marketplaceDialog.fillToken(MARKETPLACE_TOKEN)
    await configure.marketplaceDialog.load()

    await configure.skill(ACME_SKILL).toggle()
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)

    await configure.seedSavedMarketplaces({
      current: PRIVATE_MARKETPLACE_REF,
      saved: { [PRIVATE_MARKETPLACE_REF]: STALE_TOKEN },
    })
  })

  test("prompts for the token the same way a first load does", async ({
    configure,
    page,
  }) => {
    await page.reload()

    await expect(configure.marketplaceDialog.root).toBeVisible()
    await expect(configure.marketplaceDialog.marketplaceInput).toHaveValue(
      PRIVATE_MARKETPLACE_CANONICAL_REF
    )
    await expect(configure.marketplaceDialog.error).toContainText("404")
    await expect(configure.marketplaceDialog.tokenInput).toBeFocused()
  })

  test("restores the whole configuration once the token arrives", async ({
    configure,
    page,
  }) => {
    await page.reload()
    await expect(configure.marketplaceDialog.tokenInput).toBeFocused()

    await configure.marketplaceDialog.fillToken(MARKETPLACE_TOKEN)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("keeps the saved picks when the prompt is cancelled", async ({
    configure,
    page,
  }) => {
    await page.reload()
    await expect(configure.marketplaceDialog.root).toBeVisible()

    await configure.marketplaceDialog.cancel()

    await expect(configure.importNotice).toContainText(PRIVATE_MARKETPLACE_REF)
    expect(await configure.storedConfig()).toContain(ACME_SKILL_ID)
  })

  test("finishes from the button after the prompt was cancelled", async ({
    configure,
    page,
  }) => {
    await page.reload()
    await expect(configure.marketplaceDialog.root).toBeVisible()
    await configure.marketplaceDialog.cancel()

    await configure.marketplaceButton.click()
    await expect(configure.marketplaceDialog.marketplaceInput).toHaveValue(
      PRIVATE_MARKETPLACE_CANONICAL_REF
    )
    await configure.marketplaceDialog.fillToken(MARKETPLACE_TOKEN)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // Clearing the field re-points a parked restore at the public catalogue.
  test("finishes the parked restore when the field is cleared for the public catalogue", async ({
    configure,
    page,
  }) => {
    await page.reload()
    await expect(configure.marketplaceDialog.root).toBeVisible()

    await configure.marketplaceDialog.fill("")
    await configure.marketplaceDialog.load()

    await expect(configure.skill(PUBLIC_SKILL).root).toBeVisible()
    // Not "no line at all": the next test's notice replaces it.
    await expect(configure.importNotice).not.toContainText(
      PRIVATE_MARKETPLACE_REF
    )
    // From the slot: the notice going while the marketplace stays stored is the
    // same bug.
    expect(await configure.chosenMarketplace()).not.toBe(
      PRIVATE_MARKETPLACE_CANONICAL_REF
    )
  })

  test("names the saved ids the public catalogue could not place", async ({
    configure,
    page,
  }) => {
    await page.reload()
    await expect(configure.marketplaceDialog.root).toBeVisible()

    await configure.marketplaceDialog.fill("")
    await configure.marketplaceDialog.load()

    await expect(configure.importNotice).toContainText(ACME_SKILL_ID)
  })
})

test.describe("a saved configuration its seated catalogue has outgrown", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceCatalog(page)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(MARKETPLACE_REF)
    await configure.marketplaceDialog.load()
    await configure.skill(ACME_SKILL).toggle()
    expect(await configure.storedConfig()).toContain(ACME_SKILL_ID)
  })

  test("names the saved ids the seated catalogue could not place", async ({
    configure,
    page,
  }) => {
    // An empty `current` is the public catalogue, so nothing parks.
    await configure.seedSavedMarketplaces({ current: "", saved: {} })

    await page.reload()

    await expect(configure.importNotice).toContainText(ACME_SKILL_ID)
  })

  test("says nothing when the catalogue can still place everything", async ({
    configure,
    page,
  }) => {
    await page.reload()

    await expect(configure.skill(ACME_SKILL).root).toBeVisible()
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
    await expect(configure.importNotice).toBeHidden()
  })

  // The second notice must not replace the first.
  test("adds what the restore cost to what the opening already said", async ({
    configure,
    page,
  }) => {
    stubGetConfigMissing(page, DEAD_LINK_ID)
    await configure.seedSavedMarketplaces({ current: "", saved: {} })

    await page.goto(`/?fromId=${DEAD_LINK_ID}`)

    await expect(configure.importNotice).toContainText("points to nothing")
    await expect(configure.importNotice).toContainText(ACME_SKILL_ID)
  })
})

// Prefixed: pushed at `window.history`, not built by the router.
const SETTINGS_URL = "/editor/settings"

// The opening must not rerun: a second storage read would replace memory with
// less.
test.describe("returning to the screen", () => {
  // Same-document both ways (`pushState`, then `goBack`): a document load would
  // refetch the catalogue and stop the assertion asking. The Settings
  // placeholder proves the leave happened.
  const leaveAndReturn = async (page: Page) => {
    await page.evaluate(
      (url) => window.history.pushState(null, "", url),
      SETTINGS_URL
    )
    await expect(page.getByRole("main")).toHaveText("Settings")
    await page.goBack()
  }

  test("fetches the marketplace catalogue no second time", async ({
    configure,
    page,
  }) => {
    const requests = stubMarketplaceCatalog(page)
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(MARKETPLACE_REF)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME_SKILL).root).toBeVisible()
    expect(requests).toHaveLength(1)

    await leaveAndReturn(page)

    await expect(configure.skill(ACME_SKILL).root).toBeVisible()
    expect(requests).toHaveLength(1)
  })

  test("keeps a selected added skill, which storage never held", async ({
    configure,
    page,
  }) => {
    stubSkillIndex(page)
    stubSkillContents(page)
    await configure.addSkillButton.click()
    await configure.addSkillDialog.stage(ADDED_SKILL)
    await configure.addSkillDialog.categorise(ADDED_SKILL, ADDED_CATEGORY)
    await configure.addSkillDialog.confirm()
    await configure.skill(ADDED_SKILL).toggle()

    await leaveAndReturn(page)

    expect(await configure.skill(ADDED_SKILL).isSelected()).toBe(true)
  })
})

test.describe("importing a payload that names a marketplace", () => {
  test.beforeEach(({ page }) => {
    stubMarketplaceCatalog(page)
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
  })

  test("loads that catalogue before it resolves a single id", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)

    await expect(configure.skill(ACME_SKILL).root).toBeVisible()
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
  })

  // Seated but not stored: a marketplace a link named is not one this browser
  // chose.
  test("leaves that marketplace loaded and unstored", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.skill(ACME_SKILL).root).toBeVisible()

    await expect(configure.marketplaceButton).toContainText(MARKETPLACE_REF)
    expect(await configure.savedMarketplaces()).toBeNull()
  })

  test("names the ids the catalogue could not place", async ({
    configure,
    page,
  }) => {
    stubGetConfig(page, DRIFTED_IMPORT_ID, DRIFTED_MARKETPLACE_PAYLOAD)

    await page.goto(`/?fromId=${DRIFTED_IMPORT_ID}`)

    await expect(configure.importNotice).toContainText(RETIRED_SKILL_ID)
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
  })
})

test.describe("a payload naming a marketplace this browser cannot read", () => {
  test.beforeEach(({ page }) => {
    stubPrivateMarketplaceCatalog(page)
    stubGetConfig(page, PRIVATE_IMPORT_ID, PRIVATE_MARKETPLACE_PAYLOAD)
  })

  test("opens the dialog on the payload's own marketplace, token focused", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${PRIVATE_IMPORT_ID}`)

    await expect(configure.marketplaceDialog.root).toBeVisible()
    await expect(configure.marketplaceDialog.marketplaceInput).toHaveValue(
      PRIVATE_MARKETPLACE_CANONICAL_REF
    )
    await expect(configure.marketplaceDialog.error).toContainText("404")
    await expect(configure.marketplaceDialog.tokenInput).toBeFocused()
  })

  test("finishes the import once the token arrives, and keeps it", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${PRIVATE_IMPORT_ID}`)
    await expect(configure.marketplaceDialog.tokenInput).toBeVisible()

    await configure.marketplaceDialog.fillToken(MARKETPLACE_TOKEN)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME_SKILL).root).toBeVisible()
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
    expect(await configure.savedToken(PRIVATE_MARKETPLACE_CANONICAL_REF)).toBe(
      MARKETPLACE_TOKEN
    )
  })

  test("recovers the same way from a stale token in storage", async ({
    configure,
    page,
  }) => {
    await configure.seedSavedMarketplaces({
      current: PRIVATE_MARKETPLACE_REF,
      saved: { [PRIVATE_MARKETPLACE_REF]: STALE_TOKEN },
    })

    await page.goto(`/?fromId=${PRIVATE_IMPORT_ID}`)

    await expect(configure.marketplaceDialog.tokenInput).toBeFocused()
    await configure.marketplaceDialog.fillToken(MARKETPLACE_TOKEN)
    await configure.marketplaceDialog.load()

    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
  })
})

test.describe("a payload naming a marketplace with an unreadable catalogue", () => {
  test.beforeEach(({ page }) => {
    stubMalformedCatalog(page)
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
  })

  test("names the field that is wrong and offers no token", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)

    await expect(configure.marketplaceDialog.root).toBeVisible()
    await expect(configure.marketplaceDialog.error).toContainText("skills")
    await expect(configure.marketplaceDialog.tokenInput).toBeHidden()
  })
})

// A form mounted before the recovery arrives must still take it.
test.describe("a dialog already open when the import parks", () => {
  test("takes the recovery it did not open with", async ({
    configure,
    page,
  }) => {
    const releaseRefusal = stubHeldMissingMarketplace(page)
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)

    // Through the page object, which waits for the grid and webfonts so the
    // click does not land mid-reflow.
    await configure.goto(`?fromId=${MARKETPLACE_IMPORT_ID}`)
    await configure.marketplaceButton.click()
    await expect(configure.marketplaceDialog.root).toBeVisible()
    await expect(configure.marketplaceDialog.marketplaceInput).toHaveValue("")

    releaseRefusal()

    await expect(configure.marketplaceDialog.marketplaceInput).toHaveValue(
      MARKETPLACE_CANONICAL_REF
    )
    await expect(configure.marketplaceDialog.error).toContainText("404")
    await expect(configure.marketplaceDialog.tokenInput).toBeVisible()
  })
})

test.describe("cancelling out of the recovery", () => {
  test.beforeEach(({ page }) => {
    stubMissingMarketplace(page)
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
  })

  // Left alone means the slot and the normal URL: the shared address governs
  // itself.
  test("parks the import visibly and leaves the configuration alone", async ({
    configure,
    page,
  }) => {
    await configure.skill(PUBLIC_SKILL).toggle()

    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.marketplaceDialog.root).toBeVisible()
    await configure.marketplaceDialog.cancel()

    await expect(configure.importNotice).toContainText(MARKETPLACE_REF)
    await expect(configure.skill(ACME_SKILL).root).toBeHidden()

    await page.goto("/")
    expect(await configure.skill(PUBLIC_SKILL).isSelected()).toBe(true)
  })

  // Unlike a restore, a payload is not re-pointed by clearing the field: its
  // ids belong to its marketplace.
  test("leaves a parked import parked when the public catalogue is asked for", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.marketplaceDialog.root).toBeVisible()

    await configure.marketplaceDialog.fill("")
    await configure.marketplaceDialog.load()

    await expect(configure.importNotice).toContainText(MARKETPLACE_REF)
    await expect(configure.skill(ACME_SKILL).root).toBeHidden()
  })
})
