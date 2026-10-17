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

// Marketplace ids are prefixed, so a swapped grid is observable rather than
// counted.
const ACME = {
  skill: "Acme Widgets",
  otherSkill: "Acme Gateway",
  stack: "Acme House Stack",
  category: "Acme Framework",
  ref: "acme/skills",
  private: "acme/private-skills",
  // The stored form: `--marketplace` reads a ref without a protocol prefix as a
  // local path.
  stored: MARKETPLACE_CANONICAL_REF,
  storedPrivate: PRIVATE_MARKETPLACE_CANONICAL_REF,
} as const

// Only the public catalogue ships it, so its absence proves a replacement, not
// a merge.
const PUBLIC_SKILL = "React"

// Read off the stub's catalogue (the input), so the assertion is about what the
// app did. Sorted: a set.
const ACME_STACK_SKILL_IDS = [
  ...MARKETPLACE_CATALOG.suggestedStacks[0]!.allSkillIds,
].sort()

// Wide enough that the page grid centres, moving the rail but not
// viewport-pinned controls.
const CENTRED_VIEWPORT = { width: 2560, height: 1000 }

// The layout's floor with the shortest window worth drawing: the rail at its
// tightest.
const NARROW_VIEWPORT = { width: 1200, height: 640 }

// Negative is the overlap in pixels, so a failure prints something actionable.
const gapBetween = async (above: Locator, below: Locator) => {
  const top = await above.boundingBox()
  const bottom = await below.boundingBox()
  if (!top || !bottom) throw new Error("both rows must be drawn")

  return bottom.y - (top.y + top.height)
}

// Positive is the overspill in pixels, on whichever side spills further.
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

// The visitor's only door, so specs load through it rather than seeding the
// slot.
const loadMarketplace = async (configure: ConfigurePage, ref: string) => {
  await configure.marketplaceButton.click()
  await configure.marketplaceDialog.fill(ref)
  await configure.marketplaceDialog.load()
}

test.describe("the rail's marketplace section", () => {
  test("is drawn inside the rail, and drawn once", async ({ configure }) => {
    await expect(configure.railMarketplaceSection).toBeVisible()
    await expect(configure.marketplaceSection).toHaveCount(1)
  })

  test("sits above the sign-in section rather than over it", async ({
    configure,
  }) => {
    expect(
      await gapBetween(configure.marketplaceSection, configure.accountRow)
    ).toBeGreaterThanOrEqual(0)
  })

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

    await page.setViewportSize(CENTRED_VIEWPORT)
    expect(await railSpill(configure)).toBeLessThanOrEqual(0)

    await page.setViewportSize(NARROW_VIEWPORT)
    expect(await railSpill(configure)).toBeLessThanOrEqual(0)
  })
})

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
    // The spacer collapses in a window this short, so these two really are
    // adjacent.
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

  // A catalogue is 400 KB: storing the name must not make the submit fetch it
  // twice.
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

  // Asserted as the domain-prefix set, not a count.
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

    // Waited for first: a one-shot `localStorage` read has no retry.
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    // The STORED form, which is not the one typed into the field above.
    expect(await configure.chosenMarketplace()).toBe(ACME.stored)

    await page.reload()
    await expect(configure.skill(ACME.skill).root).toBeVisible()
  })

  test("the public catalogue loads when no marketplace is named", async ({
    configure,
  }) => {
    await expect(configure.skill(PUBLIC_SKILL).root).toBeVisible()
    await expect(configure.stack(STACKS.nextjs)).toBeVisible()
    expect(await configure.savedMarketplaces()).toBeNull()
  })
})

// The whole journey in one test: add, see, apply a stack, install.
test.describe("adding a marketplace, seeing it, and installing from it", () => {
  test.beforeEach(({ page }) => {
    stubMarketplaceCatalog(page)
  })

  test("its stack can be chosen, and installs the skills that stack picks", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)

    await loadMarketplace(configure, ACME.ref)

    // Both halves: only the absence tells a replacement from a merge.
    await expect(configure.skill(ACME.skill).root).toBeVisible()
    await expect(configure.skill(PUBLIC_SKILL).root).toBeHidden()
    await expect(configure.stack(ACME.stack)).toBeVisible()
    await expect(configure.stack(STACKS.nextjs)).toBeHidden()

    await configure.chooseStack(ACME.stack)
    await expect(configure.stack(ACME.stack)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(await configure.skill(ACME.skill).isSelected()).toBe(true)
    expect(await configure.skill(ACME.otherSkill).isSelected()).toBe(true)

    // The header is what the visitor is told; the payload is what the CLI is
    // handed.
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

// The field asks for `owner/repo`, which is the one form a payload must not
// carry.
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
    await configure.marketplaceDialog.fill(ACME.ref)
    await configure.marketplaceDialog.load()
    await expect(configure.skill(ACME.skill).root).toBeVisible()

    await configure.skill(ACME.skill).toggle()
    // Through the install dialog rather than Share, which needs clipboard
    // permission.
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
    // Filed under the stored form, so one repository holds one credential.
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
