import type { Page } from "@playwright/test"

import {
  cliMintedPayload,
  cliMintedStackPayload,
  freshlyPickedSkill,
  seedPayload,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stack, stubSignedIn } from "../support/auth"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  STACKS,
  stackIdOf,
} from "../support/catalog"
import { stubGetConfig } from "../support/sharing"

// A bare `edit` mints with no stack id, so the editor recognises the stack by
// what the link holds: a built-in stack it equals, a save in this browser or in
// the signed-in account it equals, or else Start from scratch.

const LINK_ID = "CliMint1"

const SAVE = "Weekday"

// Written out: the payload names skills by id.
const REACT_ID = "web-framework-react"
const TAILWIND_ID = "web-styling-tailwind"

const nextjsAsMinted = () => cliMintedStackPayload(stackIdOf(STACKS.nextjs))

test.describe("a link the CLI minted from an installed stack", () => {
  test.beforeEach(({ page }) => {
    stubGetConfig(page, LINK_ID, nextjsAsMinted())
  })

  test("opens on that stack", async ({ configure, page }) => {
    await page.goto(`/?fromId=${LINK_ID}`)

    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.stack(STACKS.clearScratch)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  // As the stack applied: nothing that exists nowhere else.
  test("leaves nothing to lose, so the next stack applies unprompted", async ({
    configure,
    page,
  }) => {
    await page.goto(`/?fromId=${LINK_ID}`)
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )

    await configure.chooseStack(STACKS.t3)

    await expect(configure.stackSwitchDialog.root).toBeHidden()
    await expect(configure.stack(STACKS.t3)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })
})

test("a link the CLI minted holding more than a stack opens on Start from scratch", async ({
  configure,
  page,
}) => {
  const stack = nextjsAsMinted()
  stubGetConfig(page, LINK_ID, {
    ...stack,
    skills: { ...stack.skills, [TAILWIND_ID]: freshlyPickedSkill(TAILWIND_ID) },
  })

  await page.goto(`/?fromId=${LINK_ID}`)

  await expect(configure.stack(STACKS.clearScratch)).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
    "aria-pressed",
    "false"
  )
})

test("a link the CLI minted lights the save in this browser it equals", async ({
  configure,
  page,
}) => {
  stubGetConfig(
    page,
    LINK_ID,
    cliMintedPayload({ [REACT_ID]: freshlyPickedSkill(REACT_ID) })
  )
  await configure
    .skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, EXCLUSIVE_CATEGORY.first)
    .toggle()
  await configure.roster.saveButton.click()
  await configure.saveStackDialog.saveAs(SAVE)
  // Moved off the save, so it is the link that lights it.
  await configure
    .skillIn(DOMAINS.web, MULTI_CATEGORY.name, MULTI_CATEGORY.first)
    .toggle()
  await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "false")

  await page.goto(`/?fromId=${LINK_ID}`)

  await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "true")
  await expect(configure.stack(STACKS.clearScratch)).toHaveAttribute(
    "aria-pressed",
    "false"
  )
})

// An account's save is behind its config id, so the grid reads the payload to
// match it, as it reads a local save's.
test.describe("a link the CLI minted, opened signed in", () => {
  const ACCOUNT_SAVE_ID = "AcctSav1"

  // As the editor saves a fresh pick: no stack id, no sub-agent pinned.
  const reactAsSaved = () =>
    seedPayload({
      skills: { [REACT_ID]: freshlyPickedSkill(REACT_ID) },
      agents: {},
    })

  const arriveAt = async (page: Page) => {
    const configure = new ConfigurePage(page)
    await page.goto(`/?fromId=${LINK_ID}`)
    return configure
  }

  test.beforeEach(({ page }) => {
    stubSignedIn(page, [stack(SAVE, ACCOUNT_SAVE_ID)])
    stubGetConfig(
      page,
      LINK_ID,
      cliMintedPayload({ [REACT_ID]: freshlyPickedSkill(REACT_ID) })
    )
  })

  test("lights the save in the account it equals", async ({ page }) => {
    stubGetConfig(page, ACCOUNT_SAVE_ID, reactAsSaved())
    const configure = await arriveAt(page)

    await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack(STACKS.clearScratch)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  // The control: an account save is matched whole, not merely listed.
  test("opens on Start from scratch when the account's save holds more", async ({
    page,
  }) => {
    const saved = reactAsSaved()
    stubGetConfig(page, ACCOUNT_SAVE_ID, {
      ...saved,
      skills: {
        ...saved.skills,
        [TAILWIND_ID]: freshlyPickedSkill(TAILWIND_ID),
      },
    })
    const configure = await arriveAt(page)

    await expect(configure.stack(STACKS.clearScratch)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "false")
  })
})
