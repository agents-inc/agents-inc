import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_CANONICAL_REF,
  PRIVATE_MARKETPLACE_REF,
  freshlyPickedSkill,
  projectMintedPayload,
  projectOwnSkill,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  BIGCO_CANONICAL_REF,
  BIGCO_CATALOG,
  BIGCO_REF,
  stubMarketplaceEstate,
} from "../support/marketplace"
import {
  ACME_SKILL_ID,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  STORED_ID,
  captureCreateConfig,
  stubGetConfig,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

// `ref` is typed; `stored` is what the slot holds and the switcher lists.
const ACME = {
  ref: MARKETPLACE_REF,
  stored: MARKETPLACE_CANONICAL_REF,
  skill: "Acme Widgets",
  otherSkill: "Acme Gateway",
} as const

const BIGCO = {
  ref: BIGCO_REF,
  stored: BIGCO_CANONICAL_REF,
  skill: "Bigco Widgets",
} as const

// The id behind that name; the cast holds because the fixture catalogue is
// non-empty.
const [BIGCO_SKILL_ID] = Object.keys(BIGCO_CATALOG.skills) as [string]

// Only the vendored catalogue ships it, so its presence names the public
// catalogue.
const PUBLIC_SKILL = EXCLUSIVE_CATEGORY.first

const ACME_STACK = "Acme House Stack"

// Mirrored, not imported: a rendering assertion keeps its literal.
const OPENS_ITS_OWN = "opens the configuration saved with it, or a new one."
const staysSavedWith = (marketplace: string) =>
  `This one stays saved with ${marketplace} and reopens when you load it again.`
const LINK_NOT_SAVED =
  "This shared one is not saved here; its link still opens it."
// What a load said while it cleared the configuration saved in this browser.
const OVER_THE_SAVED_ONE = "and so will the one saved in this browser"

const loadMarketplace = async (configure: ConfigurePage, ref: string) => {
  await configure.marketplaceButton.click()
  await configure.marketplaceDialog.fill(ref)
  await configure.marketplaceDialog.load()
}

const loadPrivateMarketplace = async (configure: ConfigurePage) => {
  await configure.marketplaceButton.click()
  await configure.marketplaceDialog.fill(PRIVATE_MARKETPLACE_REF)
  await configure.marketplaceDialog.load()
  await expect(configure.marketplaceDialog.tokenInput).toBeVisible()
  await configure.marketplaceDialog.fillToken(MARKETPLACE_TOKEN)
  await configure.marketplaceDialog.load()
}

test.describe("a browser that has saved more than one marketplace", () => {
  test.beforeEach(({ page }) => {
    stubMarketplaceEstate(page)
  })

  test("keeps the first marketplace's token when a second is loaded", async ({
    configure,
  }) => {
    await loadPrivateMarketplace(configure)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    expect(await configure.savedToken(PRIVATE_MARKETPLACE_CANONICAL_REF)).toBe(
      MARKETPLACE_TOKEN
    )
    // Saved needing no token, which differs from never saved.
    expect(await configure.savedToken(BIGCO.stored)).toBe("")
    expect(await configure.chosenMarketplace()).toBe(BIGCO.stored)
  })

  test("both survive a reload, tokens included", async ({
    configure,
    page,
  }) => {
    await loadPrivateMarketplace(configure)
    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await page.reload()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    expect(await configure.savedMarketplaceRefs()).toStrictEqual(
      expect.arrayContaining([PRIVATE_MARKETPLACE_CANONICAL_REF, BIGCO.stored])
    )
    expect(await configure.savedToken(PRIVATE_MARKETPLACE_CANONICAL_REF)).toBe(
      MARKETPLACE_TOKEN
    )
  })

  test("is one saved marketplace however the repository was spelled", async ({
    configure,
  }) => {
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await loadMarketplace(configure, ACME.stored)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    expect(await configure.savedMarketplaceRefs()).toStrictEqual([ACME.stored])
    await expect(configure.marketplaceSwitcher).toBeHidden()
  })

  test("offers no switcher until there is somewhere else to go", async ({
    configure,
  }) => {
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await expect(configure.marketplaceSwitcher).toBeHidden()

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await expect(configure.switchTo(ACME.stored)).toBeVisible()
    await expect(configure.switchTo(BIGCO.stored)).toBeHidden()
    await expect(configure.marketplaceButton).toContainText(BIGCO.ref)
  })
})

test.describe("switching between saved marketplaces", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await configure.skill(ACME.skill).toggle()
    await configure.skill(ACME.otherSkill).toggle()
  })

  // Another marketplace opens its own configuration; this one stays saved
  // with its marketplace.
  test("says the selection stays saved with its marketplace", async ({
    configure,
  }) => {
    await configure.switchTo(BIGCO.stored).click()

    const { description } = configure.marketplaceSwitchDialog
    await expect(description).toContainText(BIGCO.ref)
    await expect(description).toContainText(OPENS_ITS_OWN)
    await expect(description).toContainText(staysSavedWith(ACME.stored))
  })

  test("switches nothing until the CTA is pressed", async ({ configure }) => {
    await configure.switchTo(BIGCO.stored).click()
    await expect(configure.marketplaceSwitchDialog.root).toBeVisible()

    // By CSS, not role: the grid is `aria-hidden` under the modal. The gateway
    // rather than the widgets, because a cell also carries its description.
    await expect(
      configure.skillCells.filter({ hasText: ACME.otherSkill })
    ).toHaveCount(1)
    expect(await configure.chosenMarketplace()).toBe(ACME.stored)
  })

  test("cancelling leaves the catalogue and the selection alone", async ({
    configure,
  }) => {
    await configure.switchTo(BIGCO.stored).click()
    await configure.marketplaceSwitchDialog.cancel()

    await expect(configure.marketplaceSwitchDialog.root).toBeHidden()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    expect(await configure.chosenMarketplace()).toBe(ACME.stored)
    await expect(configure.marketplaceButton).toContainText(ACME.ref)
  })

  test("the CTA seats the target and records the choice", async ({
    configure,
  }) => {
    await configure.switchTo(BIGCO.stored).click()
    await configure.marketplaceSwitchDialog.confirm()

    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await expect(configure.skill(ACME.skill).root).toBeHidden()
    await expect(configure.marketplaceButton).toContainText(BIGCO.ref)
    expect(await configure.chosenMarketplace()).toBe(BIGCO.stored)
  })

  // Coming back tells kept from merely hidden.
  test("keeps the selection with its marketplace, to come back to", async ({
    configure,
  }) => {
    await configure.switchTo(BIGCO.stored).click()
    await configure.marketplaceSwitchDialog.confirm()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await configure.switchTo(ACME.stored).click()
    await configure.marketplaceSwitchDialog.confirm()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    expect(await configure.skill(ACME.otherSkill).isSelected()).toBe(true)
  })

  test("says a switch with nothing selected loses nothing", async ({
    configure,
  }) => {
    await configure.switchTo(BIGCO.stored).click()
    await configure.marketplaceSwitchDialog.confirm()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await configure.switchTo(ACME.stored).click()

    await expect(configure.marketplaceSwitchDialog.description).toContainText(
      "loses nothing"
    )
  })
})

