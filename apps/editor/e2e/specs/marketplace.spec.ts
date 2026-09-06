import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_CATALOG,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_CANONICAL_REF,
} from "@workspace/api-mocks/fixtures"

import { SKILL_INDEX } from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { stubSkillIndex } from "../support/skill-index"
import { STACKS } from "../support/catalog"
import {
  BIGCO_REF,
  stubMalformedCatalog,
  stubMarketplaceCatalog,
  stubMarketplaceEstate,
  stubMissingMarketplace,
  stubPrivateMarketplaceCatalog,
} from "../support/marketplace"
import { captureCreateConfig } from "../support/sharing"

import type { Locator } from "@playwright/test"
import type { ConfigurePage } from "../pages/configure-page"

// A section of the nav rail opens a dialog, a marketplace is named, and the
// grid runs on that marketplace's catalogue instead of the public one. The
// whole of leg 1 from the outside.

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
  // The same two once they are STORED, which is a different string from the
  // one typed above and deliberately so: `--marketplace` routes a ref on its
  // protocol prefix, and one carrying none is a local directory.
  stored: MARKETPLACE_CANONICAL_REF,
  storedPrivate: PRIVATE_MARKETPLACE_CANONICAL_REF,
} as const

// A skill only the public catalogue ships, so its absence proves a replacement
// rather than a merge.
const PUBLIC_SKILL = "React"

// What `ACME.stack` picks, read off the catalogue the stub publishes rather
// than written out here. That catalogue is the INPUT — what the marketplace
// said its stack contains — so taking the list from it leaves the assertion
// below saying what the app did with it, which is the whole claim. Sorted,
// because a payload's key order belongs to the config store and a set is what
// is being compared.
const ACME_STACK_SKILL_IDS = [
  ...MARKETPLACE_CATALOG.suggestedStacks[0]!.allSkillIds,
].sort()

// Wide enough that the page grid stops filling the window and starts being
// CENTRED in it, which slides the nav rail right while anything pinned to the
// viewport stays where it is. Pinned because that is the width a constant
// `left` gets wrong: it can be talked into clearing the rail at the suite's own
// 1600 and still land on top of it — or out in the margin beside the page — on
// a monitor two thirds wider.
const CENTRED_VIEWPORT = { width: 2560, height: 1000 }

// The layout's own floor — `min-w-[85.25rem]` in
// `src/routes/route-components.tsx` — below which the page scrolls sideways
// rather than reflowing, paired with the shortest window worth drawing. The
// rail is at its tightest here: `h-svh` gives its column the least room it will
// ever have, which is where a section that outgrew its box would push into the
// one below it.
const NARROW_VIEWPORT = { width: 1364, height: 640 }

// How much air there is between two rows of the rail. Negative is the overlap,
// in pixels, which is what a failure has to print: "expected true to be false"
// says nothing a reader can act on, and EDITOR-35 was found by measuring in the
// first place.
//
// VERTICAL now, where the same question about the floating button was
// horizontal, and that follows from the ruling rather than from taste. A
// control floating over the grid had to begin where the rail's column ended; a
// SECTION of the rail is in that column already, so the only way it can reach
// another row is by outgrowing its own box and running down into it. Both boxes
// are read live, so there is not a coordinate in here — what is asserted is a
// relationship between two elements on screen now.
const gapBetween = async (above: Locator, below: Locator) => {
  const top = await above.boundingBox()
  const bottom = await below.boundingBox()
  if (!top || !bottom) throw new Error("both rows must be drawn")

  return bottom.y - (top.y + top.height)
}

// How far the section spills out of the column it belongs to, on whichever side
// spills further — positive is the overspill, in pixels. The horizontal half of
// the same claim, and the half that keeps the section honest at a width nobody
// tested: the rail is a grid track rather than a viewport offset, so a section
// wider than its track is the one way back into the middle column.
const railSpill = async (configure: ConfigurePage) => {
  const rail = await configure.page.getByRole("navigation").boundingBox()
  const section = await configure.marketplaceSection.boundingBox()
  if (!rail || !section) {
    throw new Error("the rail and the section must be drawn")
  }

  const pastTheLeftEdge = rail.x - section.x
  const pastTheRightEdge = section.x + section.width - (rail.x + rail.width)

  return Math.max(pastTheLeftEdge, pastTheRightEdge)
}

// Adding a marketplace, through the section in the rail and the dialog it
// opens. The one door a visitor has, so every spec below that needs a
// marketplace loaded goes through it rather than seeding the slot.
const loadMarketplace = async (configure: ConfigurePage, ref: string) => {
  await configure.marketplaceButton.click()
  await configure.marketplaceDialog.fill(ref)
  await configure.marketplaceDialog.load()
}

