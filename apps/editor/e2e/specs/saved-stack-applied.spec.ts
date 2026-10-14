import { expect, test } from "../fixtures"
import {
  DOMAINS,
  EXCLUSIVE_CATEGORY,
  MULTI_CATEGORY,
  STACKS,
} from "../support/catalog"

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
