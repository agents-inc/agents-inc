import {
  CATALOG_URL,
  catalogUnauthorizedHandler,
  catalogUnreachableHandler,
  githubNotFound,
  malformedCatalogHandler,
} from "@workspace/api-mocks"
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
import { HttpResponse, http } from "msw"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import {
  BIGCO_CANONICAL_REF,
  BIGCO_CATALOG,
  BIGCO_REF,
  stubMarketplaceEstate,
} from "../support/marketplace"
import { stubWith } from "../support/stub"
import {
  ACME_SKILL_ID,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  STORED_ID,
  captureCreateConfig,
  stubGetConfig,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"
import type { Page } from "@playwright/test"
import type { RequestHandler } from "msw"

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
// The two halves of what a switch that drops nothing says.
const LOSES_NOTHING = "loses nothing"
const CARRIES_THE_SELECTION = "carries every skill you have selected"

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

    const { description } = configure.marketplaceSwitchDialog
    await expect(description).toContainText(LOSES_NOTHING)
    await expect(description).toContainText(CARRIES_THE_SELECTION)
  })
})

// What a refused switch says. Mirrored, not imported.
const NOTHING_CHANGED = /nothing has changed/i
// Opening the description, or after a sentence that has ended: never run on
// from the cause.
const AFTER_A_FINISHED_SENTENCE = /(^|[.!?]\s+)nothing has changed/i
const ENDS_A_SENTENCE = /[.!?]$/
// Where a token is typed: the Marketplace dialog's credential field.
const POINTS_AT_THE_TOKEN = /load it from Marketplace/i
const MENTIONS_A_TOKEN = /token/i

// Every description of a target that was read opens this way.
const READ_TARGET = `Switching to ${BIGCO.stored}`

const FORBIDDEN = 403
const SERVER_ERROR = 500

type Refusal = {
  refusal: string
  answer: RequestHandler
  // A phrase of the cause `fetchCatalog` names, so the refusal has landed.
  names: string
}

// 401, 403 and 404: the statuses a token can change.
const REFUSALS_A_TOKEN_CAN_LIFT: Refusal[] = [
  {
    refusal: "a 404, as GitHub gives for a private repository",
    answer: http.get(CATALOG_URL, githubNotFound),
    names: `${BIGCO.ref} could not be read (404)`,
  },
  {
    refusal: "a 401, as GitHub gives for a token it no longer takes",
    answer: catalogUnauthorizedHandler,
    names: `${BIGCO.ref} could not be read (401)`,
  },
  {
    refusal: "a 403",
    answer: http.get(
      CATALOG_URL,
      () => new HttpResponse(null, { status: FORBIDDEN })
    ),
    names: `${BIGCO.ref} could not be read (403)`,
  },
]

// The same answer comes back however the request is authorized.
const REFUSALS_NO_TOKEN_LIFTS: Refusal[] = [
  {
    refusal: "no answer at all",
    answer: catalogUnreachableHandler,
    names: `${BIGCO.ref} is unreachable`,
  },
  {
    refusal: "a server error",
    answer: http.get(
      CATALOG_URL,
      () => new HttpResponse(null, { status: SERVER_ERROR })
    ),
    names: `${BIGCO.ref} could not be read (500)`,
  },
  {
    refusal: "a catalogue that will not parse",
    answer: malformedCatalogHandler,
    names: `${BIGCO.ref} published an unreadable catalog.json`,
  },
]

