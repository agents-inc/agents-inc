import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  BIGCO_CANONICAL_REF,
  BIGCO_REF,
  stubMarketplaceEstate,
} from "../support/marketplace"
import {
  DRIFTED_MARKETPLACE_PAYLOAD,
  RETIRED_SKILL_ID,
  STORED_ID,
  stubGetConfig,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

// Leaving a link opens the configuration saved with the marketplace it goes
// to, as from anywhere else, so the notice says what that catalogue could not
// place. The address leaving must not take the notice with it.

const ACME = {
  ref: MARKETPLACE_REF,
  stored: MARKETPLACE_CANONICAL_REF,
  skill: "Acme Widgets",
} as const

const BIGCO = {
  ref: BIGCO_REF,
  stored: BIGCO_CANONICAL_REF,
  skill: "Bigco Widgets",
} as const

// The public catalogue's, which Acme's does not carry. Mirrored, not imported:
// a rendering assertion keeps its literal.
const PUBLIC_SKILL = EXCLUSIVE_CATEGORY.first
const PUBLIC_SKILL_ID = "web-framework-react"

// The link's own sentence, which leaves with its address.
const ON_A_LINK = "shared configuration"

const SAVED_STACK = "Weekday"

const loadMarketplace = async (configure: ConfigurePage, ref: string) => {
  await configure.marketplaceButton.click()
  await configure.marketplaceDialog.fill(ref)
  await configure.marketplaceDialog.load()
}

// The link's notice is the channel: the address is open before anything
// leaves it.
const openTheLink = async (configure: ConfigurePage) => {
  await configure.page.goto(`/?fromId=${STORED_ID}`)
  await expect(configure.importNotice).toContainText(ON_A_LINK)
}

test.describe("a marketplace whose saved configuration names a skill its catalogue lacks", () => {
  // This browser's public selection, holding the public catalogue's skill.
  let outgrown = ""

  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)
    stubGetConfig(page, STORED_ID)

    await configure.skill(PUBLIC_SKILL).toggle()
    outgrown = await configure.storedConfig()
    expect(outgrown).toContain(PUBLIC_SKILL_ID)
  })

  // Saved where Acme's configuration is read, once nothing else will write it.
  const outgrowAcme = (configure: ConfigurePage) =>
    configure.seedStoredConfig(ACME.stored, outgrown)

  // Both saved, Bigco chosen, so the switcher lists Acme.
  const saveAcmeThenBigco = async (configure: ConfigurePage) => {
    await loadMarketplace(configure, ACME.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
  }

  // The control: the same load from this browser's own configuration.
  test("names it when loaded from this browser's own configuration", async ({
    configure,
  }) => {
    await outgrowAcme(configure)

    await loadMarketplace(configure, ACME.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await expect(configure.importNotice).toContainText(PUBLIC_SKILL_ID)
  })

  test("names it, and not the link, when loaded from the dialog over a link", async ({
    configure,
    page,
  }) => {
    await outgrowAcme(configure)
    await openTheLink(configure)

    await loadMarketplace(configure, ACME.ref)
    await configure.marketplaceDialog.load()
    await expect(page).toHaveURL("/editor/")
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await expect(configure.importNotice).toContainText(PUBLIC_SKILL_ID)
    await expect(configure.importNotice).not.toContainText(ON_A_LINK)
  })

  // The control: the switcher from this browser's own configuration.
  test("names it when switched to from this browser's own configuration", async ({
    configure,
  }) => {
    await saveAcmeThenBigco(configure)
    await outgrowAcme(configure)

    await configure.switchTo(ACME.stored).click()
    await configure.marketplaceSwitchDialog.confirm()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await expect(configure.importNotice).toContainText(PUBLIC_SKILL_ID)
  })

  test("names it when switched to from the saved marketplaces over a link", async ({
    configure,
    page,
  }) => {
    await saveAcmeThenBigco(configure)
    await outgrowAcme(configure)
    await openTheLink(configure)

    await configure.switchTo(ACME.stored).click()
    await configure.marketplaceSwitchDialog.confirm()
    await expect(page).toHaveURL("/editor/")
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await expect(configure.importNotice).toContainText(PUBLIC_SKILL_ID)
  })
})

// Applying one is a load of its marketplace, then the stack, so it leaves a
// link the same way.
test.describe("a saved stack built on another marketplace, naming a skill that marketplace lacks", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)
    stubGetConfig(page, STORED_ID)

    // Seeded after a first visit: `localStorage` belongs to the served origin.
    await configure.saveStackDialog.seed([
      { name: SAVED_STACK, payload: DRIFTED_MARKETPLACE_PAYLOAD },
    ])
    await configure.goto()
  })

  // The control: applied from this browser's own configuration, nothing on it.
  test("names it when applied from this browser's own configuration", async ({
    configure,
  }) => {
    await configure.stack(SAVED_STACK).click()
    await expect(configure.skill(ACME.skill).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await expect(configure.importNotice).toContainText(RETIRED_SKILL_ID)
  })

  test("names it when applied over a link", async ({ configure, page }) => {
    await openTheLink(configure)

    await configure.stack(SAVED_STACK).click()
    await configure.stackSwitchDialog.confirm()
    await expect(page).toHaveURL("/editor/")
    await expect(configure.skill(ACME.skill).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await expect(configure.importNotice).toContainText(RETIRED_SKILL_ID)
  })
})
