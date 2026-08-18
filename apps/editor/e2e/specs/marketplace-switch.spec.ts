import {
  MARKETPLACE_REF,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_REF,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  BIGCO_CATALOG,
  BIGCO_REF,
  stubMarketplaceEstate,
} from "../support/marketplace"
import {
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  captureCreateConfig,
  stubGetConfig,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

// More than one marketplace, which the slot could not hold.
//
// A single `{ marketplace, token }` made "which marketplace is mine" and "which
// token do I have" the same fact, so saving a second marketplace overwrote the
// first — and a GitHub PAT is shown once and cannot be recovered. Keyed by
// marketplace, that loss is not guarded against, it is unrepresentable.
//
// The switcher is the other half: once a browser can hold two, it needs a way
// to say which one. Switching seats a different catalogue, which drops the
// skills the new one does not carry, so it asks first — with a dialog that
// names those skills rather than warning that something may change.

const ACME = {
  ref: MARKETPLACE_REF,
  skill: "Acme Widgets",
  otherSkill: "Acme Gateway",
} as const

const BIGCO = { ref: BIGCO_REF, skill: "Bigco Widgets" } as const

// The id behind that name, for the assertions that read a minted payload
// rather than the screen. Taken from the fixture rather than written out: the
// catalogue is a rename of Acme's, so the ids move together with it.
const [BIGCO_SKILL_ID] = Object.keys(BIGCO_CATALOG.skills) as [string]

// A skill only the vendored catalogue ships, so its presence names the public
// catalogue rather than counting what rendered.
const PUBLIC_SKILL = EXCLUSIVE_CATEGORY.first

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
  test.beforeEach(async ({ page }) => {
    await stubMarketplaceEstate(page)
  })

  // The row's own defect, stated as an assertion. Loading a second marketplace
  // used to write over the slot the first one's PAT was in.
  test("keeps the first marketplace's token when a second is loaded", async ({
    configure,
  }) => {
    await loadPrivateMarketplace(configure)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    expect(await configure.savedToken(PRIVATE_MARKETPLACE_REF)).toBe(
      MARKETPLACE_TOKEN
    )
    // Saved, and saved as needing no token — which is a different answer from
    // never having been saved at all.
    expect(await configure.savedToken(BIGCO.ref)).toBe("")
    expect(await configure.chosenMarketplace()).toBe(BIGCO.ref)
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

    expect(await configure.savedMarketplaceRefs()).toEqual(
      expect.arrayContaining([PRIVATE_MARKETPLACE_REF, BIGCO.ref])
    )
    expect(await configure.savedToken(PRIVATE_MARKETPLACE_REF)).toBe(
      MARKETPLACE_TOKEN
    )
  })

  // A switcher with one entry is furniture: there is nowhere else to go, and
  // the floating button already names where you are.
  test("offers no switcher until there is somewhere else to go", async ({
    configure,
  }) => {
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await expect(configure.marketplaceSwitcher).toBeHidden()

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await expect(configure.switchTo(ACME.ref)).toBeVisible()
    // Where you already are is not somewhere to switch to; the button beside
    // the switcher is the one that names it.
    await expect(configure.switchTo(BIGCO.ref)).toBeHidden()
    await expect(configure.marketplaceButton).toContainText(BIGCO.ref)
  })
})

