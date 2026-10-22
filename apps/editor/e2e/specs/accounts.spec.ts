import type { Locator } from "@playwright/test"

import { STACKS_URL } from "@workspace/api-mocks"
import {
  MARKETPLACE_CANONICAL_REF,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_REF,
} from "@workspace/api-mocks/fixtures"
import { HttpResponse, http } from "msw"

import { expect, test } from "../fixtures"
import { ConfigurePage } from "../pages/configure-page"
import { DOMAINS, EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import {
  BIGCO_CANONICAL_REF,
  stubMarketplaceEstate,
  stubPrivateMarketplaceCatalog,
} from "../support/marketplace"
import { stubWith } from "../support/stub"
import {
  SIGNED_IN_USER,
  holdStackSave,
  stack,
  stubCompose,
  stubSignInRefusalWithoutJson,
  stubSignInUnreachable,
  stubSignOutUnreachable,
  stubSignedIn,
  stubSignedOut,
  stubStackRefusal,
  type SavedStack,
} from "../support/auth"
import {
  OUT_OF_SCOPE_PAYLOAD,
  STORE_UNAVAILABLE,
  STORED_PAYLOAD,
  captureCreateConfig,
  stubCreateConfig,
  stubCreateConfigRefusal,
  stubCreateConfigUnreachable,
} from "../support/sharing"

type TestPage = Parameters<typeof stubSignedOut>[0]

// Signing in is additive. These build their own `ConfigurePage` so stubs land
// before first paint.
const arrive = async (page: TestPage) => {
  const configure = new ConfigurePage(page)
  await configure.goto()
  return configure
}

// Everything the page threw that nobody caught: a refusal has to come back as
// a value, since `void signIn()` has nowhere to put a rejection.
const uncaught = (page: TestPage) => {
  const thrown: string[] = []
  page.on("pageerror", (error) => thrown.push(error.message))
  return thrown
}

// Every stack-list request, stubbed or not, so a test can assert none was sent.
const stackRequests = (page: TestPage) => {
  const asked: string[] = []

  page.on("request", (request) => {
    if (request.url().startsWith(STACKS_URL)) asked.push(request.url())
  })

  return asked
}

// The one fixed wait: the claim is that nothing was thrown in this window.
const LONG_ENOUGH_TO_THROW_MS = 500

const STALE_TOKEN = "ghp_staleaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
const MARKETPLACE_SKILL = "Acme Widgets"

const UNIQUE = (name: string) =>
  `Names must be unique. There's already a stack called “${name}”.`

// An account's row says only that; a local save lists what it holds.
const IN_THE_ACCOUNT = "saved to your account"

const localSave = (configure: ConfigurePage, name: string) =>
  configure.stack(name).filter({ hasNotText: IN_THE_ACCOUNT })

const accountRow = (configure: ConfigurePage, name: string) =>
  configure.stack(name).filter({ hasText: IN_THE_ACCOUNT })

// By attribute: a modal hides everything else from role queries.
const openDialogs = (page: TestPage) =>
  page.locator('[role="dialog"], [role="alertdialog"]')

// The account's list answering only on `release`, so a sign-in can land while
// something else is already on screen. Install after `stubSignedIn`.
const holdStackList = (page: TestPage, stacks: SavedStack[]) => {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))

  stubWith(page, [
    http.get(STACKS_URL, async () => {
      await released
      return HttpResponse.json(stacks)
    }),
  ])

  return { release }
}

const HELD_LOAD_PATH = "/held-load"

// The page's `load` waiting on an image answered only on `release`, so
// whatever opens on arrival is up before `goto()` returns from `page.goto`.
const holdPageLoad = async (page: TestPage) => {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))

  stubWith(page, [
    http.get(`*${HELD_LOAD_PATH}`, async () => {
      await released
      return new HttpResponse(null, { status: 204 })
    }),
  ])
  await page.addInitScript((path) => {
    document.addEventListener("DOMContentLoaded", () => {
      const image = document.createElement("img")
      image.hidden = true
      image.src = path
      document.body.append(image)
    })
  }, HELD_LOAD_PATH)

  return { release }
}

