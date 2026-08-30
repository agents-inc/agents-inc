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

// Applying a saved stack — the `remote` and `saved` arms of `StackRequest`,
// which until this file had no spec of any kind.
//
// An account's stack is a POINTER rather than a configuration: the grid holds a
// KV id and applying one is `GET /configs/:id`, the same call against the same
// route returning the same payload a share link fetches. The local slot holds
// that payload outright. Either way what arrives is a payload naming the
// marketplace its ids were minted against, which is what makes the share-link
// path the standard both are measured against here: seat the catalogue the
// payload names before reading a single id, park behind the marketplace dialog
// when that catalogue will not load, and name whatever the seated catalogue
// could not place (EDITOR-59).
//
// These build their own `ConfigurePage` rather than taking the `configure`
// fixture, for the ordering reason `accounts.spec.ts` states: the fixture
// navigates during setup, so first paint — and the session request with it —
// happens before any stub a test installs.

// Only the marketplace fixture ships it, so its presence names which catalogue
// answered rather than counting what rendered.
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

  // The documented promise of the `remote` arm: a pointer resolving to nothing
  // is not a reason to discard what the person is looking at.
  //
  // The response is WAITED FOR rather than assumed, because "nothing changed"
  // is a negative and a web-first assertion satisfies it instantly — before the
  // fetch has even been refused. Waiting is what makes the refusal the thing the
  // selection survived rather than something that had not happened yet.
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

  // EDITOR-59, and the reason this file exists at all.
  //
  // A stack saved while a marketplace was loaded holds ids only that catalogue
  // can place, and its payload names the marketplace so a reader can seat it.
  // Applying it against whatever catalogue happens to be seated means
  // `pruneUnknownIds` drops every id and the stack arrives empty, on any
  // machine but the one that saved it, with nothing on screen to say so.
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

  // The second of the three, and the one a notice alone cannot cover: a
  // catalogue that will not load leaves the payload unread rather than read
  // against the wrong catalogue, and the dialog that can seat it opens
  // pre-filled — exactly what an arriving share link already gets.
  //
  // The selection on screen is what proves "unread": applying against the
  // public catalogue would have replaced it with nothing.
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
    // Cancelled before the line above the grid is read, because a modal takes
    // the accessibility tree with it: `importNotice` is scoped to `main`, and
    // `main` is `aria-hidden` for as long as the dialog is open. Cancelling
    // parks the stack visibly rather than discarding it, which is the same
    // ending `catalog-first.spec.ts` asserts one door along.
    await configure.marketplaceDialog.cancel()

    await expect(configure.importNotice).toContainText(MARKETPLACE_REF)
    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
  })

  // Cancelled, then finished from the floating button — the parked stack is
  // applied by the press that seats its catalogue, whichever control seated it.
  test("applies what was parked once its catalogue is loaded", async ({
    page,
  }) => {
    stubMissingMarketplace(page)
    stubSignedIn(page, [stack(SAVED_NAME, MARKETPLACE_IMPORT_ID)])
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
    const configure = await arrive(page)

    await configure.stack(SAVED_NAME).click()
    await expect(configure.marketplaceDialog.root).toBeVisible()

    // The refusal is over; the same repository answers now.
    stubMarketplaceCatalog(page)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // The third: pruning is right, pruning in silence is what turns catalogue
  // drift into a stack that comes back quietly smaller than it was saved. The
  // ids themselves, in the same words the share-link door has used since
  // EDITOR-16.
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

// The local slot, which is the same silence for the same reason: the payload
// names its marketplace and applying it read the ids against whatever was
// seated. The arm differs only in where the payload comes from — the slot
// rather than a fetch — so it takes the same route through the same seating.
test.describe("the local saved stack", () => {
  test("seats the catalogue its payload names before reading the ids", async ({
    page,
  }) => {
    stubMarketplaceCatalog(page)
    // Seeded through a first visit, because `localStorage` belongs to the
    // origin: there is nothing to write into until the page has been served.
    const configure = await arrive(page)
    await configure.seedSavedStack(MARKETPLACE_PAYLOAD)
    await configure.goto()

    await configure.savedStack.click()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})