// The dialog seats a catalogue exactly as the switcher does, so it must say
// and keep the same way.
test.describe("loading another marketplace from the dialog", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await configure.skill(ACME.skill).toggle()
    await configure.skill(ACME.otherSkill).toggle()
  })

  test("says where the selection stays, before it loads", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(BIGCO.ref)
    await configure.marketplaceDialog.load()

    const { consequence } = configure.marketplaceDialog
    await expect(consequence).toContainText(BIGCO.ref)
    await expect(consequence).toContainText(OPENS_ITS_OWN)
    await expect(consequence).toContainText(staysSavedWith(ACME.stored))
  })

  // Named before: the visitor is told the cost while it still costs nothing.
  test("seats nothing on the press that reads the catalogue", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(BIGCO.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.marketplaceDialog.consequence).toContainText(
      OPENS_ITS_OWN
    )

    await configure.marketplaceDialog.cancel()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    expect(await configure.chosenMarketplace()).toBe(ACME.stored)
    await expect(configure.marketplaceButton).toContainText(ACME.ref)
  })

  // Clearing the field is the only door to the public catalogue, so it must
  // name the cost too.
  test("names what going back to the public catalogue costs", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill("")
    await configure.marketplaceDialog.load()

    const { consequence } = configure.marketplaceDialog
    await expect(consequence).toContainText("the public catalogue")
    await expect(consequence).toContainText(OPENS_ITS_OWN)

    await configure.marketplaceDialog.load()

    // Share reads the selection, not the grid, so a dropped skill would still
    // hold it open.
    await expect(configure.skill(PUBLIC_SKILL).root).toBeVisible()
    await expect(configure.roster.shareButton).toBeDisabled()
  })

  test("keeps the selection with its marketplace, to come back to", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(BIGCO.ref)
    await configure.marketplaceDialog.load()
    await configure.marketplaceDialog.load()

    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    expect(await configure.chosenMarketplace()).toBe(BIGCO.stored)

    await configure.switchTo(ACME.stored).click()
    await configure.marketplaceSwitchDialog.confirm()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    expect(await configure.skill(ACME.otherSkill).isSelected()).toBe(true)
  })
})

