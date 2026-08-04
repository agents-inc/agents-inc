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

// The saved snapshot is a stack like the seventeen beside it, so applying it
// has to feel like applying one: its own cell lights up, and the selection it
// restores is not an edit of anything — it is what the user chose to keep.
//
// Both halves of that follow from one fact the grid does not use yet: the
// selection matching the snapshot is what "the saved stack is applied" means.
// A snapshot taken from scratch carries no `stackId`, so nothing about the
// stored selection can say it on its own.
test.describe("the saved stack, applied", () => {
  // Vue in the slot, React on screen: the selection differs from the snapshot,
  // so the confirm stands between them — as it must, since restoring would
  // throw away work that belongs to no stack.
  test.beforeEach(async ({ configure, page }) => {
    await configure.skillIn(web, CATEGORY, VUE).toggle()
    await configure.roster.saveButton.click()
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await page.reload()
    await configure.stacks.waitFor()

    await configure.savedStack.click()
    await configure.stackSwitchDialog.confirm()
  })

  // Scratch is what a snapshot taken from scratch would otherwise light up,
  // which reads as "no stack" over a selection the user deliberately named.
  test("draws its own cell as the applied stack", async ({ configure }) => {
    await expect(configure.savedStack).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack(STACKS.scratch)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })

  // The confirm protects work that would otherwise be lost. Straight after
  // applying the snapshot there is none: what is on screen is the snapshot, and
  // it survives in the slot whatever the next click does.
  test("leaves nothing to lose, so the next stack applies unprompted", async ({
    configure,
  }) => {
    const react = configure.skillIn(web, CATEGORY, REACT)
    const vue = configure.skillIn(web, CATEGORY, VUE)

    await configure.chooseStack(STACKS.nextjs)

    await expect(configure.stackSwitchDialog.root).toBeHidden()
    // And the stack landed whole: its React in, the snapshot's Vue out. A
    // dialog arriving a tick late would still be caught here, since an
    // unconfirmed switch applies nothing.
    await expect(react.root).toHaveAttribute("aria-pressed", "true")
    await expect(vue.root).toHaveAttribute("aria-pressed", "false")
    await expect(configure.stack(STACKS.nextjs)).toHaveAttribute(
      "aria-pressed",
      "true"
    )
  })

  // The other side of the same rule: one skill on top of the snapshot is work
  // that exists nowhere else, so the guard comes straight back.
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

  // Derived from the selection rather than stored, so it has to be re-derived
  // from what rehydrates — a cell that forgets on reload is worse than one that
  // never lit up.
  test("stays applied across a reload", async ({ configure, page }) => {
    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.savedStack).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack(STACKS.scratch)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })
})

// Saving is the one moment the selection is certain to equal the snapshot, so
// the cell it puts in the grid is applied the instant it appears. The cell
// appearing is the whole feedback for Save — a cell that appears unlit says the
// button did something to a stack the user is not on.
test.describe("saving the current selection", () => {
  test("draws the new cell as the applied stack straight away", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await configure.roster.saveButton.click()

    await expect(configure.savedStack).toBeVisible()
    await expect(configure.savedStack).toHaveAttribute("aria-pressed", "true")
    await expect(configure.stack(STACKS.scratch)).toHaveAttribute(
      "aria-pressed",
      "false"
    )
  })
})