// EDITOR-35 said this control must clear the nav rail because a `fixed` version
// had landed on top of the rail's Github link. The owner overturned that on
// 2026-09-04: it is a section OF the rail now, so "clears the rail" is no
// longer a claim anything could make about it — and the collision that row
// describes is exactly what this group has to keep watching, from the inside.
test.describe("the rail's marketplace section", () => {
  test("is drawn inside the rail, and drawn once", async ({ configure }) => {
    await expect(configure.railMarketplaceSection).toBeVisible()
    // One section, so "inside the rail" cannot be true of a second copy still
    // floating over the grid.
    await expect(configure.marketplaceSection).toHaveCount(1)
  })

  test("sits above the sign-in section rather than over it", async ({
    configure,
  }) => {
    expect(
      await gapBetween(configure.marketplaceSection, configure.accountRow)
    ).toBeGreaterThanOrEqual(0)
  })

  // The link the floating version covered outright — the word hidden, a sliver
  // of the Octocat showing past the button's right edge. Asserted against the
  // link itself rather than against the footer row, because the link is what
  // the defect was about.
  test("clears the Github link the floating version covered", async ({
    configure,
  }) => {
    expect(
      await gapBetween(configure.marketplaceSection, configure.githubLink)
    ).toBeGreaterThanOrEqual(0)
  })

  test("stays inside the rail's own column at every width", async ({
    configure,
    page,
  }) => {
    expect(await railSpill(configure)).toBeLessThanOrEqual(0)

    // Where the grid is centred rather than filling the window, which is where
    // the whole page slides right under a control that does not move with it.
    await page.setViewportSize(CENTRED_VIEWPORT)
    expect(await railSpill(configure)).toBeLessThanOrEqual(0)

    // And at the layout's floor, which is the narrowest the rail is ever drawn.
    await page.setViewportSize(NARROW_VIEWPORT)
    expect(await railSpill(configure)).toBeLessThanOrEqual(0)
  })
})

// The section at its tallest, in the shortest window the layout draws. Two
// saved marketplaces is what puts a switcher inside it, so this is the state in
// which the rail has the most to fit and the least room to fit it in — and the
// one in which a row that outgrew its box would reach the rows below.
test.describe("the rail's marketplace section with a switcher in it", () => {
  test.beforeEach(({ page }) => {
    stubMarketplaceEstate(page)
  })

  test("still clears the sign-in section and the Github link", async ({
    configure,
    page,
  }) => {
    await page.setViewportSize(NARROW_VIEWPORT)

    await loadMarketplace(configure, ACME.ref)
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await loadMarketplace(configure, BIGCO_REF)
    await expect(configure.switchTo(ACME.stored)).toBeVisible()

    expect(
      await gapBetween(configure.marketplaceSection, configure.accountRow)
    ).toBeGreaterThanOrEqual(0)
    // The spacer between the account and the footer collapses to nothing in a
    // window this short, so these two really are adjacent here.
    expect(
      await gapBetween(configure.accountRow, configure.githubLink)
    ).toBeGreaterThanOrEqual(0)
    expect(await railSpill(configure)).toBeLessThanOrEqual(0)
  })
})

