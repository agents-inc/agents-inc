import {
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_CANONICAL_REF,
  SKILL_INDEX,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { DOMAINS, EXCLUSIVE_CATEGORY } from "../support/catalog"
import { stubPrivateMarketplaceCatalog } from "../support/marketplace"
import { stubCreateConfig } from "../support/sharing"
import { stubSkillContents } from "../support/skill-contents"
import { stubSkillIndex } from "../support/skill-index"

import type { ConfigurePage } from "../pages/configure-page"

// A dialog hands focus back to the control that opened it, however it closes.
// A field focused as it MOUNTS is focused before the dialog records what had
// focus, which loses the way back — so each case also asserts the caret's
// landing on open. Every dialog is opened from the keyboard.

const [FIRST] = SKILL_INDEX.skills
const FIRST_NAME = FIRST!.name

// As the add-skill dropdown spells it.
const CATEGORY = `${DOMAINS.web.toLowerCase()} · ${EXCLUSIVE_CATEGORY.name.toLowerCase()}`

type Closing = {
  how: string
  close: (configure: ConfigurePage) => Promise<void>
}

test.describe("the add skill dialog", () => {
  test.beforeEach(({ page }) => {
    stubSkillIndex(page)
  })

  const CLOSINGS: Closing[] = [
    {
      how: "Escape",
      close: (configure) => configure.page.keyboard.press("Escape"),
    },
    {
      how: "Cancel",
      close: (configure) => configure.addSkillDialog.cancel(),
    },
    {
      how: "adding a skill",
      close: async (configure) => {
        stubSkillContents(configure.page)
        const dialog = configure.addSkillDialog
        await dialog.stage(FIRST_NAME)
        await dialog.categorise(FIRST_NAME, CATEGORY)
        await dialog.confirm()
      },
    },
  ]

  for (const { how, close } of CLOSINGS) {
    test(`hands focus back to Add skill after ${how}`, async ({
      configure,
    }) => {
      await configure.addSkillButton.press("Enter")
      await expect(configure.addSkillDialog.searchInput).toBeFocused()

      await close(configure)

      await expect(configure.addSkillDialog.root).toBeHidden()
      await expect(configure.addSkillButton).toBeFocused()
    })
  }
})

test.describe("the marketplace dialog", () => {
  const CLOSINGS: Closing[] = [
    {
      how: "Escape",
      close: (configure) => configure.page.keyboard.press("Escape"),
    },
    {
      how: "Cancel",
      close: (configure) => configure.marketplaceDialog.cancel(),
    },
    // An empty field is the public catalogue, so Load seats it and closes.
    {
      how: "loading the public catalogue",
      close: (configure) => configure.marketplaceDialog.load(),
    },
  ]

  for (const { how, close } of CLOSINGS) {
    test(`hands focus back to the rail after ${how}`, async ({ configure }) => {
      await configure.marketplaceButton.press("Enter")
      await expect(configure.marketplaceDialog.marketplaceInput).toBeFocused()

      await close(configure)

      await expect(configure.marketplaceDialog.root).toBeHidden()
      await expect(configure.marketplaceButton).toBeFocused()
    })
  }

  // With a token saved, the token field is the one it opens on.
  test("hands focus back to the rail when it opened on the token", async ({
    configure,
    page,
  }) => {
    stubPrivateMarketplaceCatalog(page)
    await configure.seedSavedMarketplaces({
      current: PRIVATE_MARKETPLACE_CANONICAL_REF,
      saved: { [PRIVATE_MARKETPLACE_CANONICAL_REF]: MARKETPLACE_TOKEN },
    })
    await configure.goto()

    await configure.marketplaceButton.press("Enter")
    await expect(configure.marketplaceDialog.tokenInput).toBeFocused()

    await page.keyboard.press("Escape")

    await expect(configure.marketplaceDialog.root).toBeHidden()
    await expect(configure.marketplaceButton).toBeFocused()
  })
})

test.describe("the save dialog", () => {
  const CLOSINGS: Closing[] = [
    {
      how: "Escape",
      close: (configure) => configure.page.keyboard.press("Escape"),
    },
    {
      how: "Cancel",
      close: (configure) => configure.saveStackDialog.cancel(),
    },
    {
      how: "saving",
      close: async (configure) => {
        await configure.page.keyboard.type("Weekday")
        await configure.page.keyboard.press("Enter")
      },
    },
  ]

  for (const { how, close } of CLOSINGS) {
    test(`hands focus back to Save after ${how}`, async ({ configure }) => {
      const dialog = configure.saveStackDialog
      await configure
        .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
        .toggle()

      await configure.roster.saveButton.press("Enter")
      await expect(dialog.nameInput).toBeFocused()

      await close(configure)

      await expect(dialog.root).toBeHidden()
      await expect(configure.roster.saveButton).toBeFocused()
    })
  }
})

// The control: the install dialog focuses no field on open and has always
// handed focus back. Opening it mints the command's id, hence the stub.
test("the install dialog hands focus back to Install", async ({
  configure,
  page,
}) => {
  stubCreateConfig(page)
  await configure.roster.installButton.press("Enter")
  await expect(configure.installDialog.root).toBeVisible()

  await page.keyboard.press("Escape")

  await expect(configure.installDialog.root).toBeHidden()
  await expect(configure.roster.installButton).toBeFocused()
})
