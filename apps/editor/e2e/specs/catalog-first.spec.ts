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
  stubMalformedCatalog,
  stubMarketplaceCatalog,
  stubMissingMarketplace,
  stubPrivateMarketplaceCatalog,
  stubSlowMissingMarketplace,
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

// One rule, reached two ways.
//
// Nothing may resolve an id before the catalogue those ids were minted against
// is seated. The app resolves ids in exactly two places while it opens — it
// reads the configuration this browser saved, and it applies the one a share
// link names — and both used to run against whatever catalogue happened to be
// loaded, which for the first paint is always the vendored public one. A
// selection made on a marketplace therefore pruned as unknown on the way back
// in, whether it arrived from `localStorage` or from `?fromId=`.

// A skill only the marketplace fixture ships, and one only the public catalogue
// does. The prefix is CLI-498's, so no id can be in both catalogues and "which
// catalogue answered" is observable rather than a matter of counting.
const ACME_SKILL = "Acme Widgets"
const PUBLIC_SKILL = EXCLUSIVE_CATEGORY.first

// A skill from outside every catalogue, and where the intake files it. Its
// directory lives for the session and never reaches storage, which is what
// makes it the witness for "storage was not read a second time".
const ADDED_SKILL = SKILL_INDEX.skills[0]!.name
const ADDED_CATEGORY = `${DOMAINS.web.toLowerCase()} · ${EXCLUSIVE_CATEGORY.name.toLowerCase()}`

// A token that was good once. The private stub refuses anything but the real
// one, which is exactly what an expired credential does.
const STALE_TOKEN = "ghp_staleaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

