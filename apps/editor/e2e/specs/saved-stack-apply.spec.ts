import { MARKETPLACE_REF } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stack, stubSignedIn } from "../support/auth"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  stubMarketplaceCatalog,
  stubMissingMarketplace,
} from "../support/marketplace"
import {
  DRIFTED_IMPORT_ID,
  DRIFTED_MARKETPLACE_PAYLOAD,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  RETIRED_SKILL_ID,
  STORED_ID,
  stubGetConfig,
  stubGetConfigMissing,
} from "../support/sharing"

import type { Page } from "@playwright/test"

// Applying a saved stack: the `remote` arm fetches a payload by pointer, the
// `saved` arm reads one from this browser. Either way the payload names its
// marketplace, so both owe what a share link gets (EDITOR-59): seat that
// catalogue first, park behind the marketplace dialog when it will not load,
// and name what it could not place. Each test builds its own `ConfigurePage`
// so stubs land before first paint.

// Only the marketplace fixture ships it.
const ACME_SKILL = "Acme Widgets"

const SAVED_NAME = "Weekday"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT, second: VUE } = EXCLUSIVE_CATEGORY

const arrive = async (page: Page) => {
  const configure = new ConfigurePage(page)
  await configure.goto()
  return configure
}

test.describe("an account's saved stack", () => {
  test("applies the configuration its pointer names", async ({ page }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfig(page, STORED_ID)
    const configure = await arrive(page)

    await configure.stack(SAVED_NAME).click()

    await expect(configure.skillIn(web, CATEGORY, REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // The refusal is awaited: "nothing changed" would otherwise pass before it.
  test("leaves the selection alone when its pointer resolves to nothing", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await arrive(page)

    const vue = configure.skillIn(web, CATEGORY, VUE)
    await vue.toggle()

    const refused = page.waitForResponse((response) =>
      response.url().endsWith(`/configs/${STORED_ID}`)
    )
    await configure.stack(SAVED_NAME).click()
    await configure.stackSwitchDialog.confirm()
    await refused

    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
  })

  test("seats the catalogue its payload names before reading the ids", async ({
    page,
  }) => {
    stubMarketplaceCatalog(page)
    stubSignedIn(page, [stack(SAVED_NAME, MARKETPLACE_IMPORT_ID)])
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
    const configure = await arrive(page)

    await configure.stack(SAVED_NAME).click()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // The selection surviving is what proves the payload went unread.
  test("parks behind the marketplace dialog when that catalogue will not load", async ({
    page,
  }) => {
    stubMissingMarketplace(page)
    stubSignedIn(page, [stack(SAVED_NAME, MARKETPLACE_IMPORT_ID)])
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
    const configure = await arrive(page)

    const vue = configure.skillIn(web, CATEGORY, VUE)
    await vue.toggle()

    await configure.stack(SAVED_NAME).click()
    await configure.stackSwitchDialog.confirm()

    await expect(configure.marketplaceDialog.root).toBeVisible()
    // Cancelled first: `main`, where the notice sits, is `aria-hidden` under
    // the modal.
    await configure.marketplaceDialog.cancel()

    await expect(configure.importNotice).toContainText(MARKETPLACE_REF)
    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
  })

  test("applies what was parked once its catalogue is loaded", async ({
    page,
  }) => {
    stubMissingMarketplace(page)
    stubSignedIn(page, [stack(SAVED_NAME, MARKETPLACE_IMPORT_ID)])
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
    const configure = await arrive(page)

    await configure.stack(SAVED_NAME).click()
    await expect(configure.marketplaceDialog.root).toBeVisible()

    stubMarketplaceCatalog(page)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // EDITOR-16's words, at this door too.
  test("names the ids the seated catalogue could not place", async ({
    page,
  }) => {
    stubMarketplaceCatalog(page)
    stubSignedIn(page, [stack(SAVED_NAME, DRIFTED_IMPORT_ID)])
    stubGetConfig(page, DRIFTED_IMPORT_ID, DRIFTED_MARKETPLACE_PAYLOAD)
    const configure = await arrive(page)

    await configure.stack(SAVED_NAME).click()

    await expect(configure.importNotice).toContainText(RETIRED_SKILL_ID)
  })
})

test.describe("a local named save", () => {
  test("seats the catalogue its payload names before reading the ids", async ({
    page,
  }) => {
    stubMarketplaceCatalog(page)
    // Seeded after a first visit: `localStorage` belongs to the served origin.
    const configure = await arrive(page)
    await configure.saveStackDialog.seed([
      { name: SAVED_NAME, payload: MARKETPLACE_PAYLOAD },
    ])
    await configure.goto()

    await configure.stack(SAVED_NAME).click()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})