// Another marketplace opens its own configuration, and the one on screen stays
// saved with its marketplace, every kind of choice included.
test.describe("another marketplace beside a configuration with every kind of choice", () => {
  // A stack (its skills and its sub-agents), and an option on a skill then set
  // aside, so every kind of choice is there to keep.
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await configure.chooseStack(ACME_STACK)
    await configure.skill(ACME.otherSkill).setScope("project")
    await configure.skill(ACME.otherSkill).toggle()

    const before = await configure.storedSelection(ACME.stored)
    expect(before?.stackId).not.toBeNull()
    expect(before?.skills).not.toStrictEqual({})
    expect(before?.remembered).not.toStrictEqual({})
    expect(before?.agents).not.toStrictEqual({})
  })

  // Share reads the selection, not the grid.
  test("opens the other with nothing chosen, and keeps every choice saved with this one", async ({
    configure,
  }) => {
    const before = await configure.storedSelection(ACME.stored)

    await loadMarketplace(configure, BIGCO.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await expect(configure.roster.shareButton).toBeDisabled()
    expect(await configure.storedSelection(ACME.stored)).toStrictEqual(before)
  })

  test("does the same from the switcher", async ({ configure }) => {
    const before = await configure.storedSelection(ACME.stored)

    await configure.switchTo(BIGCO.stored).click()
    await configure.marketplaceSwitchDialog.confirm()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await expect(configure.roster.shareButton).toBeDisabled()
    expect(await configure.storedSelection(ACME.stored)).toStrictEqual(before)
  })

  // Coming back tells kept from merely hidden.
  test("keeps all of it to come back to", async ({ configure }) => {
    await loadMarketplace(configure, BIGCO.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await configure.skill(ACME.otherSkill).toggle()

    await expect(configure.stack(ACME_STACK)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    await expect(
      configure.skill(ACME.otherSkill).scopeCell("project")
    ).toHaveAttribute("aria-checked", "true")
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "true")
  })

  // The control: the marketplace already on screen keeps every choice.
  test("keeps it all when the marketplace on screen is loaded again", async ({
    configure,
  }) => {
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.marketplaceDialog.root).toBeHidden()
    await configure.skill(ACME.otherSkill).toggle()

    await expect(configure.stack(ACME_STACK)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    await expect(
      configure.skill(ACME.otherSkill).scopeCell("project")
    ).toHaveAttribute("aria-checked", "true")
    await expect(
      configure.roster.agentButton("web", "developer")
    ).toHaveAttribute("aria-pressed", "true")
  })

  test("opens again after a reload, on the marketplace it loaded", async ({
    configure,
    page,
  }) => {
    await loadMarketplace(configure, BIGCO.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await page.reload()

    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await expect(configure.marketplaceButton).toContainText(BIGCO.ref)
    expect(await configure.chosenMarketplace()).toBe(BIGCO.stored)
    await expect(configure.roster.shareButton).toBeDisabled()
  })
})

// A refresh continues where the visitor left off, on a marketplace showing
// only its own skills.
test.describe("a refresh after loading a marketplace", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)

    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await configure.skill(ACME.skill).toggle()

    await loadMarketplace(configure, BIGCO.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await configure.skill(BIGCO.skill).toggle()
  })

  test("continues on the marketplace and the selection it left off at", async ({
    configure,
    page,
  }) => {
    await page.reload()

    await expect(configure.marketplaceButton).toContainText(BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("shows only that marketplace's skills, before and after", async ({
    configure,
    page,
  }) => {
    await expect(configure.skill(ACME.skill).root).toBeHidden()
    await expect(configure.skill(PUBLIC_SKILL).root).toBeHidden()

    await page.reload()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await expect(configure.skill(ACME.skill).root).toBeHidden()
    await expect(configure.skill(PUBLIC_SKILL).root).toBeHidden()
  })
})

// A bare `edit` run inside a project mints a link holding the global install's
// entries, which the editor draws held. A new configuration holds none of them.
test.describe("another marketplace over a link made inside a project", () => {
  const LINK_ID = "ProjMkt1"
  const REACT_ID = "web-framework-react"
  const HONO_ID = "api-framework-hono"
  const API_DEV = "api-developer"

  const projectLink = () =>
    projectMintedPayload(
      {
        [REACT_ID]: freshlyPickedSkill(REACT_ID),
        [HONO_ID]: projectOwnSkill([API_DEV]),
      },
      [API_DEV]
    )

  const react = (configure: ConfigurePage) =>
    configure.skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, PUBLIC_SKILL)

  // The channel: on the link, its global skill is drawn held.
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)
    stubGetConfig(page, LINK_ID, projectLink())

    await page.goto(`/?fromId=${LINK_ID}`)
    await expect(react(configure).root).toHaveAttribute("aria-disabled", "true")

    await loadMarketplace(configure, ACME.ref)
  })

  // The link's configuration is saved nowhere in this browser.
  test("asks first, saying the link's configuration is not saved", async ({
    configure,
  }) => {
    const { consequence } = configure.marketplaceDialog
    await expect(consequence).toContainText(OPENS_ITS_OWN)
    await expect(consequence).toContainText(LINK_NOT_SAVED)
    await expect(consequence).not.toContainText(OVER_THE_SAVED_ONE)
  })

  test("leaves the link's address for a configuration of this browser's own", async ({
    configure,
    page,
  }) => {
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await configure.skill(ACME.skill).toggle()

    await expect(page).toHaveURL("/editor/")
    expect(await configure.storedConfig(ACME.stored)).toContain(ACME_SKILL_ID)
  })

  test("keeps none of what the link held", async ({ configure }) => {
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await loadMarketplace(configure, "")
    await expect(react(configure).root).toHaveAttribute("aria-pressed", "false")

    // Picked again, it is this configuration's own: free to switch off.
    await react(configure).toggle()
    await expect(react(configure).root).not.toHaveAttribute(
      "aria-disabled",
      "true"
    )
    await react(configure).toggle()
    await expect(react(configure).root).toHaveAttribute("aria-pressed", "false")
  })

  test("opens the new configuration after a reload, not the link", async ({
    configure,
    page,
  }) => {
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await configure.skill(ACME.skill).toggle()

    await page.reload()

    await expect(configure.skill(ACME.skill).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(page).toHaveURL("/editor/")
    expect(await configure.chosenMarketplace()).toBe(ACME.stored)
  })
})