// Seeded after a first visit: `localStorage` belongs to the served origin.
const arriveHolding = async (
  page: TestPage,
  saves: { name: string; payload: unknown }[]
) => {
  const configure = await arrive(page)
  await configure.saveStackDialog.seed(saves)
  await configure.goto()
  return configure
}

const openSaveDialog = async (configure: ConfigurePage) => {
  await configure.chooseStack(STACKS.nextjs)
  await configure.roster.saveButton.click()
  return configure.saveStackDialog
}

test.describe("signed out", () => {
  test("the editor works, and offers a way in", async ({ page }) => {
    stubSignedOut(page)
    const configure = await arrive(page)

    await expect(configure.stacks).toBeVisible()
    await expect(configure.skillCells.first()).toBeVisible()
    await expect(configure.signInButton).toBeVisible()
  })

  // The one case that proves `stubSignedOut` installs anything: every other
  // call site is already signed out by the fixture.
  test("a signed-in page can be signed out again", async ({ page }) => {
    stubSignedIn(page)
    stubSignedOut(page)
    const configure = await arrive(page)

    await expect(configure.signInButton).toBeVisible()
  })

  // The rail refreshes whatever the result, so the absent alert is the claim.
  test("pressing Sign out signs the browser out and says nothing went wrong", async ({
    page,
  }) => {
    stubSignedIn(page)
    const configure = await arrive(page)
    await expect(configure.signOutButton).toBeVisible()

    stubSignedOut(page)
    await configure.signOutButton.click()

    await expect(configure.signInButton).toBeVisible()
    await expect(configure.accountNotice).toHaveCount(0)
  })

  test("asks for no stacks at all", async ({ page }) => {
    stubSignedOut(page)
    const asked = stackRequests(page)
    const configure = await arrive(page)

    await expect(configure.signInButton).toBeVisible()
    expect(asked).toStrictEqual([])
  })

  test("saving puts the named save in the grid", async ({ page }) => {
    stubSignedOut(page)
    const configure = await arrive(page)

    const dialog = await openSaveDialog(configure)
    await dialog.saveAs("Weekday")

    await expect(localSave(configure, "Weekday")).toBeVisible()
  })
})

// The rules a section draws, whichever of its own box, its `::before` or its
// `::after` draws them: a top border, or a filled layer one pixel tall.
const rulesOn = (section: Locator) =>
  section.evaluate((node) => {
    const own = node.getBoundingClientRect().width
    const painted = (colour: string) => colour !== "rgba(0, 0, 0, 0)"

    return [null, "::before", "::after"].flatMap((pseudo) => {
      const style = getComputedStyle(node, pseudo)
      if (pseudo !== null && style.content === "none") return []

      const length = pseudo === null ? own : Number.parseFloat(style.width)
      const bordered =
        style.borderTopStyle !== "none" &&
        Number.parseFloat(style.borderTopWidth) > 0 &&
        painted(style.borderTopColor)
      const filled =
        pseudo !== null &&
        Number.parseFloat(style.height) === 1 &&
        painted(style.backgroundColor)

      return bordered || filled ? [{ length, section: own }] : []
    })
  })

test.describe("the rail's order", () => {
  test("puts the account under the nav words and above the footer", async ({
    page,
  }) => {
    stubSignedOut(page)
    const configure = await arrive(page)

    const editorLink = await page
      .getByRole("link", { name: "Editor" })
      .boundingBox()
    const account = await configure.accountRow.boundingBox()
    const theme = await configure.themeToggle.boundingBox()
    if (!editorLink || !account || !theme)
      throw new Error("the rail's three landmarks must be drawn")

    expect(editorLink.y).toBeLessThan(account.y)
    expect(account.y).toBeLessThan(theme.y)
  })

  // One partial rule, above the marketplace; the account row has none.
  test("draws one partial rule, above the marketplace and not the account", async ({
    page,
  }) => {
    stubSignedOut(page)
    const configure = await arrive(page)

    const [marketplace, ...more] = await rulesOn(configure.marketplaceSection)
    expect(more).toStrictEqual([])
    expect(marketplace?.length).toBeGreaterThan(0)
    expect(marketplace?.length).toBeLessThan(marketplace!.section)

    expect(await rulesOn(configure.accountRow)).toStrictEqual([])
  })
})

