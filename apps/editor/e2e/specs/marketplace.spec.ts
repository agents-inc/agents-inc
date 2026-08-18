import { MARKETPLACE_TOKEN } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { STACKS } from "../support/catalog"
import {
  stubMalformedCatalog,
  stubMarketplaceCatalog,
  stubMissingMarketplace,
  stubPrivateMarketplaceCatalog,
} from "../support/marketplace"

import type { ConfigurePage } from "../pages/configure-page"

// A floating button opens a dialog, a marketplace is named, and the grid runs
// on that marketplace's catalogue instead of the public one. The whole of leg 1
// from the outside.

// Fixed points in the fixture catalogue. The prefix is CLI-498's: every custom
// marketplace's ids carry its name, so no id can be in both catalogues and
// "the grid swapped" is observable rather than a matter of counting.
const ACME = {
  skill: "Acme Widgets",
  otherSkill: "Acme Gateway",
  stack: "Acme House Stack",
  category: "Acme Framework",
  ref: "acme/skills",
  private: "acme/private-skills",
} as const

// A skill only the public catalogue ships, so its absence proves a replacement
// rather than a merge.
const PUBLIC_SKILL = "React"

// Wide enough that the page grid stops filling the window and starts being
// CENTRED in it, which slides the nav rail right while anything pinned to the
// viewport stays where it is. Pinned because that is the width a constant
// `left` gets wrong: it can be talked into clearing the rail at the suite's own
// 1600 and still land on top of it — or out in the margin beside the page — on
// a monitor two thirds wider.
const CENTRED_VIEWPORT = { width: 2560, height: 1000 }

// How much air there is between the nav rail's right edge and the floating
// button's left one. Negative is the overlap, in pixels, which is what a
// failure has to print: "expected true to be false" says nothing a reader can
// act on, and this row was found by measuring in the first place.
//
// Both boxes are read live, so there is not a single coordinate in here. What
// is asserted is a RELATIONSHIP between two elements that are on screen now.
const railGap = async (configure: ConfigurePage) => {
  const rail = await configure.page.getByRole("navigation").boundingBox()
  const button = await configure.marketplaceButton.boundingBox()
  if (!rail || !button) throw new Error("the rail and the button must be drawn")

  return button.x - (rail.x + rail.width)
}

test.describe("marketplace dialog", () => {
  test("a floating button opens it", async ({ configure }) => {
    await configure.marketplaceButton.click()

    await expect(configure.marketplaceDialog.root).toBeVisible()
  })

  // EDITOR-35. No visibility assertion could have caught this: both elements
  // are present and visible to the DOM, and the button simply sat on top of the
  // rail's Github link — the word hidden outright, a sliver of the Octocat
  // showing past the button's right edge.
  //
  // Asserted against the RAIL rather than against the link inside it, and that
  // is what makes it robust rather than a snapshot of today's pixels. The rail
  // is a full-height column at the page's left edge, so vertical separation is
  // impossible by construction and the whole question is horizontal: the button
  // has to begin where the column ends. Move the Github link, put a second item
  // beside it, or change the column's width, and this still says the same
  // thing — and it says it about the whole class of "a floating control was
  // dropped on the nav rail" rather than about one link.
  test("the floating button clears the nav rail rather than covering it", async ({
    configure,
    page,
  }) => {
    expect(await railGap(configure)).toBeGreaterThanOrEqual(0)

    // Again where the grid is centred rather than filling the window, because
    // the rail and a viewport-pinned control move apart there.
    await page.setViewportSize(CENTRED_VIEWPORT)

    expect(await railGap(configure)).toBeGreaterThanOrEqual(0)
  })

  // One field to start with. The token is progressive, so the public case —
  // which is everyone until an org adopts this — never sees a credential field.
  test("opens asking only for the marketplace", async ({ configure }) => {
    await configure.marketplaceButton.click()

    await expect(configure.marketplaceDialog.marketplaceInput).toBeVisible()
    await expect(configure.marketplaceDialog.tokenInput).toBeHidden()
  })

  test("cancelling leaves the public catalogue alone", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.cancel()

    await expect(configure.skill(PUBLIC_SKILL).root).toBeVisible()
    expect(await configure.savedMarketplaces()).toBeNull()
  })
})

