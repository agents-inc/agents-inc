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
// Focus is a keyboard user's whole position on the page: dropped to `<body>`,
// the next Tab starts again from the top of the document.
//
// Both dialogs here put the caret in a field as they open, and that is exactly
// what lost the way back — a field focused as it MOUNTS is focused before the
// dialog has recorded what had focus, so what it recorded was the field, and
// the field is gone by the time the dialog closes. So each case also asserts
// where focus lands on opening: the fix may not cost the caret.
//
// Every dialog is opened from the keyboard, which is the path this is for.

const [FIRST] = SKILL_INDEX.skills
const FIRST_NAME = FIRST!.name

// Where a staged skill is filed, as the dropdown spells it. The same category
// `add-skill.spec.ts` files under, for the same reason.
const CATEGORY = `${DOMAINS.web.toLowerCase()} · ${EXCLUSIVE_CATEGORY.name.toLowerCase()}`

// One way a dialog ends, named for the failure message.
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
    // An empty field is the public catalogue, so Load seats it and closes —
    // the one way this dialog ends by doing what it is for.
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

  // The OTHER field the dialog can open on: with a token saved for the
  // marketplace it names, the token field is drawn from the start and is the
  // open question. A second field focused on mount, and the same way back.
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

// The control. The install dialog focuses no field as it opens, and it has
// always handed focus back — so the assertion above can pass, and a red one
// there is about the dialog rather than about the channel. It mints the
// install command's id as it opens, which is the stub.
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