test.describe("signed in", () => {
  test("the rail names who is signed in", async ({ page }) => {
    stubSignedIn(page)
    const configure = await arrive(page)

    await expect(configure.accountName).toHaveText(SIGNED_IN_USER.name)
    await expect(configure.signInButton).toBeHidden()
  })

  test("the grid draws every saved stack, not one", async ({ page }) => {
    stubSignedIn(page, [stack("Weekday"), stack("Client work")])
    const configure = await arrive(page)

    await expect(configure.stack("Weekday")).toBeVisible()
    await expect(configure.stack("Client work")).toBeVisible()
  })

  // What is stored is the typed name and a pointer, no config bytes.
  test("saving sends the typed name and the id the payload was minted under", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)
    const configure = await arrive(page)

    const dialog = await openSaveDialog(configure)
    await dialog.saveAs("Client work")

    await expect.poll(() => created).toHaveLength(1)
    expect(created[0]?.name).toBe("Client work")
    expect(created[0]?.configId).toBeTruthy()
    expect(Object.keys(created[0] ?? {})).toStrictEqual(["name", "configId"])
    await expect(configure.stackCell(1)).toHaveAccessibleName("Client work")
  })

  test("refuses a name the account already holds, posting nothing", async ({
    page,
  }) => {
    const posted = captureCreateConfig(page)
    const { created } = stubSignedIn(page, [stack("Weekday")])
    const configure = await arrive(page)

    const dialog = await openSaveDialog(configure)
    await dialog.fill(" WEEKDAY ")
    await dialog.save()

    await expect(dialog.alert).toHaveText(UNIQUE("WEEKDAY"))
    await expect(dialog.nameInput).toHaveAttribute("aria-invalid", "true")
    await expect(dialog.nameInput).toHaveAccessibleDescription(
      UNIQUE("WEEKDAY")
    )
    await expect(dialog.root).toBeVisible()
    expect(posted).toStrictEqual([])
    expect(created).toStrictEqual([])
  })

  // Only an owed rename lands in this browser too, so only it counts these.
  test("takes the name of a local save the grid does not draw", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page, [stack("Weekday")])
    const configure = await arriveHolding(page, [
      { name: "Gamma", payload: STORED_PAYLOAD },
    ])
    await expect(localSave(configure, "Gamma")).toHaveCount(0)

    const dialog = await openSaveDialog(configure)
    await dialog.fill("gamma")
    await dialog.save()

    await expect(dialog.root).toBeHidden()
    expect(created.map((body) => body.name)).toStrictEqual(["gamma"])
  })

  test("holds the dialog while the save is in flight", async ({ page }) => {
    stubCreateConfig(page)
    stubSignedIn(page)
    const { release } = holdStackSave(page)
    const configure = await arrive(page)

    const dialog = await openSaveDialog(configure)
    await dialog.fill("Weekday")
    await dialog.save()

    await expect(dialog.savingButton).toBeDisabled()
    await expect(dialog.cancelButton).toBeDisabled()
    await expect(dialog.nameInput).not.toBeEditable()

    release()

    await expect(dialog.root).toBeHidden()
    await expect(configure.stack("Weekday")).toBeVisible()
  })
})

