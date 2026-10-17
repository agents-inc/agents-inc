import { expect, test } from "../fixtures"
import { SAVED_STACK } from "../pages/configure-page"
import type { SaveStackDialog } from "../pages/dialogs"
import { DOMAINS, EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import {
  STORED_ID,
  STORED_PAYLOAD,
  captureCreateConfig,
} from "../support/sharing"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT, second: VUE } = EXCLUSIVE_CATEGORY

const PLACEHOLDER = "e.g. client work"
const EMPTY = "Give this stack a name."
const TOO_LONG = "Keep the name to 80 characters or fewer."
const UNIQUE = (name: string) =>
  `Names must be unique. There's already a stack called “${name}”.`

// The server's `nameSchema` cap, plus one.
const OVER_THE_CAP = "a".repeat(81)

test.describe("the rail's Save", () => {
  test("offers nothing to an empty selection", async ({ configure }) => {
    await expect(configure.roster.saveButton).toBeDisabled()
  })

  test("becomes available once a skill is selected", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(configure.roster.saveButton).toBeEnabled()
  })

  // Share's rule: agents alone are not a stack.
  test("a pinned bare agent does not make the selection saveable", async ({
    configure,
  }) => {
    await configure.roster.agentButton("web", "developer").click()
    await expect(configure.roster.installButton).toContainText("0 skills")

    await expect(configure.roster.saveButton).toBeDisabled()
  })

  test("sits before Share on the action row", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    const save = (await configure.roster.saveButton.boundingBox())!
    const share = (await configure.roster.shareButton.boundingBox())!
    const preview = (await configure.roster.previewButton.boundingBox())!

    expect(save.y).toBe(share.y)
    expect(share.y).toBe(preview.y)
    expect(save.x).toBeLessThan(share.x)
    expect(share.x).toBeLessThan(preview.x)
  })

  test("gives the three actions an equal share of the row", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    const save = (await configure.roster.saveButton.boundingBox())!
    const share = (await configure.roster.shareButton.boundingBox())!
    const preview = (await configure.roster.previewButton.boundingBox())!

    expect(save.width).toBeCloseTo(share.width, 0)
    expect(share.width).toBeCloseTo(preview.width, 0)
  })
})

test.describe("the save dialog", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
  })

  test("opens on Save with an empty, focused Name, and writes nothing yet", async ({
    configure,
  }) => {
    const dialog = configure.saveStackDialog

    await configure.roster.saveButton.click()

    await expect(dialog.root).toBeVisible()
    await expect(dialog.nameInput).toBeFocused()
    await expect(dialog.nameInput).toHaveValue("")
    await expect(dialog.nameInput).toHaveAttribute("placeholder", PLACEHOLDER)
    expect(await dialog.stored()).toBeNull()
  })

  test("puts the named save in the grid straight after scratch", async ({
    configure,
    page,
  }) => {
    const dialog = configure.saveStackDialog

    await configure.roster.saveButton.click()
    await dialog.saveAs("Weekday")

    await expect(configure.stackCell(1)).toHaveAccessibleName("Weekday")

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.stackCell(0)).toHaveAccessibleName(
      STACKS.clearScratch
    )
    await expect(configure.stackCell(1)).toHaveAccessibleName("Weekday")
  })

  for (const [how, close] of [
    ["Cancel", (dialog: SaveStackDialog) => dialog.cancel()],
    ["Escape", (dialog: SaveStackDialog) => dialog.nameInput.press("Escape")],
  ] as const) {
    test(`${how} closes it and adds nothing`, async ({ configure }) => {
      const dialog = configure.saveStackDialog

      await configure.roster.saveButton.click()
      await dialog.fill("Weekday")
      await close(dialog)

      await expect(dialog.root).toBeHidden()
      await expect(configure.stack("Weekday")).toHaveCount(0)
      expect(await dialog.stored()).toBeNull()
    })
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`saves from the keyboard alone, ${scheme}`, async ({
      configure,
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme })
      const dialog = configure.saveStackDialog

      await configure.roster.saveButton.focus()
      await page.keyboard.press("Enter")
      await expect(dialog.nameInput).toBeFocused()
      await page.keyboard.type("Weekday")
      await page.keyboard.press("Enter")

      await expect(dialog.root).toBeHidden()
      await expect(configure.stack("Weekday")).toBeVisible()
    })
  }
})

