import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_REF,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stack, stubSignedIn } from "../support/auth"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  SINGLE_AGENT_SKILL,
  STACKS,
} from "../support/catalog"
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
  STORED_PAYLOAD,
  holdGetConfig,
  holdGetConfigMissing,
  stubGetConfig,
  stubGetConfigMissing,
} from "../support/sharing"

import type { Page } from "@playwright/test"

// Either arm's payload names its marketplace, so both owe what a share link
// gets: seat it first, park when it will not load, and name what it could not
// place.

// Only the marketplace fixture ships it.
const ACME_SKILL = "Acme Widgets"

const SAVED_NAME = "Weekday"
const SAME_MARKETPLACE_NAME = "Weekend"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT, second: VUE } = EXCLUSIVE_CATEGORY

// What the switch question says once an account's stack has failed to load.
const COULD_NOT_LOAD =
  "You have changes that do not come from a stack. Couldn't load this stack."

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

  // The question offers Retry, not Switch, for a pointer that resolved to
  // nothing. Retry's refusal is awaited: "nothing changed" would otherwise pass
  // before it. Cancelled first: `main` is `aria-hidden` under the modal.
  test("leaves the selection alone when its pointer resolves to nothing", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await arrive(page)

    const vue = configure.skillIn(web, CATEGORY, VUE)
    await vue.toggle()

    await configure.stack(SAVED_NAME).click()
    const dialog = configure.stackSwitchDialog
    await expect(dialog.description).toHaveText(COULD_NOT_LOAD)

    const refused = page.waitForResponse((response) =>
      response.url().endsWith(`/configs/${STORED_ID}`)
    )
    await dialog.retry()
    await refused
    await expect(dialog.description).toHaveText(COULD_NOT_LOAD)
    await dialog.cancel()

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

  // Names what it could not place, at this door too.
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

// Applying one is what loading its marketplace is, and then the stack: the
// marketplace stays active after a reload, and the configuration it replaced
// stays saved with its own.
test.describe("a saved stack built on another marketplace", () => {
  test.beforeEach(({ page }) => {
    stubMarketplaceCatalog(page)
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
  })

  const signedInWithIt = (page: Page) =>
    stubSignedIn(page, [stack(SAVED_NAME, MARKETPLACE_IMPORT_ID)])

  test("keeps its marketplace and its skills through a reload", async ({
    page,
  }) => {
    signedInWithIt(page)
    const configure = await arrive(page)
    await configure.stack(SAVED_NAME).click()
    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await page.reload()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.marketplaceButton).toContainText(MARKETPLACE_REF)
    expect(await configure.chosenMarketplace()).toBe(MARKETPLACE_CANONICAL_REF)
  })

  test("leaves the configuration it replaced saved with its own marketplace", async ({
    page,
  }) => {
    signedInWithIt(page)
    const configure = await arrive(page)
    const vue = configure.skillIn(web, CATEGORY, VUE)
    await vue.toggle()

    await configure.stack(SAVED_NAME).click()
    await configure.stackSwitchDialog.confirm()
    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill("")
    await configure.marketplaceDialog.load()
    await configure.marketplaceDialog.load()

    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
  })

  test("keeps them through a reload from a local named save too", async ({
    page,
  }) => {
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

    await page.reload()

    await expect(configure.skill(ACME_SKILL).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(await configure.chosenMarketplace()).toBe(MARKETPLACE_CANONICAL_REF)
  })
})

// Asked over changes no stack holds. Mirrored, not imported: a rendering
// assertion keeps its literal.
test.describe("the question before a saved stack replaces changes", () => {
  const withChangesAndSaves = async (page: Page) => {
    stubMarketplaceCatalog(page)
    const configure = await arrive(page)
    await configure.saveStackDialog.seed([
      { name: SAVED_NAME, payload: MARKETPLACE_PAYLOAD },
      { name: SAME_MARKETPLACE_NAME, payload: STORED_PAYLOAD },
    ])
    await configure.goto()
    await configure.skillIn(web, CATEGORY, VUE).toggle()
    return configure
  }

  // Nothing on screen is discarded: what the stack replaces is the other
  // marketplace's own.
  test("says what one built on another marketplace replaces, and that the setup on screen stays saved", async ({
    page,
  }) => {
    const configure = await withChangesAndSaves(page)

    await configure.stack(SAVED_NAME).click()

    await expect(configure.stackSwitchDialog.root).toContainText(
      `Switching opens ${MARKETPLACE_CANONICAL_REF}, and this stack replaces the configuration saved with it. Your current setup stays saved with the public catalogue and reopens when you load it again.`
    )
    await expect(configure.stackSwitchDialog.root).not.toContainText(
      "discarding"
    )
  })

  test("says what one built on the marketplace on screen discards", async ({
    page,
  }) => {
    const configure = await withChangesAndSaves(page)

    await configure.stack(SAME_MARKETPLACE_NAME).click()

    await expect(configure.stackSwitchDialog.root).toContainText(
      "Switching replaces your current setup, discarding 1 selected skill, their options and their sub-agent assignments."
    )
  })
})

// An account's payload is read after the grid draws, so the question can open
// before the stack's marketplace is known: it asks at once, with a loading
// state where the marketplace is named.
test.describe("the question before an account's saved stack replaces changes", () => {
  const OPENS_ITS_OWN = `Switching opens ${MARKETPLACE_CANONICAL_REF}, and this stack replaces the configuration saved with it. Your current setup stays saved with the public catalogue and reopens when you load it again.`

  const withChanges = async (page: Page) => {
    stubMarketplaceCatalog(page)
    const configure = await arrive(page)
    await configure.skillIn(web, CATEGORY, VUE).toggle()
    return configure
  }

  test("names the marketplace of one whose payload has arrived", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, MARKETPLACE_IMPORT_ID)])
    stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
    const read = page.waitForResponse((response) =>
      response.url().endsWith(`/configs/${MARKETPLACE_IMPORT_ID}`)
    )
    const configure = await withChanges(page)
    await read

    await configure.stack(SAVED_NAME).click()

    const { description, marketplaceLoading } = configure.stackSwitchDialog
    await expect(description).toContainText(OPENS_ITS_OWN)
    await expect(marketplaceLoading).toBeHidden()
    await expect(description).not.toContainText("discarding")
  })

  test("shows loading where the marketplace goes until the payload arrives, then names it", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, MARKETPLACE_IMPORT_ID)])
    const release = holdGetConfig(
      page,
      MARKETPLACE_IMPORT_ID,
      MARKETPLACE_PAYLOAD
    )
    const configure = await withChanges(page)

    await configure.stack(SAVED_NAME).click()

    const { description, marketplaceLoading } = configure.stackSwitchDialog
    await expect(marketplaceLoading).toBeVisible()
    await expect(description).toContainText(
      "You have changes that do not come from a stack. This stack is built on loading…"
    )
    await expect(description).not.toContainText("discarding")

    release()

    await expect(description).toContainText(OPENS_ITS_OWN)
    await expect(marketplaceLoading).toBeHidden()
  })

  // What the loading state stood for, once known, is the marketplace on screen.
  test("shows loading until the payload arrives, then says what one built on the marketplace on screen discards", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAME_MARKETPLACE_NAME, STORED_ID)])
    const release = holdGetConfig(page, STORED_ID, STORED_PAYLOAD)
    const configure = await withChanges(page)

    await configure.stack(SAME_MARKETPLACE_NAME).click()

    const { description, marketplaceLoading } = configure.stackSwitchDialog
    await expect(marketplaceLoading).toBeVisible()
    await expect(description).not.toContainText("stays saved")

    release()

    await expect(description).toContainText(
      "Switching replaces your current setup, discarding 1 selected skill, their options and their sub-agent assignments."
    )
    await expect(marketplaceLoading).toBeHidden()
  })
})