test.describe("signing in for the first time", () => {
  test("carries every local save into the account, oldest first, under its own name", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)

    const configure = await arriveHolding(page, [
      { name: "B", payload: STORED_PAYLOAD },
      { name: "A", payload: STORED_PAYLOAD },
    ])

    await expect
      .poll(() => created.map((body) => body.name))
      .toStrictEqual(["A", "B"])
    await expect(accountRow(configure, "A")).toBeVisible()
    await expect(accountRow(configure, "B")).toBeVisible()
    await expect(localSave(configure, "A")).toHaveCount(0)
    await expect(configure.adoptionNotice).toHaveCount(0)
  })

  // The write contract refuses the pair before the POST, so the save stays
  // local and the notice names it.
  test("keeps a save the account will not take, and names the conflict", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)

    const configure = await arriveHolding(page, [
      { name: "Weekday", payload: OUT_OF_SCOPE_PAYLOAD },
    ])

    await expect(localSave(configure, "Weekday")).toBeVisible()
    await expect(configure.adoptionNotice).toContainText("scope")
    await expect(configure.adoptionNotice).toContainText("assign skills")
    expect(created).toStrictEqual([])
  })

  test("says how many saves it kept", async ({ page }) => {
    stubCreateConfig(page)
    stubSignedIn(page)

    const configure = await arriveHolding(page, [
      { name: "B", payload: OUT_OF_SCOPE_PAYLOAD },
      { name: "A", payload: OUT_OF_SCOPE_PAYLOAD },
    ])

    await expect(localSave(configure, "A")).toBeVisible()
    await expect(localSave(configure, "B")).toBeVisible()
    await expect(configure.adoptionNotice).toContainText(/\b2\b/)
  })

  test("adopts the saves it can beside one it cannot", async ({ page }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)

    const configure = await arriveHolding(page, [
      { name: "B", payload: STORED_PAYLOAD },
      { name: "A", payload: OUT_OF_SCOPE_PAYLOAD },
    ])

    await expect
      .poll(() => created.map((body) => body.name))
      .toStrictEqual(["B"])
    await expect(accountRow(configure, "B")).toBeVisible()
    await expect(localSave(configure, "A")).toBeVisible()
    await expect(configure.adoptionNotice).toBeVisible()
  })

  // An unrelated save must not clear a refusal, and a reload must not lose it
  // either.
  test("keeps the refused save when an unrelated stack is saved", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)

    const configure = await arriveHolding(page, [
      { name: "Weekday", payload: OUT_OF_SCOPE_PAYLOAD },
    ])
    await expect(configure.adoptionNotice).toBeVisible()
    await expect(localSave(configure, "Weekday")).toBeVisible()

    const dialog = await openSaveDialog(configure)
    await dialog.saveAs("Client work")
    await expect.poll(() => created).toHaveLength(1)

    await expect(localSave(configure, "Weekday")).toHaveCount(1)
    await expect(configure.adoptionNotice).toBeVisible()

    await configure.goto()

    await expect(localSave(configure, "Weekday")).toHaveCount(1)
    await expect(configure.adoptionNotice).toContainText("scope")
    expect(created).toHaveLength(1)
  })

  test("leaves an adopted save replaced when an unrelated stack is saved", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)

    const configure = await arriveHolding(page, [
      { name: "Weekday", payload: STORED_PAYLOAD },
    ])
    await expect.poll(() => created).toHaveLength(1)
    await expect(accountRow(configure, "Weekday")).toBeVisible()
    await expect(localSave(configure, "Weekday")).toHaveCount(0)
    await expect(configure.adoptionNotice).toHaveCount(0)

    const dialog = await openSaveDialog(configure)
    await dialog.saveAs("Client work")
    await expect.poll(() => created).toHaveLength(2)

    await expect(localSave(configure, "Weekday")).toHaveCount(0)
    await expect(configure.adoptionNotice).toHaveCount(0)

    await configure.goto()

    await expect(accountRow(configure, "Weekday")).toBeVisible()
    await expect(localSave(configure, "Weekday")).toHaveCount(0)
    await expect(configure.adoptionNotice).toHaveCount(0)
    expect(created).toHaveLength(2)
  })

  // The notice promises "next time", when the account is no longer empty.
  test("carries a save a temporary refusal kept once the account takes it", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created, refusing } = stubSignedIn(page)
    refusing.add("A")

    const configure = await arriveHolding(page, [
      { name: "B", payload: STORED_PAYLOAD },
      { name: "A", payload: STORED_PAYLOAD },
    ])
    await expect(configure.adoptionNotice).toContainText("next time")
    await expect(localSave(configure, "A")).toBeVisible()

    await configure.goto()
    await expect(configure.adoptionNotice).toContainText("next time")
    await expect(localSave(configure, "A")).toBeVisible()

    refusing.delete("A")
    await configure.goto()

    await expect(accountRow(configure, "A")).toBeVisible()
    await expect(localSave(configure, "A")).toHaveCount(0)
    await expect(configure.adoptionNotice).toHaveCount(0)
    expect(created.map((body) => body.name)).toStrictEqual(["B", "A"])
  })

  // Somebody with stacks has been here before; re-uploading breeds duplicates.
  test("leaves an account that already has stacks alone", async ({ page }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page, [stack("Weekday")])

    const configure = await arriveHolding(page, [
      { name: "Mine", payload: STORED_PAYLOAD },
    ])

    await expect(configure.stack("Weekday")).toBeVisible()
    await expect(configure.stack("Mine")).toHaveCount(0)
    expect(created).toStrictEqual([])
  })
})

