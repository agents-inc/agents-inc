import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { stack, stubSignedIn } from "../support/auth"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  STACKS,
} from "../support/catalog"
import {
  STORED_ID,
  stubGetConfig,
  stubGetConfigMissing,
} from "../support/sharing"

import type { Page } from "@playwright/test"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT, second: VUE } = EXCLUSIVE_CATEGORY
const { name: STYLING, first: TAILWIND } = MULTI_CATEGORY

const SAVE = "Weekday"

// A save is applied when the selection matches it; a save taken from scratch
// carries no `stackId` to say so on its own. Scratch is located by its cleared
// words, since a selection is always present here.
test.describe("a named save, applied", () => {
  // Vue saved, React on screen, so the confirm stands between them.
  test.beforeEach(async ({ configure, page }) => {
    await configure.skillIn(web, CATEGORY, VUE).toggle()
    await configure.roster.saveButton.click()
    await configure.saveStackDialog.saveAs(SAVE)
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await page.reload()
    await configure.stacks.waitFor()

    await configure.stack(SAVE).click()
    await configure.stackSwitchDialog.confirm()
  })

  test("draws its own cell as the applied stack", async ({ configure }) => {
    await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack(STACKS.clearScratch)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  test("leaves nothing to lose, so the next stack applies unprompted", async ({
    configure,
  }) => {
    const react = configure.skillIn(web, CATEGORY, REACT)
    const vue = configure.skillIn(web, CATEGORY, VUE)

    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.stackSwitchDialog.root).toBeHidden()
    await expect(react.root).toHaveAttribute("aria-pressed", "true")
    await expect(vue.root).toHaveAttribute("aria-pressed", "false")
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  test("an edit on top of it brings the confirm back", async ({
    configure,
  }) => {
    const vue = configure.skillIn(web, CATEGORY, VUE)
    const tailwind = configure.skillIn(web, STYLING, TAILWIND)

    await tailwind.toggle()
    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.stackSwitchDialog.root).toBeVisible()
    await configure.stackSwitchDialog.cancel()

    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
    await expect(tailwind.root).toHaveAttribute("aria-pressed", "true")
    await expect(configure.skillIn(web, CATEGORY, REACT).root).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  test("stays applied across a reload", async ({ configure, page }) => {
    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack(STACKS.clearScratch)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })
})

test.describe("saving the current selection", () => {
  test("draws the new cell as the applied stack straight away", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await configure.roster.saveButton.click()
    await configure.saveStackDialog.saveAs(SAVE)

    await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack(STACKS.clearScratch)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  // Applied is per save: only the one the selection matches lights up.
  test("lights only the save the selection matches", async ({ configure }) => {
    const dialog = configure.saveStackDialog

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.saveButton.click()
    await dialog.saveAs("A")
    await configure.skillIn(web, CATEGORY, VUE).toggle()
    await configure.roster.saveButton.click()
    await dialog.saveAs("B")

    await expect(configure.stack("B")).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack("A")).toHaveAttribute("aria-pressed", "false")
  })
})

// The selection is a stack and a save of it, so the save's cell is the lit one
// and the stack's can still be pressed.
test.describe("a stack under a save of it", () => {
  // The public catalogue's saved configuration.
  const CONFIG_KEY = "agents-inc:config:v1"

  // Every write to it from here on. The slot's bytes cannot show one: a write
  // of what it already holds leaves them as they were. Slipped in under
  // `localStorage` alone, since a property set on a Storage is stored.
  const watchConfigWrites = async (page: Page) => {
    const writes = await page.evaluateHandle((key) => {
      const seen: string[] = []
      const watched = {
        setItem(this: Storage, name: string, value: string) {
          if (name === key) seen.push(value)
          Storage.prototype.setItem.call(this, name, value)
        },
      }
      Object.setPrototypeOf(watched, Storage.prototype)
      Object.setPrototypeOf(window.localStorage, watched)
      return seen
    }, CONFIG_KEY)

    return () => writes.jsonValue()
  }

  test.beforeEach(async ({ configure }) => {
    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.saveButton.click()
    await configure.saveStackDialog.saveAs(SAVE)

    await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  // The control, and the proof that the watch reports a write.
  test("a press on another stack writes the saved configuration once", async ({
    configure,
    page,
  }) => {
    const writes = await watchConfigWrites(page)

    await configure.chooseStack(STACKS.t3)

    await expect(configure.stack(STACKS.t3)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(await writes()).toStrictEqual([await configure.storedConfig()])
  })

  // Nothing on screen moves, so the next stack's write is what is waited on:
  // anything the first press wrote lands ahead of it.
  test("a press on the stack itself writes nothing", async ({
    configure,
    page,
  }) => {
    const writes = await watchConfigWrites(page)

    await configure.chooseStack(STACKS.nextjs)
    await configure.chooseStack(STACKS.t3)

    await expect(configure.stack(STACKS.t3)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    expect(await writes()).toStrictEqual([await configure.storedConfig()])
  })
})

// An account's save is recognised by its payload, which the grid reads as the
// account's stacks arrive. Where that read failed, the click reads it again,
// and the stack it applies is the account's save all the same.
test.describe("an account's saved stack, applied", () => {
  // Applied with nothing unsaved, so it applies at once. The click's read
  // loads; the grid's own read went `firstRead`.
  const appliedAfterTheGridsRead = async (
    page: Page,
    firstRead: "loaded" | "failed"
  ) => {
    stubSignedIn(page, [stack(SAVE, STORED_ID)])
    if (firstRead === "failed") stubGetConfigMissing(page, STORED_ID)
    else stubGetConfig(page, STORED_ID)
    const gridsRead = page.waitForResponse((response) =>
      response.url().endsWith(`/configs/${STORED_ID}`)
    )
    const configure = new ConfigurePage(page)
    await configure.goto()
    expect((await gridsRead).ok()).toBe(firstRead === "loaded")

    stubGetConfig(page, STORED_ID)
    await configure.chooseStack(STACKS.nextjs)
    await configure.stack(SAVE).click()
    await expect(configure.skillIn(web, CATEGORY, REACT).root).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "false"
    )

    return configure
  }

  test("draws its own cell as the applied stack when the grid's read loaded it", async ({
    page,
  }) => {
    const configure = await appliedAfterTheGridsRead(page, "loaded")

    await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "true")
  })

  test("draws its own cell as the applied stack when the grid's read failed and the click's loaded it", async ({
    page,
  }) => {
    const configure = await appliedAfterTheGridsRead(page, "failed")

    await expect(configure.stack(SAVE)).toHaveAttribute("aria-pressed", "true")
  })

  // The next stack applying is waited on first: the question opening is what
  // keeps it from applying, and its absence alone would pass before it opened.
  test("leaves nothing to lose, so the next stack applies unprompted, when the grid's read loaded it", async ({
    page,
  }) => {
    const configure = await appliedAfterTheGridsRead(page, "loaded")

    await configure.chooseStack(STACKS.t3)

    await expect(configure.stack(STACKS.t3)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.stackSwitchDialog.root).toBeHidden()
  })

  test("leaves nothing to lose, so the next stack applies unprompted, when the grid's read failed and the click's loaded it", async ({
    page,
  }) => {
    const configure = await appliedAfterTheGridsRead(page, "failed")

    await configure.chooseStack(STACKS.t3)

    await expect(configure.stack(STACKS.t3)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
    await expect(configure.stackSwitchDialog.root).toBeHidden()
  })

  // The case the question is for, and the proof that `stackSwitchDialog`
  // reports it when it opens.
  test("an edit on top of it brings the question back", async ({ page }) => {
    const configure = await appliedAfterTheGridsRead(page, "failed")
    const tailwind = configure.skillIn(web, STYLING, TAILWIND)

    await tailwind.toggle()
    await configure.chooseStack(STACKS.t3)

    await expect(configure.stackSwitchDialog.root).toBeVisible()
    await configure.stackSwitchDialog.cancel()

    await expect(tailwind.root).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack(STACKS.t3)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })
})
