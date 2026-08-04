import { expect, test } from "../fixtures"
import { SAVED_STACK } from "../pages/configure-page"
import { DOMAINS, EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import { STORED_ID, captureCreateConfig } from "../support/sharing"

const { web } = DOMAINS
const { name: CATEGORY, first: REACT, second: VUE } = EXCLUSIVE_CATEGORY

// The current selection dies with the browser's config state. Saving snapshots
// it — the same serialization sharing sends — into a slot of its own, which
// then sits in the stack grid as a starting point like any other stack.
test.describe("saving a stack", () => {
  test("Save offers nothing to an empty selection", async ({ configure }) => {
    await expect(configure.roster.saveButton).toBeDisabled()
  })

  test("Save becomes available once a skill is selected", async ({
    configure,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    await expect(configure.roster.saveButton).toBeEnabled()
  })

  // The same rule Share follows: agents alone are not a stack, so a pinned
  // bare agent leaves nothing worth snapshotting.
  test("a pinned bare agent does not make the selection saveable", async ({
    configure,
  }) => {
    await configure.roster.agentButton("web", "developer").click()
    await expect(configure.roster.installButton).toContainText("0 skills")

    await expect(configure.roster.saveButton).toBeDisabled()
  })

  test("Save sits above Share in the footer", async ({ configure }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()

    const save = (await configure.roster.saveButton.boundingBox())!
    const share = (await configure.roster.shareButton.boundingBox())!

    expect(save.y).toBeLessThan(share.y)
  })
})

// Where a saved stack lands: with the pre-built ones, in the slot straight
// after scratch, since it is a starting point rather than a stack the
// catalogue knows about.
test.describe("the saved stack in the grid", () => {
  test("joins the grid immediately after Start from scratch", async ({
    configure,
    page,
  }) => {
    await configure.skillIn(web, CATEGORY, REACT).toggle()
    await configure.roster.saveButton.click()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.stackCell(0)).toHaveAccessibleName(STACKS.scratch)
    await expect(configure.stackCell(1)).toHaveAccessibleName(SAVED_STACK)
  })

  test("applying it restores the saved selection", async ({
    configure,
    page,
  }) => {
    const react = configure.skillIn(web, CATEGORY, REACT)
    const vue = configure.skillIn(web, CATEGORY, VUE)

    await react.toggle()
    await configure.roster.saveButton.click()
    // The sibling swap: Vue is now the selection, React is not.
    await vue.toggle()

    await page.reload()
    await configure.stacks.waitFor()
    await configure.savedStack.click()
    await configure.stackSwitchDialog.confirm()

    await expect(react.root).toHaveAttribute("aria-pressed", "true")
    await expect(vue.root).toHaveAttribute("aria-pressed", "false")
  })

  // It replaces the whole selection exactly as a stack does, so it is guarded
  // by the same confirm — and cancelling has to leave the work alone.
  test("applying it over real edits asks first", async ({
    configure,
    page,
  }) => {
    const react = configure.skillIn(web, CATEGORY, REACT)
    const vue = configure.skillIn(web, CATEGORY, VUE)

    await react.toggle()
    await configure.roster.saveButton.click()
    await vue.toggle()

    await page.reload()
    await configure.stacks.waitFor()
    await configure.savedStack.click()

    await expect(configure.stackSwitchDialog.root).toBeVisible()
    await configure.stackSwitchDialog.cancel()

    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
    await expect(react.root).toHaveAttribute("aria-pressed", "false")
  })

  // One slot: saving again overwrites what is there rather than growing a
  // library, so the grid gains exactly one cell however often it is used.
  test("re-saving overwrites the single slot", async ({ configure, page }) => {
    const react = configure.skillIn(web, CATEGORY, REACT)
    const vue = configure.skillIn(web, CATEGORY, VUE)

    await react.toggle()
    await configure.roster.saveButton.click()
    await vue.toggle()
    await configure.roster.saveButton.click()
    // Wander off, so what comes back is the slot rather than what is on screen.
    await react.toggle()

    await page.reload()
    await configure.stacks.waitFor()

    await expect(configure.savedStack).toHaveCount(1)
    await configure.savedStack.click()
    await configure.stackSwitchDialog.confirm()

    await expect(vue.root).toHaveAttribute("aria-pressed", "true")
    await expect(react.root).toHaveAttribute("aria-pressed", "false")
  })

  // The strongest statement of "restores it exactly": what the CLI would be
  // handed after applying the saved stack is byte-for-byte what it would have
  // been handed at the moment it was saved. Same catalog, so `matrixVersion`
  // matches too.
  test("mints the payload it was saved from", async ({ configure, page }) => {
    const posted = await captureCreateConfig(page)

    // Opening the install dialog mints an id for the command, which is what
    // puts the payload on the wire where it can be read.
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
    // A per-agent override too: the snapshot is the whole selection, not the
    // list of skills in it.
    await configure.roster.modelWord("web-developer").click()
    const saved = await mint()

    await configure.roster.saveButton.click()
    await configure.skillIn(web, CATEGORY, VUE).toggle()

    await page.reload()
    await configure.stacks.waitFor()
    await configure.savedStack.click()
    await configure.stackSwitchDialog.confirm()

    expect(saved).toBeDefined()
    expect(await mint()).toEqual(saved)
  })
})