// Owed by a first sign-in whose write was refused; the account has since come
// to list each name, lower-cased.
const owingThenListed = async (page: TestPage, oldestFirst: string[]) => {
  stubCreateConfig(page)
  const firstSignIn = stubSignedIn(page)
  for (const name of oldestFirst) firstSignIn.refusing.add(name)

  const configure = await arriveHolding(
    page,
    [...oldestFirst]
      .reverse()
      .map((name) => ({ name, payload: STORED_PAYLOAD }))
  )
  await expect(configure.adoptionNotice).toContainText("next time")

  const minted = captureCreateConfig(page)
  const { created } = stubSignedIn(
    page,
    oldestFirst.map((name) => stack(name.toLowerCase()))
  )
  await configure.goto()

  return { configure, dialog: configure.saveStackDialog, minted, created }
}

// Signed in to `stacks`, holding `saves` (newest first) of which `owed` are.
const owingBeside = async (
  page: TestPage,
  stacks: SavedStack[],
  saves: { name: string; payload: unknown }[],
  owed: string[]
) => {
  stubCreateConfig(page)
  const { created } = stubSignedIn(page, stacks)
  const configure = await arrive(page)
  const dialog = configure.saveStackDialog
  await dialog.seed(saves, owed)
  await configure.goto()

  return { configure, dialog, created }
}

// Owing "Alpha" to an account listing "alpha", whose list is held until
// `release` so a confirm can open before the sign-in lands.
const owingWithTheListHeld = async (
  page: TestPage,
  arrange: (configure: ConfigurePage) => Promise<void> = async () => {}
) => {
  stubCreateConfig(page)
  stubSignedIn(page, [stack("alpha")])
  const configure = await arrive(page)
  await configure.saveStackDialog.seed(
    [{ name: "Alpha", payload: STORED_PAYLOAD }],
    ["Alpha"]
  )
  await arrange(configure)
  const { release } = holdStackList(page, [stack("alpha")])
  await configure.goto()

  return { configure, release }
}

const asksOnceTheConfirmCloses = async (
  page: TestPage,
  configure: ConfigurePage,
  release: () => void,
  confirm: { root: Locator; cancel: () => Promise<void> }
) => {
  await expect(confirm.root).toBeVisible()

  release()

  await expect(page.getByText(IN_THE_ACCOUNT)).toBeVisible()
  await expect(openDialogs(page)).toHaveCount(1)

  await confirm.cancel()

  await expect(configure.saveStackDialog.nameInput).toHaveValue("Alpha")
  await expect(openDialogs(page)).toHaveCount(1)
}