// The link's notice promises the visitor's own configuration is untouched, and
// a load from the link keeps that promise.
test.describe("another marketplace over a shared link, beside this browser's own", () => {
  // A sibling of what the link carries, in a category that takes one.
  const own = (configure: ConfigurePage) =>
    configure.skillIn(
      DOMAINS.web,
      EXCLUSIVE_CATEGORY.name,
      EXCLUSIVE_CATEGORY.second
    )

  // What the visitor saved before the link opened.
  let saved = ""

  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)
    stubGetConfig(page, STORED_ID)

    await own(configure).toggle()
    saved = await configure.storedConfig()
    expect(saved).not.toBe("")

    await page.goto(`/?fromId=${STORED_ID}`)
    await expect(own(configure).root).toHaveAttribute("aria-pressed", "false")

    await loadMarketplace(configure, ACME.ref)
  })

  test("asks first, without a word about clearing the visitor's own", async ({
    configure,
  }) => {
    const { consequence } = configure.marketplaceDialog
    await expect(consequence).toContainText(LINK_NOT_SAVED)
    await expect(consequence).not.toContainText(OVER_THE_SAVED_ONE)
  })

  test("leaves the visitor's own saved configuration as it was", async ({
    configure,
  }) => {
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    expect(await configure.storedConfig()).toBe(saved)
  })

  test("reopens it, untouched, when its marketplace is loaded again", async ({
    configure,
  }) => {
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await loadMarketplace(configure, "")

    await expect(own(configure).root).toHaveAttribute("aria-pressed", "true")
  })
})