// The dialog reads the target before it offers the switch, so a saved
// marketplace that can no longer be read is refused there. One sentence per
// cause, and a token only where a token could change the answer.
test.describe("what the switch dialog says before it can switch", () => {
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)

    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()
  })

  test("says it is reading the target, and offers no switch until it has", async ({
    configure,
    page,
  }) => {
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    stubWith(page, [
      http.get(CATALOG_URL, async () => {
        await released
        return HttpResponse.json(BIGCO_CATALOG)
      }),
    ])

    await configure.switchTo(BIGCO.stored).click()
    const dialog = configure.marketplaceSwitchDialog

    await expect(dialog.description).toHaveText(
      new RegExp(`^Reading .*${BIGCO.ref}…$`)
    )
    await expect(dialog.confirmButton).toBeHidden()

    release()

    await expect(dialog.description).toContainText(READ_TARGET)
    await expect(dialog.confirmButton).toBeVisible()
  })

  for (const { refusal, answer, names } of [
    ...REFUSALS_A_TOKEN_CAN_LIFT,
    ...REFUSALS_NO_TOKEN_LIFTS,
  ]) {
    test(`says ${refusal} in a sentence of its own`, async ({
      configure,
      page,
    }) => {
      stubWith(page, [answer])

      await configure.switchTo(BIGCO.stored).click()

      const { description } = configure.marketplaceSwitchDialog
      await expect(description).toContainText(names)
      await expect(description).toContainText(NOTHING_CHANGED)
      await expect(description).toHaveText(AFTER_A_FINISHED_SENTENCE)
      await expect(description).toHaveText(ENDS_A_SENTENCE)
    })
  }

  for (const { refusal, answer, names } of REFUSALS_A_TOKEN_CAN_LIFT) {
    test(`offers a token for ${refusal}`, async ({ configure, page }) => {
      stubWith(page, [answer])

      await configure.switchTo(BIGCO.stored).click()

      const { description } = configure.marketplaceSwitchDialog
      await expect(description).toContainText(names)
      await expect(description).toContainText(POINTS_AT_THE_TOKEN)
    })
  }

  for (const { refusal, answer, names } of REFUSALS_NO_TOKEN_LIFTS) {
    test(`offers no token for ${refusal}`, async ({ configure, page }) => {
      stubWith(page, [answer])

      await configure.switchTo(BIGCO.stored).click()

      const { description } = configure.marketplaceSwitchDialog
      await expect(description).toContainText(names)
      await expect(description).not.toContainText(MENTIONS_A_TOKEN)
    })
  }

  // The refusal is what a screen reader hears on opening.
  test("announces the refusal as the dialog's description", async ({
    configure,
    page,
  }) => {
    stubWith(page, [catalogUnreachableHandler])

    await configure.switchTo(BIGCO.stored).click()

    await expect(
      configure.marketplaceSwitchDialog.root
    ).toHaveAccessibleDescription(new RegExp(`${BIGCO.ref} is unreachable`))
  })

  test("offers no switch, and Cancel leaves the catalogue and the choice alone", async ({
    configure,
    page,
  }) => {
    stubWith(page, [catalogUnreachableHandler])

    await configure.switchTo(BIGCO.stored).click()
    const dialog = configure.marketplaceSwitchDialog
    await expect(dialog.description).toContainText(
      `${BIGCO.ref} is unreachable`
    )

    await expect(dialog.confirmButton).toBeHidden()

    await dialog.cancel()

    await expect(dialog.root).toBeHidden()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await expect(configure.marketplaceButton).toContainText(ACME.ref)
    expect(await configure.chosenMarketplace()).toBe(ACME.stored)
  })

  // Not a refusal remembered: the next press reads the marketplace again.
  test("reads it again on the next press, and switches once it answers", async ({
    configure,
    page,
  }) => {
    let refusing = true
    stubWith(page, [
      http.get(CATALOG_URL, () =>
        refusing ? HttpResponse.error() : undefined
      ),
    ])

    await configure.switchTo(BIGCO.stored).click()
    const dialog = configure.marketplaceSwitchDialog
    await expect(dialog.description).toContainText(
      `${BIGCO.ref} is unreachable`
    )
    await dialog.cancel()
    await expect(dialog.root).toBeHidden()

    refusing = false
    await configure.switchTo(BIGCO.stored).click()

    await expect(dialog.description).toContainText(READ_TARGET)
    await dialog.confirm()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    expect(await configure.chosenMarketplace()).toBe(BIGCO.stored)
  })
})

// Refuses every read of `marketplace` until the spec lifts it; every other
// repository falls through to the estate. Returns the lift.
const refuseUntilLifted = (page: Page, marketplace: string) => {
  let refusing = true
  stubWith(page, [
    http.get<{ owner: string; repo: string }>(CATALOG_URL, ({ params }) =>
      refusing && `${params.owner}/${params.repo}` === marketplace
        ? HttpResponse.error()
        : undefined
    ),
  ])

  return () => {
    refusing = false
  }
}