test.describe("an owed save whose name the account now lists", () => {
  test("opens the save dialog on it, the name refused on the field, posting nothing", async ({
    page,
  }) => {
    const { dialog, minted, created } = await owingThenListed(page, ["Alpha"])

    await expect(dialog.root).toBeVisible()
    await expect(dialog.nameInput).toHaveValue("Alpha")
    await expect(dialog.nameInput).toBeFocused()
    await expect(dialog.nameInput).toHaveAttribute("aria-invalid", "true")
    await expect(dialog.nameInput).toHaveAccessibleDescription(UNIQUE("Alpha"))
    expect(minted).toStrictEqual([])
    expect(created).toStrictEqual([])
  })

  test("a unique name renames it and carries its own payload, and it is owed no more", async ({
    page,
  }) => {
    const { configure, dialog, minted, created } = await owingThenListed(page, [
      "Alpha",
    ])

    await dialog.saveAs("Alpha 2")

    expect(created.map((body) => body.name)).toStrictEqual(["Alpha 2"])
    expect(minted).toEqual([STORED_PAYLOAD])
    await expect(accountRow(configure, "alpha")).toBeVisible()
    await expect(accountRow(configure, "Alpha 2")).toBeVisible()
    await expect.poll(() => dialog.owed()).toStrictEqual([])
    expect((await dialog.stored())?.map((save) => save.name)).toStrictEqual([
      "Alpha 2",
    ])
  })

  test("Cancel posts nothing and leaves it owed, and the next sign-in asks again", async ({
    page,
  }) => {
    const { configure, dialog, minted, created } = await owingThenListed(page, [
      "Alpha",
    ])

    await dialog.cancel()

    await expect(dialog.root).toBeHidden()
    expect(minted).toStrictEqual([])
    expect(created).toStrictEqual([])
    expect(await dialog.owed()).toStrictEqual(["Alpha"])

    await configure.goto()

    await expect(dialog.nameInput).toHaveValue("Alpha")
    await expect(dialog.nameInput).toHaveAttribute("aria-invalid", "true")
    expect(created).toStrictEqual([])
  })

  // A modal hides the stacks from role queries, so the screen counts as
  // reached though the dialog opened before `goto()` first looked for them.
  test("reaches the screen with the dialog already open over the stacks", async ({
    page,
  }) => {
    const { configure, dialog } = await owingThenListed(page, ["Alpha"])
    await dialog.cancel()
    await expect(dialog.root).toBeHidden()
    const { release } = await holdPageLoad(page)

    const arriving = configure.goto()
    // A whole boot, so bounded by the test as `goto()`'s own waits are.
    await dialog.root.waitFor()
    release()
    await arriving

    await expect(dialog.nameInput).toHaveValue("Alpha")
  })

  test("asks about several one at a time, oldest first", async ({ page }) => {
    const { dialog, created } = await owingThenListed(page, ["A", "B"])

    await expect(dialog.nameInput).toHaveValue("A")
    await expect(openDialogs(page)).toHaveCount(1)
    await dialog.fill("A 2")
    await dialog.save()

    await expect(dialog.nameInput).toHaveValue("B")
    await expect(dialog.nameInput).toHaveAccessibleDescription(UNIQUE("B"))
    await expect(openDialogs(page)).toHaveCount(1)
    await dialog.saveAs("B 2")

    expect(created.map((body) => body.name)).toStrictEqual(["A 2", "B 2"])
  })

  // Signed in, the grid hides a local save the account never refused, but
  // the rename lands in this browser too.
  test("refuses the name of a local save the grid does not draw", async ({
    page,
  }) => {
    const { configure, dialog, created } = await owingBeside(
      page,
      [stack("alpha")],
      [
        { name: "Gamma", payload: STORED_PAYLOAD },
        { name: "Alpha", payload: STORED_PAYLOAD },
      ],
      ["Alpha"]
    )

    await expect(dialog.nameInput).toHaveValue("Alpha")
    await expect(localSave(configure, "Gamma")).toHaveCount(0)
    await dialog.fill("gamma")
    await dialog.save()

    await expect(dialog.nameInput).toHaveAttribute("aria-invalid", "true")
    await expect(dialog.nameInput).toHaveAccessibleDescription(UNIQUE("gamma"))
    expect(created).toStrictEqual([])
    expect(await dialog.owed()).toStrictEqual(["Alpha"])
  })

  // Renaming cannot fix a scope conflict, so it stays owed and drawn.
  test("leaves one the account would refuse anyway unasked", async ({
    page,
  }) => {
    const { configure, dialog, created } = await owingBeside(
      page,
      [stack("weekday")],
      [{ name: "Weekday", payload: OUT_OF_SCOPE_PAYLOAD }],
      ["Weekday"]
    )

    await expect(configure.adoptionNotice).toContainText("scope")
    await expect(dialog.root).toBeHidden()
    await expect(localSave(configure, "Weekday")).toBeVisible()
    expect(await dialog.owed()).toStrictEqual(["Weekday"])
    expect(created).toStrictEqual([])
  })

  test("waits behind a dialog already open, then asks", async ({ page }) => {
    stubPrivateMarketplaceCatalog(page)
    stubCreateConfig(page)
    stubSignedIn(page, [stack("alpha")])
    const configure = await arrive(page)
    const marketplace = configure.marketplaceDialog

    // A restore whose token has gone stale parks behind the marketplace
    // dialog on the next load.
    await configure.marketplaceButton.click()
    await marketplace.fill(PRIVATE_MARKETPLACE_REF)
    await marketplace.load()
    await marketplace.fillToken(MARKETPLACE_TOKEN)
    await marketplace.load()
    await configure.skill(MARKETPLACE_SKILL).toggle()
    await configure.seedSavedMarketplaces({
      current: PRIVATE_MARKETPLACE_REF,
      saved: { [PRIVATE_MARKETPLACE_REF]: STALE_TOKEN },
    })
    await configure.saveStackDialog.seed(
      [{ name: "Alpha", payload: STORED_PAYLOAD }],
      ["Alpha"]
    )
    await page.reload()

    await expect(marketplace.root).toBeVisible()
    await expect(page.getByText(IN_THE_ACCOUNT)).toBeVisible()
    await expect(openDialogs(page)).toHaveCount(1)

    await marketplace.cancel()

    await expect(configure.saveStackDialog.nameInput).toHaveValue("Alpha")
    await expect(openDialogs(page)).toHaveCount(1)
  })

  test("waits behind a stack switch's confirm open as the account lands", async ({
    page,
  }) => {
    const { configure, release } = await owingWithTheListHeld(page)

    const { name: category, first: react } = EXCLUSIVE_CATEGORY
    await configure.skillIn(DOMAINS.web, category, react).toggle()
    await configure.chooseStack(STACKS.nextjs)

    await asksOnceTheConfirmCloses(
      page,
      configure,
      release,
      configure.stackSwitchDialog
    )
  })

  test("waits behind a marketplace switch's confirm open as the account lands", async ({
    page,
  }) => {
    stubMarketplaceEstate(page)
    const { configure, release } = await owingWithTheListHeld(
      page,
      (configure) =>
        configure.seedSavedMarketplaces({
          current: MARKETPLACE_CANONICAL_REF,
          saved: { [MARKETPLACE_CANONICAL_REF]: "", [BIGCO_CANONICAL_REF]: "" },
        })
    )

    await configure.switchTo(BIGCO_CANONICAL_REF).click()

    await asksOnceTheConfirmCloses(
      page,
      configure,
      release,
      configure.marketplaceSwitchDialog
    )
  })
})