test.describe("marketplace dialog", () => {
  test("the rail's marketplace section opens it", async ({ configure }) => {
    await configure.marketplaceButton.click()

    await expect(configure.marketplaceDialog.root).toBeVisible()
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
  test.beforeEach(({ page }) => {
    stubMarketplaceCatalog(page)
  })

  // The public catalogue costs nothing at all, and a load costs exactly one
  // request. Pinned because a real catalogue is 400 KB: storing the name moves
  // the restore hook's dependency, and without a guard the submit that just
  // fetched one fetches it again to arrive where it already is.
  test("costs one request to load and none to sit on the public catalogue", async ({
    configure,
    page,
  }) => {
    const requests = stubMarketplaceCatalog(page)
    await configure.goto()
    expect(requests).toHaveLength(0)

    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    expect(requests).toHaveLength(1)
  })

  // The catalogue emission is scoped, so a marketplace's visitor is offered THAT marketplace's
  // categories as placements for an added external skill — not the public catalogue's. Nothing
  // asserted it before 2026-08-23: every add-skill spec picks one category by name, which passes
  // whether the dropdown holds five or a hundred. Asserted as the domain-prefix set, because a
  // count cannot see a swap and the prefix is the half that says WHICH catalogue answered.
  test("offers the loaded marketplace's categories as placements, not the public ones", async ({
    configure,
    page,
  }) => {
    stubSkillIndex(page)
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    const dialog = configure.addSkillDialog
    await configure.addSkillButton.click()
    const staged = SKILL_INDEX.skills[0]!.name
    await dialog.stage(staged)

    const labels = await dialog
      .categorySelect(staged)
      .locator("option")
      .allTextContents()
    const offeredDomains = [
      ...new Set(
        labels
          .filter((label) => label.includes(" · "))
          .map((label) => label.split(" · ")[0])
      ),
    ].sort()

    expect(offeredDomains).toStrictEqual(["api", "web"])
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
    // The STORED form, which is not the one typed into the field above.
    expect(await configure.chosenMarketplace()).toBe(ACME.stored)

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

// THE WHOLE JOURNEY, IN ONE TEST, AND THAT IS THE POINT OF IT.
//
// The describes above cut it into the legs each of them is about: a dialog
// opens, a grid swaps, a payload carries the right ref. Every one of those
// starts from a state the previous one left, and none of them is the claim a
// visitor cares about — which is that a marketplace they add is a marketplace
// they can then build and install from, in one sitting, without reloading or
// being handed a seeded slot.
//
// Its stack rather than a hand-picked skill, deliberately. Nothing in this
// suite ever chose a custom marketplace's stack before this test: `ACME.stack`
// appears once, in an assertion that it is DRAWN. Drawn and choosable are
// different claims, and a stack is the one place a catalogue's own author says
// which of its skills go together — so a stack that renders and cannot be
// applied would leave the rest of this file entirely green.
test.describe("adding a marketplace, seeing it, and installing from it", () => {
  test.beforeEach(({ page }) => {
    stubMarketplaceCatalog(page)
  })

  test("its stack can be chosen, and installs the skills that stack picks", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)

    // 1 — added, through the section in the rail.
    await loadMarketplace(configure, ACME.ref)

    // 2 — the catalogue on screen is the one that was just added. Both halves,
    // because a merge and a replacement are different outcomes and only the
    // absence tells them apart.
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await expect(configure.skill(PUBLIC_SKILL).root).toBeHidden()
    await expect(configure.stack(ACME.stack)).toBeVisible()
    await expect(configure.stack(STACKS.nextjs)).toBeHidden()

    // 3 — its stack is applied, and it selects its own catalogue's skills.
    await configure.chooseStack(ACME.stack)
    await expect(configure.stack(ACME.stack)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    expect(await configure.skill(ACME.otherSkill).isSelected()).toBe(true)

    // …and installing writes those skills, from that marketplace. The header
    // and the payload are two different claims: one is what the visitor is
    // told, the other is what the CLI is handed.
    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()
    await expect(configure.installDialog.header).toContainText(
      `marketplace ${ACME.stored}`
    )
    await expect(configure.installDialog.skillsPane).toContainText(ACME.skill)
    await expect(configure.installDialog.skillsPane).toContainText(
      ACME.otherSkill
    )

    const [body] = posted
    expect(body).toBeDefined()
    expect(body!.marketplace).toBe(ACME.stored)
    expect(
      Object.keys(body!.skills as Record<string, unknown>).sort()
    ).toStrictEqual(ACME_STACK_SKILL_IDS)
  })
})

// What the marketplace field's value BECOMES, which is the one thing about it
// that leaves the browser.
//
// The field asks for `owner/repo` and the CLI reads a ref by its protocol
// prefix: `github:`, `gh:`, `gitlab:`, a URL — and everything without one as a
// path on the receiver's own disk. So the form the placeholder asks for is the
// one form a payload must not carry, and it fails in the worst way available,
// by resolving to something rather than to nothing: `<cwd>/acme/skills`.
//
// This is a claim about the FORM of a field rather than about its presence, so
// the assertions below are on the exact string. A `toContain` would pass on the
// bare ref, which is the whole defect.
test.describe("the ref a loaded marketplace is stored and shared as", () => {
  test.beforeEach(({ page }) => {
    stubMarketplaceCatalog(page)
  })

  test("mints a ref the CLI resolves as a repository, not as a path", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)

    await configure.marketplaceButton.click()
    // Typed as the placeholder asks for it, which is the form that was minted
    // verbatim and could not be installed.
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await configure.skill(ACME.skill).toggle()
    // Minted through the install dialog rather than Share, which needs no
    // clipboard permission — the payload is the same one either door posts.
    await configure.roster.installButton.click()
    await expect(configure.installDialog.root).toBeVisible()

    const [body] = posted
    expect(body).toBeDefined()
    expect(body!.marketplace).toBe(ACME.stored)
  })

  test("names the stored form on the button that says where you are", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await expect(configure.marketplaceButton).toContainText(ACME.stored)
  })

  // The prefixed form already worked in the browser before it was minted, and
  // it has to go on working: the two spellings name one repository, so they
  // have to come out as one ref rather than two.
  test("stores the same ref whichever way the repository was spelled", async ({
    configure,
  }) => {
    await configure.marketplaceButton.click()
    await configure.marketplaceDialog.fill(ACME.stored)
    await configure.marketplaceDialog.load()

    await expect(configure.skill(ACME.skill).root).toBeVisible()
    expect(await configure.chosenMarketplace()).toBe(ACME.stored)
  })
})

test.describe("a marketplace that does not resolve", () => {
  test.beforeEach(({ page }) => {
    stubMissingMarketplace(page)
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
  test.beforeEach(({ page }) => {
    stubPrivateMarketplaceCatalog(page)
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

    expect(await configure.chosenMarketplace()).toBe(ACME.storedPrivate)
    // Filed under the stored form too, so one repository holds one credential
    // however the visitor spelled it.
    expect(await configure.savedToken(ACME.storedPrivate)).toBe(
      MARKETPLACE_TOKEN
    )

    await page.reload()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
  })
})

test.describe("a catalogue that is not a catalogue", () => {
  test.beforeEach(({ page }) => {
    stubMalformedCatalog(page)
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
