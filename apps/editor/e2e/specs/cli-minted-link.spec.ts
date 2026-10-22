import {
  cliMintedPayload,
  cliMintedStackPayload,
  freshlyPickedSkill,
} from "@workspace/api-mocks/fixtures"

import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  STACKS,
  stackIdOf,
} from "../support/catalog"
import { stubGetConfig } from "../support/sharing"

// A bare `edit` mints with no stack id, so the editor recognises the stack by
// what the link holds: a built-in stack it equals, a save in this browser it
// equals, or else Start from scratch.

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