test.describe("the composer, signed in", () => {
  // The worker is stubbed, not the model.
  test("draws the skills it was given, and sends the sentence", async ({
    page,
  }) => {
    stubSignedIn(page)
    const { asked } = stubCompose(page, ["web-framework-react"])
    const configure = await arrive(page)

    await configure.composer.type("a react app")
    await configure.composer.send()

    await expect(configure.composer.proposal).toContainText("React")
    expect(asked).toStrictEqual(["a react app"])
  })

  test("Apply selects the proposed skill through the app's own verb", async ({
    page,
  }) => {
    stubSignedIn(page)
    stubCompose(page, ["web-framework-react"])
    const configure = await arrive(page)

    await configure.composer.type("a react app")
    await configure.composer.send()
    await configure.composer.applyButton.click()

    await expect(
      configure.skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, "React").root
    ).toHaveAttribute("aria-pressed", "true")
  })
})

// The auth routes are rate limited (`apps/server/src/auth.ts`), so these are
// ordinary refusals.
test.describe("a sign-in the worker will not serve", () => {
  test("an unreachable worker leaves the page standing", async ({ page }) => {
    stubSignedOut(page)
    stubSignInUnreachable(page)
    const thrown = uncaught(page)
    const configure = await arrive(page)

    await configure.signInButton.click()
    await page.waitForTimeout(LONG_ENOUGH_TO_THROW_MS)

    expect(thrown).toStrictEqual([])
    await expect(configure.signInButton).toBeVisible()
  })

  test("a refusal carrying no JSON leaves the page standing", async ({
    page,
  }) => {
    stubSignedOut(page)
    stubSignInRefusalWithoutJson(page)
    const thrown = uncaught(page)
    const configure = await arrive(page)

    await configure.signInButton.click()
    await page.waitForTimeout(LONG_ENOUGH_TO_THROW_MS)

    expect(thrown).toStrictEqual([])
    await expect(configure.signInButton).toBeVisible()
  })

  test("an unreachable sign-out leaves the page standing", async ({ page }) => {
    stubSignedIn(page)
    stubSignOutUnreachable(page)
    const thrown = uncaught(page)
    const configure = await arrive(page)

    await page.getByRole("button", { name: "Sign out" }).click()
    await page.waitForTimeout(LONG_ENOUGH_TO_THROW_MS)

    expect(thrown).toStrictEqual([])
    await expect(configure.accountName).toHaveText(SIGNED_IN_USER.name)
  })
})