// Opened once the target is read: Switch is offered only then, so the
// description is no longer "Reading …".
const openReadSwitchTo = async (configure: ConfigurePage, stored: string) => {
  await configure.switchTo(stored).click()
  await expect(configure.marketplaceSwitchDialog.confirmButton).toBeVisible()
}

// What was parked on a marketplace that would not load replaces the screen
// when a switch reaches that marketplace, so the switch never says it loses
// nothing. With nothing parked it does: "says a switch with nothing selected
// loses nothing", which proves the channel these negatives read.
test.describe("switching to the marketplace a parked link waits on", () => {
  // Acme and Bigco saved, Bigco chosen. The link names Acme, which refuses it
  // until lifted; a pick is made on the link's screen.
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)

    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await loadMarketplace(configure, BIGCO.ref)
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()

    const lift = refuseUntilLifted(page, ACME.ref)
    await configure.goto(`?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.marketplaceDialog.root).toBeVisible()
    await configure.marketplaceDialog.cancel()
    await expect(configure.importNotice).toContainText(ACME.ref)

    await configure.skill(PUBLIC_SKILL).toggle()
    expect(await configure.skill(PUBLIC_SKILL).isSelected()).toBe(true)
    lift()
  })

  test("does not say the switch loses nothing", async ({ configure }) => {
    await openReadSwitchTo(configure, ACME.stored)

    const { description } = configure.marketplaceSwitchDialog
    await expect(description).toContainText(ACME.ref)
    await expect(description).not.toContainText(LOSES_NOTHING)
    await expect(description).not.toContainText(CARRIES_THE_SELECTION)
    await expect(description).toHaveText(ENDS_A_SENTENCE)
  })

  // The control: the link's own pick, which Acme's saved configuration does
  // not hold, so this is the recovery and not another marketplace's opening.
  test("finishes the link on the CTA", async ({ configure }) => {
    await openReadSwitchTo(configure, ACME.stored)
    await configure.marketplaceSwitchDialog.confirm()

    await expect(configure.skill(ACME.skill).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})

test.describe("switching to the marketplace a parked stack waits on", () => {
  const SAVED_STACK = "Weekday"

  // Acme saved with a pick of its own, Bigco chosen with one. A saved stack
  // built on Acme is applied while Acme refuses it, then the refusal lifts.
  test.beforeEach(async ({ configure, page }) => {
    stubMarketplaceEstate(page)

    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await configure.skill(ACME.otherSkill).toggle()
    await loadMarketplace(configure, BIGCO.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(BIGCO.skill).root).toBeVisible()
    await configure.skill(BIGCO.skill).toggle()

    await configure.saveStackDialog.seed([
      { name: SAVED_STACK, payload: MARKETPLACE_PAYLOAD },
    ])
    const lift = refuseUntilLifted(page, ACME.ref)
    await configure.goto()
    await expect(configure.skill(BIGCO.skill).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await configure.stack(SAVED_STACK).click()
    await configure.stackSwitchDialog.confirm()
    await expect(configure.marketplaceDialog.root).toBeVisible()
    await configure.marketplaceDialog.cancel()
    await expect(configure.importNotice).toContainText(ACME.ref)
    lift()
  })

  test("does not say the switch loses nothing", async ({ configure }) => {
    await openReadSwitchTo(configure, ACME.stored)

    const { description } = configure.marketplaceSwitchDialog
    await expect(description).toContainText(ACME.ref)
    await expect(description).not.toContainText(LOSES_NOTHING)
    await expect(description).not.toContainText(CARRIES_THE_SELECTION)
    await expect(description).toHaveText(ENDS_A_SENTENCE)
  })

  // The control: the stack in place of Acme's own saved pick, so this is the
  // recovery and not another marketplace's opening.
  test("applies the stack on the CTA, over Acme's own saved pick", async ({
    configure,
  }) => {
    await openReadSwitchTo(configure, ACME.stored)
    await configure.marketplaceSwitchDialog.confirm()

    await expect(configure.skill(ACME.skill).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.skill(ACME.otherSkill).root).toHaveAttribute(
      "aria-pressed",
      "false"
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
