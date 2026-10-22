import {
  cliMintedPayload,
  freshlyPickedSkill,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import {
  STORED_ID,
  captureCreateConfig,
  stubGetConfig,
} from "../support/sharing"

import type { ConfigurePage } from "../pages/configure-page"

// `init --from` writes a configuration's description into config.ts, and a
// bare `edit` mints it back; an id the editor mints from that link carries it
// on.

const LINK_ID = "Descr001"
const DESCRIPTION = "The house web app, as installed."

const REACT_ID = "web-framework-react"

// One skill, so the link is no built-in stack and keeps its own words.
const described = () => ({
  ...cliMintedPayload({ [REACT_ID]: freshlyPickedSkill(REACT_ID) }),
  description: DESCRIPTION,
})

const openDescribedLink = async (configure: ConfigurePage) => {
  await configure.page.goto(`/?fromId=${LINK_ID}`)
  await expect(configure.skill(EXCLUSIVE_CATEGORY.first).root).toHaveAttribute(
    "aria-pressed",
    "true"
  )
}

const mintFromInstallDialog = async (configure: ConfigurePage) => {
  await configure.roster.installButton.click()
  await expect(
    configure.installDialog.command(`npx agents-inc init --from ${STORED_ID}`)
  ).toBeVisible()
}

test.describe("a link that arrived with a description", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] })

  test.beforeEach(({ page }) => {
    stubGetConfig(page, LINK_ID, described())
  })

  test("carries it on the id the Install dialog mints", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    await openDescribedLink(configure)

    await mintFromInstallDialog(configure)

    expect(posted.at(-1)?.description).toBe(DESCRIPTION)
  })

  test("carries it on the link Share copies", async ({ configure, page }) => {
    const posted = captureCreateConfig(page)
    await openDescribedLink(configure)

    await configure.roster.shareLink()

    expect(posted.at(-1)?.description).toBe(DESCRIPTION)
  })

  // A stack has its own description, which the install writes instead.
  test("leaves it behind once a stack is applied", async ({
    configure,
    page,
  }) => {
    const posted = captureCreateConfig(page)
    await openDescribedLink(configure)

    await configure.chooseStack(STACKS.nextjs)
    await configure.stackSwitchDialog.confirm()
    await mintFromInstallDialog(configure)

    expect(posted.at(-1)).toBeDefined()
    expect(posted.at(-1)).not.toHaveProperty("description")
  })
})