test.describe("switching between saved marketplaces", () => {
  // Two saved, sitting on Acme with two of its skills picked — so there is
  // something concrete to lose and something concrete to name.
  test.beforeEach(async ({ configure, page }) => {
    await stubMarketplaceEstate(page)

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await configure.skill(ACME.skill).toggle()
    await configure.skill(ACME.otherSkill).toggle()
  })

  // The whole of the owner's ruling in one assertion: the description names
  // WHICH skills go, because that set is computable before the switch. A
  // dialog that said "your selection may change" is one people click through.
  test("names the skills the target does not carry", async ({ configure }) => {
    await configure.switchTo(BIGCO.ref).click()

    const { description } = configure.marketplaceSwitchDialog
    await expect(description).toContainText(BIGCO.ref)
    await expect(description).toContainText("2 of your 2 skills")
    await expect(description).toContainText(ACME.skill)
    await expect(description).toContainText(ACME.otherSkill)
  })

  test("switches nothing until the CTA is pressed", async ({ configure }) => {
    await configure.switchTo(BIGCO.ref).click()
    await expect(configure.marketplaceSwitchDialog.root).toBeVisible()

    // Reached WITHOUT the accessibility tree: the grid is `aria-hidden` while
    // a modal is over it — correct, and invisible to `getByRole` — so "the
    // catalogue underneath has not changed" is a question only a CSS locator
    // can ask, exactly as it is for the install sheet under a preview.
    //
    // The gateway rather than the widgets, because a cell carries its skill's
    // DESCRIPTION too and one of Acme's names another: "the library Acme
    // Widgets replaced" is a second cell matching that text.
    await expect(
      configure.skillCells.filter({ hasText: ACME.otherSkill })
    ).toHaveCount(1)
    expect(await configure.chosenMarketplace()).toBe(ACME.ref)
  })

  test("cancelling leaves the catalogue and the selection alone", async ({
    configure,
  }) => {
    await configure.switchTo(BIGCO.ref).click()
    await configure.marketplaceSwitchDialog.cancel()

    await expect(configure.marketplaceSwitchDialog.root).toBeHidden()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    expect(await configure.chosenMarketplace()).toBe(ACME.ref)
    await expect(configure.marketplaceButton).toContainText(ACME.ref)
  })

  test("the CTA seats the target and records the choice", async ({
    configure,
  }) => {
    await configure.switchTo(BIGCO.ref).click()
    await configure.marketplaceSwitchDialog.confirm()

    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await expect(configure.skill(ACME.skill).root).toBeHidden()
    await expect(configure.marketplaceButton).toContainText(BIGCO.ref)
    expect(await configure.chosenMarketplace()).toBe(BIGCO.ref)
  })

  // The dialog said the skills would be DROPPED. Coming back is what tells
  // dropped from merely hidden — a selection the grid stopped drawing would
  // still be selected on return, and would still be in the install list and in
  // any link shared from here.
  test("really drops the skills it said it would", async ({ configure }) => {
    await configure.switchTo(BIGCO.ref).click()
    await configure.marketplaceSwitchDialog.confirm()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await configure.switchTo(ACME.ref).click()
    await configure.marketplaceSwitchDialog.confirm()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.skill(ACME.skill).isSelected()).toBe(false)
    expect(await configure.skill(ACME.otherSkill).isSelected()).toBe(false)
  })

  // Switching to a catalogue that carries everything selected costs nothing,
  // and the dialog has to be able to say so — a warning that is always the same
  // sentence is not a description of anything.
  test("says a switch that carries everything loses nothing", async ({
    configure,
  }) => {
    await configure.switchTo(BIGCO.ref).click()
    await configure.marketplaceSwitchDialog.confirm()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    await configure.switchTo(ACME.ref).click()

    await expect(configure.marketplaceSwitchDialog.description).toContainText(
      "loses nothing"
    )
  })
})