test.describe("loading a marketplace", () => {
  test.beforeEach(async ({ page }) => {
    await stubMarketplaceCatalog(page)
  })

  // The public catalogue costs nothing at all, and a load costs exactly one
  // request. Pinned because a real catalogue is 400 KB: storing the name moves
  // the restore hook's dependency, and without a guard the submit that just
  // fetched one fetches it again to arrive where it already is.
  test("costs one request to load and none to sit on the public catalogue", async ({
    configure,
    page,
  }) => {
    const requests = await stubMarketplaceCatalog(page)
    await configure.goto()
    expect(requests).toHaveLength(0)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    expect(requests).toHaveLength(1)
  })

  test("its skills replace the public catalogue in the grid", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await expect(configure.skill(ACME.otherSkill).root).toBeVisible()
    await expect(configure.skill(PUBLIC_SKILL).root).toBeHidden()
  })

  test("its stacks replace the public catalogue's in the rail", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()

    await expect(configure.stack(ACME.stack)).toBeVisible()
    await expect(configure.stack(STACKS.nextjs)).toBeHidden()
    // Scratch is the app's own cell rather than the catalogue's, so it stays
    // whichever marketplace is loaded.
    await expect(configure.stack(STACKS.scratch)).toBeVisible()
  })

  test("its categories land under the domains they name", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()

    await expect(configure.category("Web", ACME.category)).toBeVisible()
  })

  // A skill from the loaded catalogue is selectable, which is the point of
  // loading one — the grid is not a preview.
  test("a loaded skill can be selected", async ({ configure }) => {
    const cell = configure.skill(ACME.skill)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()
    await cell.toggle()

    expect(await cell.isSelected()).toBe(true)
  })

  test("the marketplace survives a reload", async ({ configure, page }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()

    // Waited for before storage is read: the load is a fetch, and a one-shot
    // `localStorage` read has no retry of its own to hide the race behind.
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.chosenMarketplace()).toBe(ACME.ref)

    await page.reload()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
  })

  // The public catalogue is what an app nobody has pointed anywhere shows, and
  // it has to keep working with no marketplace named at all.
  test("the public catalogue loads when no marketplace is named", async ({
    configure,
  }) => {
    await expect(configure.skill(PUBLIC_SKILL).root).toBeVisible()
    await expect(configure.stack(STACKS.nextjs)).toBeVisible()
    expect(await configure.savedMarketplaces()).toBeNull()
  })
})

test.describe("a marketplace that does not resolve", () => {
  test.beforeEach(async ({ page }) => {
    await stubMissingMarketplace(page)
  })

  // GitHub 404s a private repository for a caller who may not see it, so the
  // answer cannot be "wrong name" — it has to offer the fix that might work.
  test("surfaces the token field rather than failing outright", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.private)
    await configure.marketplaceDialog.load()

    await expect(configure.marketplaceDialog.error).toContainText("404")
    await expect(configure.marketplaceDialog.tokenInput).toBeVisible()
  })

  test("keeps the public catalogue on screen behind the dialog", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.private)
    await configure.marketplaceDialog.load()
    await configure.marketplaceDialog.cancel()

    await expect(configure.skill(PUBLIC_SKILL).root).toBeVisible()
  })
})

test.describe("a private marketplace", () => {
  test.beforeEach(async ({ page }) => {
    await stubPrivateMarketplaceCatalog(page)
  })

  // The progressive walk end to end: name it, get a 404, paste the token, get
  // the catalogue. The token authorizes — the marketplace still identifies.
  test("loads once the token arrives", async ({ configure }) => {
    const dialog = configure.marketplaceDialog

    await configure.marketplaceButton.click()
    await dialog.fill(ACME.private)
    await dialog.load()

    await expect(dialog.tokenInput).toBeVisible()

    await dialog.fillToken(MARKETPLACE_TOKEN)
    await dialog.load()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
  })

  test("keeps the token for the next session", async ({ configure, page }) => {
    const dialog = configure.marketplaceDialog

    await configure.marketplaceButton.click()
    await dialog.fill(ACME.private)
    await dialog.load()
    await expect(dialog.tokenInput).toBeVisible()
    await dialog.fillToken(MARKETPLACE_TOKEN)
    await dialog.load()

    await expect(configure.skill(ACME.skill).root).toBeVisible()

    expect(await configure.chosenMarketplace()).toBe(ACME.private)
    expect(await configure.savedToken(ACME.private)).toBe(MARKETPLACE_TOKEN)

    await page.reload()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
  })
})

test.describe("a catalogue that is not a catalogue", () => {
  test.beforeEach(async ({ page }) => {
    await stubMalformedCatalog(page)
  })

  // The one failure with no retry in it: the bytes parsed as JSON and are not a
  // catalogue, so asking again returns the same bytes. What has to change is
  // the author's build, and the message names the field that says so.
  test("names the field that is wrong and offers no token", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()

    await expect(configure.marketplaceDialog.error).toContainText("skills")
    await expect(configure.marketplaceDialog.tokenInput).toBeHidden()
  })

  test("leaves the public catalogue in place", async ({ configure }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()
    await configure.marketplaceDialog.cancel()

    await expect(configure.skill(PUBLIC_SKILL).root).toBeVisible()
  })
})