test.describe("naming a save", () => {
  test.beforeEach(async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.saveButton.click()
  })

  test("refuses an empty name on submit", async ({ configure }) => {
    const dialog = configure.saveStackDialog

    await dialog.fill("   ")
    await dialog.save()

    await expect(dialog.alert).toHaveText(EMPTY)
    await expect(dialog.root).toBeVisible()
    expect(await dialog.stored()).toBeNull()
  })

  test("says nothing before the first submit, then re-checks every change", async ({
    configure,
  }) => {
    const dialog = configure.saveStackDialog

    await dialog.fill(OVER_THE_CAP)
    await expect(dialog.alert).toHaveCount(0)

    await dialog.save()
    await expect(dialog.alert).toHaveText(TOO_LONG)

    await dialog.fill("Weekday")
    await expect(dialog.alert).toHaveCount(0)

    await dialog.fill("")
    await expect(dialog.alert).toHaveText(EMPTY)
    expect(await dialog.stored()).toBeNull()
  })

  for (const name of [
    STACKS.nextjs.toUpperCase(),
    ` ${STACKS.scratch.toLowerCase()} `,
  ]) {
    test(`refuses "${name}", a name the grid already draws`, async ({
      configure,
    }) => {
      const dialog = configure.saveStackDialog

      await dialog.fill(name)
      await dialog.save()

      await expect(dialog.alert).toHaveText(UNIQUE(name.trim()))
      expect(await dialog.stored()).toBeNull()
    })
  }

  test("refuses a saved name in any case, in place, then takes a fresh one", async ({
    configure,
  }) => {
    const dialog = configure.saveStackDialog
    await dialog.saveAs("Weekday")
    await configure.roster.saveButton.click()

    await dialog.fill(" weekday ")
    await dialog.save()

    await expect(dialog.alert).toHaveText(UNIQUE("weekday"))
    await expect(dialog.nameInput).toHaveAttribute("aria-invalid", "true")
    await expect(dialog.nameInput).toHaveAccessibleDescription(
      UNIQUE("weekday")
    )
    await expect(dialog.root).toBeVisible()
    await expect(dialog.nameInput).toHaveValue(" weekday ")
    expect((await dialog.stored())?.map((save) => save.name)).toStrictEqual([
      "Weekday",
    ])

    await dialog.fill("Weekday 2")
    await dialog.save()

    await expect(dialog.root).toBeHidden()
    expect((await dialog.stored())?.map((save) => save.name)).toStrictEqual([
      "Weekday 2",
      "Weekday",
    ])
  })
})

test.describe("named saves in the grid", () => {
  test("two names give two cells, newest first, and keep the first", async ({
    configure,
    page,
  }) => {
    const dialog = configure.saveStackDialog
    const react = configure.skillIn(web, CATEGORY, REACT)
    const vue = configure.skillIn(web, CATEGORY, VUE)

    await react.toggle()
    await configure.roster.saveButton.click()
    await dialog.saveAs("A")
    await vue.toggle()
    await configure.roster.saveButton.click()
    await dialog.saveAs("B")

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.stackCell(1)).toHaveAccessibleName("B")
    await expect(configure.stackCell(2)).toHaveAccessibleName("A")

    // B is what is on screen, so there is nothing to lose and no confirm.
    await configure.stack("A").click()

    await expect(react.root).toHaveAttribute("aria-pressed", "true")
    await expect(vue.root).toHaveAttribute("aria-pressed", "false")
  })

  test("applying one over real edits asks by its name, and restores it", async ({
    configure,
  }) => {
    const dialog = configure.saveStackDialog
    const react = configure.skillIn(web, CATEGORY, REACT)
    const vue = configure.skillIn(web, CATEGORY, VUE)

    await react.toggle()
    await configure.roster.saveButton.click()
    await dialog.saveAs("A")
    await vue.toggle()

    await configure.stack("A").click()

    await expect(configure.stackSwitchDialog.root).toContainText("Switch to A?")
    await configure.stackSwitchDialog.confirm()

    await expect(react.root).toHaveAttribute("aria-pressed", "true")
    await expect(vue.root).toHaveAttribute("aria-pressed", "false")
  })

  test("cancelling the switch leaves the work alone", async ({ configure }) => {
    const dialog = configure.saveStackDialog
    const react = configure.skillIn(web, CATEGORY, REACT)
    const vue = configure.skillIn(web, CATEGORY, VUE)

    await react.toggle()
    await configure.roster.saveButton.click()
    await dialog.saveAs("A")
    await vue.toggle()

    await configure.stack("A").click()
    await configure.stackSwitchDialog.cancel()

    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
    await expect(react.root).toHaveAttribute("aria-pressed", "false")
  })

  // The retired single slot is never read.
  test("draws nothing for a save under the retired single-slot key", async ({
    configure,
  }) => {
    await configure.seedSavedStack(STORED_PAYLOAD)
    await configure.goto()

    await expect(configure.stack(SAVED_STACK)).toHaveCount(0)
  })

  // Same catalog, so what the CLI is handed is byte-for-byte the same.
  test("mints the payload it was saved from", async ({ configure, page }) => {
    const posted = captureCreateConfig(page)
    const dialog = configure.saveStackDialog

    // Opening Install mints, which puts the payload on the wire.
    const mint = async () => {
      const before = posted.length
      await configure.roster.installButton.click()
      await expect(
        configure.installDialog.command(
          `npx agents-inc init --from ${STORED_ID}`
        )
      ).toBeVisible()
      await configure.installDialog.close()

      return posted[before]
    }

    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.subAgents.setModel("web-developer", "fable")
    const saved = await mint()

    await configure.roster.saveButton.click()
    await dialog.saveAs("Weekday")
    await configure.skillIn(web, CATEGORY, VUE).toggle()

    await page.reload()
    await configure.stacks.waitFor()
    await configure.stack("Weekday").click()
    await configure.stackSwitchDialog.confirm()

    expect(saved).toBeDefined()
    expect(await mint()).toStrictEqual(saved)
  })
})