// The other door to the same act, and the one that had neither the guard nor
// the sentence.
//
// `MarketplaceForm.submit()` seats a catalogue exactly as the CTA above does —
// so a selection the target cannot carry is dropped here too, and dropping it
// in silence is the whole defect the switcher exists to prevent rather than a
// smaller version of it. Naming and dropping travel together or the pairing
// means nothing: a door that drops without naming is the silent loss, and a
// door that names without dropping leaves ids in the install list and in every
// link minted from here that nothing on screen can explain.
test.describe("loading another marketplace from the dialog", () => {
  test.beforeEach(async ({ configure, page }) => {
    await stubMarketplaceEstate(page)

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await configure.skill(ACME.skill).toggle()
    await configure.skill(ACME.otherSkill).toggle()
  })

  // The switcher's ruling, said at this door in the switcher's own words.
  test("names the skills the load would drop, before it loads", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(BIGCO.ref)
    await configure.marketplaceDialog.load()

    const { consequence } = configure.marketplaceDialog
    await expect(consequence).toContainText(BIGCO.ref)
    await expect(consequence).toContainText("2 of your 2 skills")
    await expect(consequence).toContainText(ACME.skill)
    await expect(consequence).toContainText(ACME.otherSkill)
  })

  // Named BEFORE, which is the half a notice printed afterwards cannot buy:
  // the visitor is told what it costs while it still costs nothing.
  test("seats nothing on the press that reads the catalogue", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(BIGCO.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.marketplaceDialog.consequence).toContainText(
      "will drop"
    )

    await configure.marketplaceDialog.cancel()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    expect(await configure.chosenMarketplace()).toBe(ACME.ref)
    await expect(configure.marketplaceButton).toContainText(ACME.ref)
  })

  // Clearing the field seats a catalogue exactly as naming one does, and it is
  // the ONLY door to the public catalogue at all — the switcher lists what was
  // saved, and the public one is never saved. So it costs the selection exactly
  // as much, and has to say so in the same words.
  test("names what going back to the public catalogue costs", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill("")
    await configure.marketplaceDialog.load()

    const { consequence } = configure.marketplaceDialog
    await expect(consequence).toContainText("the public catalogue")
    await expect(consequence).toContainText(ACME.skill)
    await expect(consequence).toContainText(ACME.otherSkill)

    await configure.marketplaceDialog.load()

    // Really dropped rather than merely off the grid. Share reads the SELECTION
    // rather than the grid — it is disabled by an empty one — so a skill the
    // seated catalogue cannot place would still be holding it open.
    await expect(configure.skill(PUBLIC_SKILL).root).toBeVisible()
    await expect(configure.roster.shareButton).toBeDisabled()
  })

  // And the skills it named are gone rather than merely off the grid — the
  // same distinction `pruneToCatalog` was written for, asked of the door that
  // never called it.
  test("really drops the skills it said it would", async ({ configure }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(BIGCO.ref)
    await configure.marketplaceDialog.load()
    await configure.marketplaceDialog.load()

    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    expect(await configure.chosenMarketplace()).toBe(BIGCO.ref)

    await configure.switchTo(ACME.ref).click()
    await configure.marketplaceSwitchDialog.confirm()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.skill(ACME.skill).isSelected()).toBe(false)
    expect(await configure.skill(ACME.otherSkill).isSelected()).toBe(false)
  })
})

// A load that costs the selection nothing must not grow a second press. That
// is every first load of every session — and every spec written before this
// one, which is the strongest statement of it available.
test.describe("loading a marketplace with nothing selected", () => {
  test("loads on the press that asked for it", async ({ configure, page }) => {
    await stubMarketplaceEstate(page)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await expect(configure.marketplaceDialog.root).toBeHidden()
  })
})

// What the link actually installs, minted AFTER the catalogue moved.
//
// The suite's blind spot, and the reason this row survived it: every sharing
// spec mints against the catalogue it started on, so a payload that names one
// marketplace and carries another's ids is a shape no assertion could see. It
// is not a cosmetic mismatch — the CLI resolves these ids against the ref at
// the top of the payload, so the receiver installs a SUBSET and the sharer is
// never told.
test.describe("a payload minted after a catalogue change", () => {
  test.beforeEach(async ({ configure, page }) => {
    await stubMarketplaceEstate(page)

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await configure.skill(ACME.skill).toggle()
    await configure.skill(ACME.otherSkill).toggle()
  })

  // Driven end to end on the real CLI as `Warning: Skipped 1 skill(s) this
  // catalog does not know: bigco-web-ledger`. Read off the wire rather than off
  // the screen, because the grid draws only what the seated catalogue can place
  // — which is exactly what made this invisible.
  test("carries only ids the marketplace it names can resolve", async ({
    configure,
    page,
  }) => {
    const posted = await captureCreateConfig(page)

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
    expect(body!.marketplace).toBe(BIGCO.ref)
    expect(Object.keys(body!.skills as object)).toEqual([BIGCO_SKILL_ID])
  })

  // The same payload's other half. `useInstallCommand` memoises the serialised
  // payload on the SELECTION alone, while `toSeedPayload` reads the seated
  // marketplace and version — so a catalogue that moved under an unchanged
  // selection stamps the ref the ids were picked on rather than the one they
  // will be resolved against.
  test("stamps the catalogue that is seated, not the one it was left on", async ({
    configure,
    page,
  }) => {
    const posted = await captureCreateConfig(page)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(BIGCO.ref)
    await configure.marketplaceDialog.load()
    await configure.marketplaceDialog.load()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await configure.skill(BIGCO.skill).toggle()

    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()

    const body = posted.at(-1)
    expect(body!.marketplace).toBe(BIGCO.ref)
    expect(body!.matrixVersion).toBe(BIGCO_CATALOG.version)
  })
})