// A load that costs nothing must not grow a second press.
test.describe("loading a marketplace with nothing selected", () => {
  test("loads on the press that asked for it", async ({ configure, page }) => {
    stubMarketplaceEstate(page)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await expect(configure.marketplaceDialog.root).toBeHidden()
  })
})

// Minted after the catalogue moved: the payload must name the seated
// marketplace and only its ids.
test.describe("a payload minted after a catalogue change", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await configure.skill(ACME.skill).toggle()
    await configure.skill(ACME.otherSkill).toggle()
  })

  // Read off the wire: the grid draws only what the seated catalogue can place.
  test("carries only ids the marketplace it names can resolve", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(BIGCO.ref)
    await configure.marketplaceDialog.load()
    await configure.marketplaceDialog.load()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await configure.skill(BIGCO.skill).toggle()

    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()

    const body = posted.at(-1)
    expect(body).toBeDefined()
    expect(body!.marketplace).toBe(BIGCO.stored)
    expect(Object.keys(body!.skills as object)).toStrictEqual([BIGCO_SKILL_ID])
  })

  // `useInstallCommand` memoises on the selection, while the payload's ref
  // comes from the seat.
  test("stamps the catalogue that is seated, not the one it was left on", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(BIGCO.ref)
    await configure.marketplaceDialog.load()
    await configure.marketplaceDialog.load()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await configure.skill(BIGCO.skill).toggle()

    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()

    const body = posted.at(-1)
    expect(body!.marketplace).toBe(BIGCO.stored)
    expect(body!.matrixVersion).toBe(BIGCO_CATALOG.version)
  })
})

// A shared address seats a marketplace without storing it; the switcher lists
// only saved ones.
test.describe("a shared address", () => {
  // Saved by hand rather than seeded: the slot's shape is what is under test.
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)

    await loadPrivateMarketplace(configure)
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
  })

  test("seats its marketplace without joining the switcher", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await expect(configure.marketplaceButton).toContainText(ACME.ref)
    expect(await configure.savedMarketplaceRefs()).toStrictEqual(
      expect.arrayContaining([PRIVATE_MARKETPLACE_CANONICAL_REF, BIGCO.stored])
    )
    expect(await configure.savedToken(ACME.stored)).toBeNull()
    await expect(configure.switchTo(ACME.stored)).toBeHidden()
  })

  test("cannot cost the visitor a stored PAT, whatever is loaded from it", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    expect(await configure.savedToken(PRIVATE_MARKETPLACE_CANONICAL_REF)).toBe(
      MARKETPLACE_TOKEN
    )
    expect(await configure.savedToken(ACME.stored)).toBe("")
  })

  test("sends no token to a marketplace it holds none for", async ({
    configure,
    page,
  }) => {
    // After the loads above: Playwright matches the most recently added route
    // first.
    const authorizations = stubMarketplaceEstate(page)

    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    expect(authorizations).toStrictEqual([null])
  })
})

test.describe("a browser upgrading from the single slot", () => {
  test("carries the marketplace and its token into the keyed shape", async ({
    configure,
    page,
  }) => {
    stubMarketplaceEstate(page)
    await configure.seedLegacySlot(PRIVATE_MARKETPLACE_REF, MARKETPLACE_TOKEN)

    await page.reload()

    // Loading proves the PAT came through: the private marketplace 404s without
    // it.
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.chosenMarketplace()).toBe(
      PRIVATE_MARKETPLACE_CANONICAL_REF
    )
    expect(await configure.savedToken(PRIVATE_MARKETPLACE_CANONICAL_REF)).toBe(
      MARKETPLACE_TOKEN
    )
  })

  // A keyed slot from before normalisation: its entry is re-keyed, token
  // included.
  test("re-keys a saved marketplace without dropping its token", async ({
    configure,
    page,
  }) => {
    stubMarketplaceEstate(page)
    await configure.seedUnnormalisedSlot(
      PRIVATE_MARKETPLACE_REF,
      MARKETPLACE_TOKEN
    )

    await page.reload()

    // Loaded, which the private marketplace only answers to the PAT for.
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.savedMarketplaceRefs()).toStrictEqual([
      PRIVATE_MARKETPLACE_CANONICAL_REF,
    ])
    expect(await configure.savedToken(PRIVATE_MARKETPLACE_CANONICAL_REF)).toBe(
      MARKETPLACE_TOKEN
    )
  })
})