test.describe("a configuration saved against a marketplace", () => {
  test.beforeEach(async ({ page }) => {
    await stubMarketplaceCatalog(page)
  })

  // The gap EDITOR-30 left standing by name. Persist hydration runs at module
  // import — before any fetch can have resolved — so the saved selection met
  // the public catalogue, which has never heard of an `acme-` id.
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

// A saved marketplace that will not load on startup is prompted for the same
// way a first load is (EDITOR-36, owner 2026-08-17).
//
// The 2026-08-09 ruling was that a failed RESTORE is silent, and it was right
// while a failed restore meant falling back to the public catalogue — cosmetic.
// EDITOR-31 made hydration wait on the catalogue, so a failed restore now
// renders the whole configuration as empty with only a console line saying why,
// which reads as lost work. The recovery flow the import path already has is
// what answers it; there is no second one.
test.describe("a saved marketplace that no longer loads", () => {
  // Everything below starts from a browser that really has one saved: the
  // private marketplace loaded with a good token, a skill of its own picked,
  // and then the token gone stale — which is what an expired PAT looks like to
  // the repository, and the one way in that costs no hand-written blob.
  test.beforeEach(async ({ configure, page }) => {
    await stubPrivateMarketplaceCatalog(page)

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

  // Shown, not asked — exactly as the import path shows it. The browser already
  // knows which marketplace, so the caret goes to the one thing only the
  // visitor holds.
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

  // The other half of the owner's instruction, and the half that landed with
  // EDITOR-31: the picks are not deleted by the failure. Cancelling parks the
  // restore visibly rather than reading the configuration against a catalogue
  // that has never heard of its ids.
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

  // Cancelled, then finished from the floating button — the same pre-filled
  // form, because the dialog owns only whether it is open.
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

  // EDITOR-38's sibling. Clearing the field and pressing Load is the one way
  // back to the public catalogue, and on a parked RESTORE it used to forget the
  // marketplace and leave the notice standing — a line naming a marketplace as
  // the thing being waited on when nothing is stored to wait for any more, over
  // a grid that never loaded.
  //
  // A restore is re-pointed by that, which is why it can finish here at all:
  // its ids belong to whichever marketplace the SLOT names, and the slot now
  // names none. So the public catalogue really is the catalogue this
  // configuration is saved against, and reading it against one is what the
  // recovery was parked waiting to do.
  test("finishes the parked restore when the field is cleared for the public catalogue", async ({
    configure,
    page,
  }) => {
    await page.reload()
    await expect(configure.marketplaceDialog.root).toBeVisible()

    await configure.marketplaceDialog.fill("")
    await configure.marketplaceDialog.load()

    await expect(configure.skill(PUBLIC_SKILL).root).toBeVisible()
    // The parked notice named a marketplace as the thing being waited on, and
    // nothing is waiting any more. What stands in its place is the next test's
    // subject rather than silence, so this asks for the line to have stopped
    // naming the marketplace instead of asking for no line at all.
    await expect(configure.importNotice).not.toContainText(
      PRIVATE_MARKETPLACE_REF
    )
    // Asked of the slot rather than inferred from the screen: a notice that
    // went away while the marketplace stayed stored would be the same bug with
    // the evidence removed.
    expect(await configure.chosenMarketplace()).not.toBe(
      PRIVATE_MARKETPLACE_CANONICAL_REF
    )
  })

  // EDITOR-45's last half, and the reason the assertion above is not "no line
  // at all". Resolving the park this way re-points the restore at the public
  // catalogue, which has never heard of an `acme-` id — so the saved selection
  // is read against a catalogue that prunes every one of them and the grid
  // comes back empty. Pruning is right; pruning in silence is an afternoon of
  // configuration disappearing with nothing on screen to say why.
  //
  // The shared-link door has named every dropped id since EDITOR-16. This one
  // says it in the same words, so a visitor gets a name they can go and look up
  // rather than a grid that looks broken.
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

// The same prune with no recovery anywhere near it.
//
// A park is one way the seated catalogue comes to be the wrong one for what is
// in the slot; a browser that simply chose the public catalogue back is the
// other, and it reaches the read by the ordinary path with nothing parked. A
// silent prune is a silent prune wherever it happens, so the line is owed here
// too — reached through `readSavedConfig` rather than through the recovery,
// which is what makes it one answer rather than a second one.
test.describe("a saved configuration its seated catalogue has outgrown", () => {
  test.beforeEach(async ({ configure, page }) => {
    await stubMarketplaceCatalog(page)

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
    // Chosen back to the public catalogue, which is what an empty `current`
    // means — so the opening seats it, nothing parks, and the saved ids meet a
    // catalogue that has never heard of them.
    await configure.seedSavedMarketplaces({ current: "", saved: {} })

    await page.reload()

    await expect(configure.importNotice).toContainText(ACME_SKILL_ID)
  })

  // The other half of the same claim, and the one that keeps the line honest:
  // a restore that cost nothing has nothing to say, and a notice standing over
  // a configuration that arrived whole is furniture.
  test("says nothing when the catalogue can still place everything", async ({
    configure,
    page,
  }) => {
    await page.reload()

    await expect(configure.skill(ACME_SKILL).root).toBeVisible()
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
    await expect(configure.importNotice).toBeHidden()
  })

  // The one opening with two things to say, and the reason the line is composed
  // rather than assigned. A link that names nothing explains why this browser's
  // own configuration is on screen; that configuration then explains what its
  // catalogue could not place. The second arriving must not delete the first —
  // an explanation replaced is an explanation lost, which is this row's own
  // silence wearing the other coat.
  test("adds what the restore cost to what the opening already said", async ({
    configure,
    page,
  }) => {
    await stubGetConfigMissing(page, DEAD_LINK_ID)
    await configure.seedSavedMarketplaces({ current: "", saved: {} })

    await page.goto(`/?fromId=${DEAD_LINK_ID}`)

    await expect(configure.importNotice).toContainText("points to nothing")
    await expect(configure.importNotice).toContainText(ACME_SKILL_ID)
  })
})

// Leaving the screen and coming back remounts the whole opening, and it must
// not run a second time. Both halves of it are expensive in their own way: a
// catalogue is 400 KB to arrive where the app already is, and a second read of
// storage would replace what is in memory with what `partialize` chose to write
// — which is deliberately less.
test.describe("returning to the screen", () => {
  const leaveAndReturn = async (page: Page) => {
    await page.getByRole("link", { name: "Docs" }).click()
    await page.getByRole("link", { name: "Configure" }).click()
  }

  test("fetches the marketplace catalogue no second time", async ({
    configure,
    page,
  }) => {
    const requests = await stubMarketplaceCatalog(page)
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
    await stubSkillIndex(page)
    await stubSkillContents(page)
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
  test.beforeEach(async ({ page }) => {
    await stubMarketplaceCatalog(page)
    await stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
  })

  test("loads that catalogue before it resolves a single id", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)

    await expect(configure.skill(ACME_SKILL).root).toBeVisible()
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
  })

  // The grid has to be the catalogue the ids came from, or the selection on
  // screen is described by a taxonomy that never minted it. Seated, and
  // deliberately not stored: EDITOR-37 made the shared address govern itself,
  // so a marketplace a link named is not one this browser chose — and the slot
  // holds exactly one, PAT included.
  test("leaves that marketplace loaded and unstored", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await expect(configure.skill(ACME_SKILL).root).toBeVisible()

    await expect(configure.marketplaceButton).toContainText(MARKETPLACE_REF)
    expect(await configure.savedMarketplaces()).toBeNull()
  })

  // Its own marketplace has moved on. The ids that survive still apply — the
  // skip-don't-fail policy the CLI shares — but the one that did not has to be
  // named, or the link comes back quietly smaller than it was sent.
  test("names the ids the catalogue could not place", async ({
    configure,
    page,
  }) => {
    await stubGetConfig(page, DRIFTED_IMPORT_ID, DRIFTED_MARKETPLACE_PAYLOAD)

    await page.goto(`/?fromId=${DRIFTED_IMPORT_ID}`)

    await expect(configure.importNotice).toContainText(RETIRED_SKILL_ID)
    expect(await configure.skill(ACME_SKILL).isSelected()).toBe(true)
  })
})

test.describe("a payload naming a marketplace this browser cannot read", () => {
  test.beforeEach(async ({ page }) => {
    await stubPrivateMarketplaceCatalog(page)
    await stubGetConfig(page, PRIVATE_IMPORT_ID, PRIVATE_MARKETPLACE_PAYLOAD)
  })

  // Shown, not asked. The payload already says which marketplace, so the field
  // arrives filled and the caret goes to the one thing only the visitor holds.
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

  // The second way in, and the row names it: a token that authorized once and
  // no longer does looks exactly like no token at all to the repository.
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
  test.beforeEach(async ({ page }) => {
    await stubMalformedCatalog(page)
    await stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
  })

  // The one failure with no retry in it: the bytes parsed as JSON and are not a
  // catalogue, so asking again returns the same bytes. A token cannot reach it
  // either, so offering one would invite an attempt that cannot work.
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

// Opening the dialog by hand while an import is still fetching its catalogue
// leaves the form mounted before there is anything to pre-fill it with. It has
// to take the recovery when it arrives, or the one screen that can finish the
// import is the one screen that does not know it is waiting.
test.describe("a dialog already open when the import parks", () => {
  test("takes the recovery it did not open with", async ({
    configure,
    page,
  }) => {
    await stubSlowMissingMarketplace(page)
    await stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)

    await page.goto(`/?fromId=${MARKETPLACE_IMPORT_ID}`)
    await configure.marketplaceButton.click()
    await expect(configure.marketplaceDialog.root).toBeVisible()
    await expect(configure.marketplaceDialog.marketplaceInput).toHaveValue("")

    await expect(configure.marketplaceDialog.marketplaceInput).toHaveValue(
      MARKETPLACE_CANONICAL_REF
    )
    await expect(configure.marketplaceDialog.error).toContainText("404")
    await expect(configure.marketplaceDialog.tokenInput).toBeVisible()
  })
})

test.describe("cancelling out of the recovery", () => {
  test.beforeEach(async ({ page }) => {
    await stubMissingMarketplace(page)
    await stubGetConfig(page, MARKETPLACE_IMPORT_ID, MARKETPLACE_PAYLOAD)
  })

  // The outcome the row forbids outright: applying a marketplace payload
  // against the public catalogue prunes every id in it and replaces the
  // visitor's own configuration with the empty result, silently. Since
  // EDITOR-37 the visitor's own is not on screen behind a shared address at all
  // — the address governs itself — so "left alone" is a claim about the slot
  // and about the normal URL, which is a stronger one than it was.
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

  // The other side of the sibling in the restore describe above, and the
  // asymmetry between them is the whole point rather than an oversight.
  //
  // A payload is NOT re-pointed by clearing the field. Its ids belong to the
  // marketplace the payload NAMES, and clearing this browser's slot says
  // nothing about that — so continuing it against the public catalogue would
  // prune every id in it, which is precisely the silent partial import the
  // recovery exists to prevent. It stays parked, and its notice stays with it.
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