// EDITOR-37 stands: a shared address SEATS a marketplace without storing it.
// The switcher is a new way to observe that, and a stricter one — it lists what
// the visitor saved, so a link that quietly stored its own would show up here as
// an entry nobody chose.
test.describe("a shared address", () => {
  // Saved the way a visitor saves — two marketplaces loaded by hand, one of
  // them private and paid for with a PAT — rather than written into storage.
  // The shape of the slot is what this row changes, so a spec that seeds it
  // would be asserting against its own copy of the answer.
  test.beforeEach(async ({ configure, page }) => {
    await stubMarketplaceEstate(page)
    await stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)

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
    expect(await configure.savedMarketplaceRefs()).toEqual(
      expect.arrayContaining([PRIVATE_MARKETPLACE_REF, BIGCO.ref])
    )
    expect(await configure.savedToken(ACME.ref)).toBeNull()
    await expect(configure.switchTo(ACME.ref)).toBeHidden()
  })

  // The half of EDITOR-38 that was deliberately left unbuilt: on a shared
  // address, pressing Load could destroy the visitor's stored PAT, because the
  // slot held exactly one. It cannot now — a load files its token under its own
  // marketplace, and no other key is reachable from here.
  test("cannot cost the visitor a stored PAT, whatever is loaded from it", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    expect(await configure.savedToken(PRIVATE_MARKETPLACE_REF)).toBe(
      MARKETPLACE_TOKEN
    )
    expect(await configure.savedToken(ACME.ref)).toBe("")
  })

  // A token AUTHORIZES one repository and identifies none, so it has no
  // business being presented to another — and a link chooses the marketplace,
  // which is what made the single slot's "whatever token I hold" reachable by
  // anyone who could send a URL.
  test("sends no token to a marketplace it holds none for", async ({
    configure,
    page,
  }) => {
    // Registered after the marketplaces above were loaded, so what it records
    // is this navigation and nothing before it. Playwright matches the most
    // recently added route first.
    const authorizations = await stubMarketplaceEstate(page)

    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    expect(authorizations).toEqual([null])
  })
})

// The deploy that lands the keyed shape meets browsers holding the single slot.
// Reading one as unreadable would discard it — the marketplace and the PAT
// both, invisibly, by the same discard path that exists to be safe.
test.describe("a browser upgrading from the single slot", () => {
  test("carries the marketplace and its token into the keyed shape", async ({
    configure,
    page,
  }) => {
    await stubMarketplaceEstate(page)
    await configure.seedLegacySlot(PRIVATE_MARKETPLACE_REF, MARKETPLACE_TOKEN)

    await page.reload()

    // The catalogue loads, which is only possible if the PAT came through: the
    // private marketplace 404s anyone who asks without it.
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.chosenMarketplace()).toBe(PRIVATE_MARKETPLACE_REF)
    expect(await configure.savedToken(PRIVATE_MARKETPLACE_REF)).toBe(
      MARKETPLACE_TOKEN
    )
  })
})