// A refusal is said in the dialog, which stays open with the name kept.
test.describe("a save the worker will not take", () => {
  test("a refused mint is said in the dialog, with the name kept", async ({
    page,
  }) => {
    stubCreateConfigRefusal(page, STORE_UNAVAILABLE)
    stubSignedIn(page)
    const configure = await arrive(page)

    const dialog = await openSaveDialog(configure)
    await dialog.fill("Client work")
    await dialog.save()

    await expect(dialog.alert).toHaveText("Saving failed")
    await expect(dialog.root).toBeVisible()
    await expect(dialog.nameInput).toHaveValue("Client work")

    await dialog.cancel()
    await expect(configure.roster.saveButton).toBeVisible()
  })

  test("an offline mint keeps the name, and Save again stores it once online", async ({
    page,
  }) => {
    stubCreateConfigUnreachable(page)
    const { created } = stubSignedIn(page)
    const configure = await arrive(page)

    const dialog = await openSaveDialog(configure)
    await dialog.fill("Client work")
    await dialog.save()

    await expect(dialog.alert).toHaveText("Offline — try again")
    await expect(dialog.nameInput).toHaveValue("Client work")
    expect(created).toStrictEqual([])

    stubCreateConfig(page)
    await dialog.save()

    await expect(dialog.root).toBeHidden()
    expect(created.map((body) => body.name)).toStrictEqual(["Client work"])
    await expect(configure.stack("Client work")).toBeVisible()
  })

  // `created` is not asserted: the refusal stub shadows the handler filling it.
  test("a refused save is said in the dialog, and the grid gains nothing", async ({
    page,
  }) => {
    stubCreateConfig(page)
    stubSignedIn(page)
    stubStackRefusal(page, STORE_UNAVAILABLE)
    const configure = await arrive(page)

    const dialog = await openSaveDialog(configure)
    await dialog.fill("Client work")
    await dialog.save()

    await expect(dialog.alert).toHaveText("Saving failed")
    await dialog.cancel()
    await expect(configure.stack("Client work")).toHaveCount(0)
  })

  test("an expired session names its own fix in the dialog", async ({
    page,
  }) => {
    stubCreateConfig(page)
    stubSignedIn(page)
    stubStackRefusal(page, 401)
    const configure = await arrive(page)

    const dialog = await openSaveDialog(configure)
    await dialog.fill("Client work")
    await dialog.save()

    await expect(dialog.alert).toHaveText("Signed out — sign in")
    await expect(dialog.nameInput).toHaveValue("Client work")
  })
})