// Switch waits until the stack has loaded; a load that fails says so, and
// Retry stands in Switch's place.
test.describe("the question while an account's saved stack loads", () => {
  const DISCARDS_ONE =
    "Switching replaces your current setup, discarding 1 selected skill, their options and their sub-agent assignments."

  const withChanges = async (page: Page) => {
    stubMarketplaceCatalog(page)
    const configure = await arrive(page)
    await configure.skillIn(web, CATEGORY, VUE).toggle()
    return configure
  }

  // Pressed early, Switch would discard the selection the question had not
  // yet said it discards.
  test("holds Switch while loading shows, and lets it apply the stack once the payload arrives", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAME_MARKETPLACE_NAME, STORED_ID)])
    const release = holdGetConfig(page, STORED_ID, STORED_PAYLOAD)
    const configure = await withChanges(page)

    await configure.stack(SAME_MARKETPLACE_NAME).click()

    const dialog = configure.stackSwitchDialog
    await expect(dialog.marketplaceLoading).toBeVisible()
    await expect(dialog.confirmButton).toBeDisabled()

    release()

    await expect(dialog.description).toContainText(DISCARDS_ONE)
    await expect(dialog.confirmButton).toBeEnabled()
    await dialog.confirm()

    await expect(configure.skillIn(web, CATEGORY, REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // Read once: what Switch applies is the payload the question described.
  test("applies the payload it described without reading it again", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAME_MARKETPLACE_NAME, STORED_ID)])
    const release = holdGetConfig(page, STORED_ID, STORED_PAYLOAD)
    const configure = await withChanges(page)
    await configure.stack(SAME_MARKETPLACE_NAME).click()
    release()

    const dialog = configure.stackSwitchDialog
    await expect(dialog.description).toContainText(DISCARDS_ONE)
    stubGetConfigMissing(page, STORED_ID)
    await dialog.confirm()

    await expect(configure.skillIn(web, CATEGORY, REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("says it couldn't load the stack once the read fails, with Retry in Switch's place", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, MARKETPLACE_IMPORT_ID)])
    const release = holdGetConfigMissing(page, MARKETPLACE_IMPORT_ID)
    const configure = await withChanges(page)

    await configure.stack(SAVED_NAME).click()

    const dialog = configure.stackSwitchDialog
    await expect(dialog.marketplaceLoading).toBeVisible()

    release()

    await expect(dialog.description).toHaveText(COULD_NOT_LOAD)
    await expect(dialog.marketplaceLoading).toBeHidden()
    await expect(dialog.retryButton).toBeEnabled()
    await expect(dialog.confirmButton).toBeHidden()
  })

  // `main` is `aria-hidden` under the modal, so the dialog closing is what
  // lets the selection be read.
  test("closes on Keep my setup after a failed load, leaving the selection as it was", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, MARKETPLACE_IMPORT_ID)])
    stubGetConfigMissing(page, MARKETPLACE_IMPORT_ID)
    const configure = await withChanges(page)

    await configure.stack(SAVED_NAME).click()
    const dialog = configure.stackSwitchDialog
    await expect(dialog.description).toHaveText(COULD_NOT_LOAD)
    await dialog.cancel()

    await expect(dialog.root).toBeHidden()
    await expect(configure.skillIn(web, CATEGORY, VUE).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("reads the stack again on Retry, showing loading meanwhile, and Switch then applies it", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAME_MARKETPLACE_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await withChanges(page)

    await configure.stack(SAME_MARKETPLACE_NAME).click()
    const dialog = configure.stackSwitchDialog
    await expect(dialog.description).toHaveText(COULD_NOT_LOAD)

    const release = holdGetConfig(page, STORED_ID, STORED_PAYLOAD)
    await dialog.retry()

    await expect(dialog.marketplaceLoading).toBeVisible()
    await expect(dialog.confirmButton).toBeDisabled()
    await expect(dialog.retryButton).toBeHidden()

    release()

    await expect(dialog.description).toContainText(DISCARDS_ONE)
    await dialog.confirm()

    await expect(configure.skillIn(web, CATEGORY, REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // Retry gives way to the held Switch under the caret. The Enter pressed
  // while it is held would close the question before it said anything.
  test("keeps the keyboard on the button Retry becomes, which switches on Enter only once the payload arrives", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAME_MARKETPLACE_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await withChanges(page)

    await configure.stack(SAME_MARKETPLACE_NAME).click()
    const dialog = configure.stackSwitchDialog
    await expect(dialog.description).toHaveText(COULD_NOT_LOAD)

    const release = holdGetConfig(page, STORED_ID, STORED_PAYLOAD)
    await dialog.retryButton.press("Enter")

    await expect(dialog.marketplaceLoading).toBeVisible()
    await expect(dialog.confirmButton).toBeDisabled()
    await expect(dialog.confirmButton).toBeFocused()
    await page.keyboard.press("Enter")

    release()

    await expect(dialog.description).toContainText(DISCARDS_ONE)
    await expect(dialog.confirmButton).toBeFocused()
    await page.keyboard.press("Enter")

    await expect(configure.skillIn(web, CATEGORY, REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})

// With nothing unsaved no question is asked: the stack applies at once, so a
// load that fails is said on the page, in the question's own words and with its
// Retry. The selection is read while the message shows, so it must stay
// readable beside it.
test.describe("an account's saved stack that fails to load with nothing unsaved", () => {
  // A Next.js member the stored payload, which holds React alone, leaves out:
  // pressed only while the Next.js stack is what is on screen.
  const { name: VITE, category: BUILD_TOOLS } = SINGLE_AGENT_SKILL

  // A selection with nothing unsaved: a stack's own expansion.
  const onTheNextjsStack = async (page: Page) => {
    const configure = await arrive(page)
    await configure.chooseStack(STACKS.nextjs)
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    return configure
  }

  const expectTheNextjsStackOnScreen = async (configure: ConfigurePage) => {
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.stack(SAVED_NAME)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
    await expect(
      configure.skillIn(web, BUILD_TOOLS, VITE).root
    ).toHaveAttribute("aria-pressed", "true")
  }

  const expectTheStoredStackOnScreen = async (configure: ConfigurePage) => {
    await expect(configure.skillIn(web, CATEGORY, REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(
      configure.skillIn(web, BUILD_TOOLS, VITE).root
    ).toHaveAttribute("aria-pressed", "false")
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  }

  test("says it couldn't load the stack, with a way to try again", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)

    await configure.stack(SAVED_NAME).click()

    await expect(configure.stackLoadFailure).toBeVisible()
    await expect(configure.stackLoadRetry).toBeEnabled()
  })

  test("leaves the setup on screen and saved as it was while it says so", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)
    const saved = await configure.storedConfig()

    await configure.stack(SAVED_NAME).click()
    await expect(configure.stackLoadFailure).toBeVisible()

    await expectTheNextjsStackOnScreen(configure)
    expect(await configure.storedConfig()).toBe(saved)
  })

  // Nothing takes focus when it says so, so a live region is what reads it out.
  test("reads out that it couldn't load the stack", async ({ page }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)

    await configure.stack(SAVED_NAME).click()

    await expect(configure.stackLoadAnnouncement).toBeVisible()
  })

  // The grid's own read has not answered when the stack is chosen.
  test("says so when its first read was still out at the click and then fails", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    const release = holdGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)

    await configure.stack(SAVED_NAME).click()
    release()

    await expect(configure.stackLoadFailure).toBeVisible()
    await expectTheNextjsStackOnScreen(configure)
  })

  test("applies the stack on Retry once its load recovers", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)
    await configure.stack(SAVED_NAME).click()
    await expect(configure.stackLoadFailure).toBeVisible()

    stubGetConfig(page, STORED_ID)
    await configure.stackLoadRetry.click()

    await expectTheStoredStackOnScreen(configure)
  })

  // Once the stack applied, a sentence saying it could not load is false.
  test("stops saying it couldn't load the stack once Retry applies it", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)
    await configure.stack(SAVED_NAME).click()
    await expect(configure.stackLoadFailure).toBeVisible()

    stubGetConfig(page, STORED_ID)
    await configure.stackLoadRetry.click()
    await expectTheStoredStackOnScreen(configure)

    await expect(configure.stackLoadFailure).toBeHidden()
    await expect(configure.stackLoadRetry).toBeHidden()
  })

  // Retry's refusal is awaited: the message from the first failure would
  // otherwise satisfy the assertion before Retry answered.
  test("says so again, leaving the setup as it was, when Retry fails too", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)
    await configure.stack(SAVED_NAME).click()
    await expect(configure.stackLoadFailure).toBeVisible()

    const refused = page.waitForResponse((response) =>
      response.url().endsWith(`/configs/${STORED_ID}`)
    )
    await configure.stackLoadRetry.click()
    await refused

    await expect(configure.stackLoadFailure).toBeVisible()
    await expectTheNextjsStackOnScreen(configure)
  })

  test("is chosen and retried from the keyboard", async ({ page }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)

    await configure.stack(SAVED_NAME).press("Enter")
    await expect(configure.stackLoadFailure).toBeVisible()

    stubGetConfig(page, STORED_ID)
    await configure.stackLoadRetry.press("Enter")

    await expectTheStoredStackOnScreen(configure)
  })

  // Retry goes once it applies the stack, so the keyboard goes back to the
  // cell that asked for it, as Switch in the question leaves it. Not the grid's
  // first cell: one more press there clears the stack just loaded, unasked.
  for (const key of ["Enter", "Space"]) {
    test(`takes the keyboard back to the stack's cell once Retry by ${key} applies it`, async ({
      page,
    }) => {
      stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
      stubGetConfigMissing(page, STORED_ID)
      const configure = await onTheNextjsStack(page)
      await configure.stack(SAVED_NAME).press("Enter")
      await expect(configure.stackLoadFailure).toBeVisible()

      stubGetConfig(page, STORED_ID)
      await configure.stackLoadRetry.press(key)
      await expectTheStoredStackOnScreen(configure)

      await expect(configure.stack(SAVED_NAME)).toBeFocused()
    })
  }

  // After an edit, Retry asks first. The question hands the keyboard back to
  // what opened it, and that Retry is gone once Switch applies the stack. The
  // question opens on the read that failed, so its own Retry comes first.
  test("takes the keyboard back to the stack's cell once Retry asks first and Switch applies it", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)
    const dialog = configure.stackSwitchDialog
    await configure.stack(SAVED_NAME).press("Enter")
    await expect(configure.stackLoadFailure).toBeVisible()
    await configure.skillIn(web, CATEGORY, VUE).toggle()

    stubGetConfig(page, STORED_ID)
    await configure.stackLoadRetry.press("Enter")
    await dialog.retryButton.press("Enter")
    await expect(dialog.confirmButton).toBeEnabled()
    await dialog.confirmButton.press("Enter")
    await expect(dialog.root).toBeHidden()
    await expectTheStoredStackOnScreen(configure)

    await expect(configure.stack(SAVED_NAME)).toBeFocused()
  })

  // The allowed case for the three above: Retry is still there.
  test("keeps the keyboard on Retry when Retry fails too", async ({ page }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const configure = await onTheNextjsStack(page)
    await configure.stack(SAVED_NAME).press("Enter")
    await expect(configure.stackLoadFailure).toBeVisible()

    const refused = page.waitForResponse((response) =>
      response.url().endsWith(`/configs/${STORED_ID}`)
    )
    await configure.stackLoadRetry.press("Enter")
    await refused
    await expect(configure.stackLoadFailure).toBeVisible()
    await expectTheNextjsStackOnScreen(configure)

    await expect(configure.stackLoadRetry).toBeFocused()
  })

  // The allowed cases. The tests above show `stackLoadFailure` finds the
  // message when it is there, so its absence here is the message not shown —
  // a stack that loaded has nothing to say it failed.
  test("applies a stack that loads at once, saying nothing", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfig(page, STORED_ID)
    const configure = await onTheNextjsStack(page)

    await configure.stack(SAVED_NAME).click()

    await expectTheStoredStackOnScreen(configure)
    await expect(configure.stackLoadFailure).toBeHidden()
  })

  // The grid's own read failing says nothing about the click's.
  test("applies at once, saying nothing, when an earlier read failed and this one loads", async ({
    page,
  }) => {
    stubSignedIn(page, [stack(SAVED_NAME, STORED_ID)])
    stubGetConfigMissing(page, STORED_ID)
    const firstRead = page.waitForResponse((response) =>
      response.url().endsWith(`/configs/${STORED_ID}`)
    )
    const configure = await onTheNextjsStack(page)
    expect((await firstRead).status()).toBe(404)

    stubGetConfig(page, STORED_ID)
    await configure.stack(SAVED_NAME).click()

    await expectTheStoredStackOnScreen(configure)
    await expect(configure.stackLoadFailure).toBeHidden()
  })
})
