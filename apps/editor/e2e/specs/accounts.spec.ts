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
// something else is already on screen. Given no `stacks`, it then falls through
// to the account `stubSignedIn` keeps. Install after `stubSignedIn`.
const holdStackList = (page: TestPage, stacks?: SavedStack[]) => {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))

  stubWith(page, [
    http.get(STACKS_URL, async () => {
      await released
      return stacks && HttpResponse.json(stacks)
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

// The account's list answering `failure` while one is set; with none, the read
// falls through to the account `stubSignedIn` keeps. Install after it.
const stackListFailing = (page: TestPage) => {
  let failure: (() => Response) | null = null

  stubWith(page, [
    http.get(STACKS_URL, () => (failure === null ? undefined : failure())),
  ])

  return {
    fail: (answer: () => Response) => {
      failure = answer
    },
    recover: () => {
      failure = null
    },
  }
}

const SERVER_ERROR = 500

const serverError = () => new HttpResponse(null, { status: SERVER_ERROR })

// A worker a release ahead: the account's rows, under a field this build does
// not know.
const listThisBuildCannotRead = () =>
  HttpResponse.json(
    [stack("B"), stack("A")].map(({ updatedAt, ...row }) => ({
      ...row,
      modifiedAt: updatedAt,
    }))
  )

const FAILED_READS = [
  { failure: "a server error", answer: serverError },
  { failure: "no answer at all", answer: () => HttpResponse.error() },
  { failure: "a list this build cannot read", answer: listThisBuildCannotRead },
]

// Holding B (newest) and A, both carried in by a first sign-in. `created`
// hearing those two writes is what shows it hears any later one.
const carriedByAFirstSignIn = async (page: TestPage) => {
  stubCreateConfig(page)
  const account = stubSignedIn(page)
  const list = stackListFailing(page)

  const configure = await arriveHolding(page, [
    { name: "B", payload: STORED_PAYLOAD },
    { name: "A", payload: STORED_PAYLOAD },
  ])
  await expect
    .poll(() => account.created.map((body) => body.name))
    .toStrictEqual(["A", "B"])
  await expect(accountRow(configure, "A")).toBeVisible()
  await expect(accountRow(configure, "B")).toBeVisible()

  return { configure, list, ...account }
}

// The rail names who is signed in only once the refresh, adoption included,
// has landed, so every write this load was going to make has been made.
const reload = async (configure: ConfigurePage) => {
  await configure.goto()
  await expect(configure.accountName).toHaveText(SIGNED_IN_USER.name)
}

// Once among the account's rows, and nowhere else on the grid.
const showsEachSaveOnce = async (configure: ConfigurePage) => {
  for (const name of ["A", "B"]) {
    await expect(accountRow(configure, name)).toHaveCount(1)
    await expect(configure.stack(name)).toHaveCount(1)
  }
}

// These assert what reaches the account, and the grid only once the list reads.
test.describe("a load whose account list cannot be read, after a first sign-in", () => {
  test("a load that reads the list carries nothing again", async ({
    page,
  }) => {
    const { configure, created } = await carriedByAFirstSignIn(page)

    await reload(configure)

    expect(created.map((body) => body.name)).toStrictEqual(["A", "B"])
    await showsEachSaveOnce(configure)
  })

  for (const { failure, answer } of FAILED_READS) {
    test(`a load meeting ${failure} carries nothing again, and the next shows each save once`, async ({
      page,
    }) => {
      const { configure, created, list } = await carriedByAFirstSignIn(page)

      list.fail(answer)
      await reload(configure)

      expect(created.map((body) => body.name)).toStrictEqual(["A", "B"])

      list.recover()
      await reload(configure)

      await showsEachSaveOnce(configure)
    })
  }

  test("two such loads in a row carry nothing again, and the next shows each save once", async ({
    page,
  }) => {
    const { configure, created, list } = await carriedByAFirstSignIn(page)

    list.fail(serverError)
    await reload(configure)
    await reload(configure)

    expect(created.map((body) => body.name)).toStrictEqual(["A", "B"])

    list.recover()
    await reload(configure)

    await showsEachSaveOnce(configure)
  })

  // Writes failing beside the read would leave both saves owed, and the next
  // load would ask a new name for stacks the account already holds.
  test("a load whose writes would fail too leaves nothing owed, and the next asks no new name", async ({
    page,
  }) => {
    const { configure, list, refusing } = await carriedByAFirstSignIn(page)
    const dialog = configure.saveStackDialog

    list.fail(serverError)
    refusing.add("A").add("B")
    await reload(configure)

    expect(await dialog.owed()).toStrictEqual([])

    list.recover()
    refusing.clear()
    await reload(configure)

    await showsEachSaveOnce(configure)
    await expect(dialog.root).toBeHidden()
  })
})

// After a first sign-in carried B and A, a load whose list read meets `answer`.
// Both are in this browser and in the account.
const unreadAfterAFirstSignIn = async (
  page: TestPage,
  answer: () => Response = serverError
) => {
  const carried = await carriedByAFirstSignIn(page)

  carried.list.fail(answer)
  await reload(carried.configure)

  return carried
}

// Signed in to an empty account, holding B (newest) and A, on a load whose list
// read fails: a first sign-in nothing has been carried for yet.
const firstSignInUnread = async (page: TestPage) => {
  stubCreateConfig(page)
  const account = stubSignedIn(page)
  const list = stackListFailing(page)
  const configure = await arrive(page)
  await configure.saveStackDialog.seed([
    { name: "B", payload: STORED_PAYLOAD },
    { name: "A", payload: STORED_PAYLOAD },
  ])

  list.fail(serverError)
  await reload(configure)

  return { configure, list, ...account }
}

// The owner's ruling: while the account's list cannot be read, a line says so
// with Retry, the grid shows this browser's saves, and nothing is carried in
// until a read succeeds.
test.describe("a signed-in load whose account list cannot be read", () => {
  for (const { failure, answer } of FAILED_READS) {
    test(`says it couldn't load your saved stacks, with Retry, on ${failure}`, async ({
      page,
    }) => {
      const { configure } = await unreadAfterAFirstSignIn(page, answer)

      await expect(configure.stackListFailure).toBeVisible()
      await expect(configure.stackListRetry).toBeEnabled()
    })

    test(`shows each of this browser's saves once on ${failure}, carrying none in`, async ({
      page,
    }) => {
      const { configure, created } = await unreadAfterAFirstSignIn(page, answer)

      for (const name of ["A", "B"]) {
        await expect(localSave(configure, name)).toBeVisible()
        await expect(configure.stack(name)).toHaveCount(1)
      }
      expect(created.map((body) => body.name)).toStrictEqual(["A", "B"])
    })
  }

  // Nothing takes focus when it says so, so a live region is what reads it out.
  test("reads it out, opening no dialog", async ({ page }) => {
    const { configure } = await unreadAfterAFirstSignIn(page)

    await expect(configure.stackListAnnouncement).toBeVisible()
    await expect(openDialogs(page)).toHaveCount(0)
  })

  test("shows the account's stacks, each once, and says no more, on a Retry once the account answers", async ({
    page,
  }) => {
    const { configure, created, list } = await unreadAfterAFirstSignIn(page)
    await expect(configure.stackListRetry).toBeVisible()

    list.recover()
    await configure.stackListRetry.click()

    await showsEachSaveOnce(configure)
    await expect(configure.stackListFailure).toBeHidden()
    await expect(configure.stackListRetry).toBeHidden()
    expect(created.map((body) => body.name)).toStrictEqual(["A", "B"])
  })

  // Retry's refusal is awaited: the first failure's words would otherwise
  // satisfy the assertion before Retry answered.
  test("says so again, still showing this browser's saves, when Retry fails too", async ({
    page,
  }) => {
    const { configure, created } = await unreadAfterAFirstSignIn(page)
    await expect(configure.stackListRetry).toBeVisible()

    const refused = page.waitForResponse(
      (response) =>
        response.url().startsWith(STACKS_URL) &&
        response.request().method() === "GET"
    )
    await configure.stackListRetry.click()
    await refused

    await expect(configure.stackListFailure).toBeVisible()
    await expect(localSave(configure, "A")).toBeVisible()
    await expect(localSave(configure, "B")).toBeVisible()
    expect(created.map((body) => body.name)).toStrictEqual(["A", "B"])
  })

  // Retry goes once the list reads, so the keyboard goes to the grid it
  // filled. The grid itself, not its first cell: with anything selected, that
  // cell clears it on one more press.
  for (const key of ["Enter", "Space"]) {
    test(`takes the keyboard to the stacks grid once Retry by ${key} reads the list`, async ({
      page,
    }) => {
      const { configure, list } = await unreadAfterAFirstSignIn(page)
      await expect(configure.stackListRetry).toBeVisible()

      list.recover()
      await configure.stackListRetry.press(key)
      await showsEachSaveOnce(configure)

      await expect(configure.stacks).toBeFocused()
    })
  }

  // The allowed case for the two above: Retry is still there.
  test("keeps the keyboard on Retry when Retry fails too", async ({ page }) => {
    const { configure } = await unreadAfterAFirstSignIn(page)
    await expect(configure.stackListRetry).toBeVisible()

    const refused = page.waitForResponse(
      (response) =>
        response.url().startsWith(STACKS_URL) &&
        response.request().method() === "GET"
    )
    await configure.stackListRetry.press("Enter")
    await refused
    await expect(configure.stackListFailure).toBeVisible()
    await expect(localSave(configure, "A")).toBeVisible()

    await expect(configure.stackListRetry).toBeFocused()
  })

  // The allowed case. The tests above show `stackListFailure` finds the words
  // when they are there, so their absence here is the line not shown: a list
  // that read has nothing to say it could not.
  test("says nothing of the kind on a load that reads the list", async ({
    page,
  }) => {
    const { configure } = await carriedByAFirstSignIn(page)

    await reload(configure)

    await showsEachSaveOnce(configure)
    await expect(configure.stackListFailure).toBeHidden()
    await expect(configure.stackListRetry).toBeHidden()
  })
})

test.describe("a first sign-in whose account list cannot be read", () => {
  test("shows this browser's saves and says it couldn't load the account's, carrying none in", async ({
    page,
  }) => {
    const { configure, created } = await firstSignInUnread(page)

    await expect(configure.stackListFailure).toBeVisible()
    await expect(localSave(configure, "A")).toBeVisible()
    await expect(localSave(configure, "B")).toBeVisible()
    expect(created).toStrictEqual([])
  })

  test("carries each save in once on a Retry once the account answers, and says no more", async ({
    page,
  }) => {
    const { configure, created, list } = await firstSignInUnread(page)
    await expect(configure.stackListRetry).toBeVisible()

    list.recover()
    await configure.stackListRetry.click()

    await showsEachSaveOnce(configure)
    await expect(configure.stackListFailure).toBeHidden()
    expect(created.map((body) => body.name)).toStrictEqual(["A", "B"])
  })

  // Two reads out at once would both find the account empty and carry every
  // save twice. The reload shows what the account came to hold.
  test("carries each save in once though Retry is pressed again while the list is read", async ({
    page,
  }) => {
    const { configure, created, list } = await firstSignInUnread(page)
    await expect(configure.stackListRetry).toBeVisible()

    list.recover()
    const { release } = holdStackList(page)
    await configure.stackListRetry.focus()
    await page.keyboard.press("Enter")
    await page.keyboard.press("Enter")
    release()

    await showsEachSaveOnce(configure)
    await reload(configure)
    await showsEachSaveOnce(configure)
    expect(created.map((body) => body.name)).toStrictEqual(["A", "B"])
  })
})

// The editor guide refuses in place a name the grid shows, and meanwhile the
// grid shows this browser's saves.
test.describe("saving while the account's list cannot be read", () => {
  test("refuses the name of a save this browser holds, posting nothing", async ({
    page,
  }) => {
    const { configure, created } = await unreadAfterAFirstSignIn(page)
    const minted = captureCreateConfig(page)

    const dialog = await openSaveDialog(configure)
    await dialog.fill("A")
    await dialog.save()

    await expect(dialog.alert).toHaveText(UNIQUE("A"))
    await expect(dialog.nameInput).toHaveAttribute("aria-invalid", "true")
    expect(minted).toStrictEqual([])
    expect(created.map((body) => body.name)).toStrictEqual(["A", "B"])
  })

  test("saves a name nobody holds to the account", async ({ page }) => {
    const { configure, created } = await unreadAfterAFirstSignIn(page)

    const dialog = await openSaveDialog(configure)
    await dialog.saveAs("Client work")

    expect(created.map((body) => body.name)).toStrictEqual([
      "A",
      "B",
      "Client work",
    ])
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

  // The keyboard a successful Retry moves to the grid must not leave a dialog
  // that read opened. Typed, so a move after the field took focus shows too.
  test("keeps the keyboard on the field when it opens on a Retry that reads the list", async ({
    page,
  }) => {
    stubCreateConfig(page)
    stubSignedIn(page, [stack("alpha")])
    const list = stackListFailing(page)
    const configure = await arrive(page)
    const dialog = configure.saveStackDialog
    await dialog.seed([{ name: "Alpha", payload: STORED_PAYLOAD }], ["Alpha"])
    list.fail(serverError)
    await configure.goto()
    await expect(configure.stackListRetry).toBeVisible()

    list.recover()
    await configure.stackListRetry.press("Enter")
    await expect(dialog.nameInput).toHaveValue("Alpha")
    await page.keyboard.press("End")
    await page.keyboard.type(" 2")

    await expect(dialog.nameInput).toHaveValue("Alpha 2")
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

// Owing "Alpha" to an account listing "alpha", asked once a Retry reads the
// list. `arrange` runs on the first visit, before anything is owed.
const owedOnARetry = async (
  page: TestPage,
  arrange: (configure: ConfigurePage) => Promise<void> = async () => {}
) => {
  stubCreateConfig(page)
  stubSignedIn(page, [stack("alpha")])
  const list = stackListFailing(page)
  const configure = await arrive(page)
  await arrange(configure)
  const dialog = configure.saveStackDialog
  await dialog.seed([{ name: "Alpha", payload: STORED_PAYLOAD }], ["Alpha"])
  list.fail(serverError)
  await configure.goto()
  await expect(configure.stackListRetry).toBeVisible()

  list.recover()
  await configure.stackListRetry.press("Enter")

  return { configure, dialog }
}

const OWED_OPENINGS = [
  {
    opening: "a page load",
    open: (page: TestPage) =>
      owingBeside(
        page,
        [stack("alpha")],
        [{ name: "Alpha", payload: STORED_PAYLOAD }],
        ["Alpha"]
      ),
  },
  { opening: "a Retry that reads the list", open: owedOnARetry },
]

type SaveDialog = ConfigurePage["saveStackDialog"]

const OWED_CLOSINGS = [
  {
    closing: "Escape",
    close: (dialog: SaveDialog) => dialog.nameInput.press("Escape"),
  },
  {
    closing: "Cancel",
    close: (dialog: SaveDialog) => dialog.cancelButton.press("Enter"),
  },
  {
    closing: "the ✕",
    close: (dialog: SaveDialog) => dialog.closeButton.press("Enter"),
  },
  {
    closing: "Save",
    close: async (dialog: SaveDialog) => {
      await dialog.fill("Alpha 2")
      await dialog.nameInput.press("Enter")
    },
  },
]

// It opens on its own, so on closing it hands the keyboard to the grid, as the
// list's Retry does: the grid itself, since with anything selected its first
// cell clears it on one more press.
test.describe("where the keyboard goes when an owed save's dialog closes", () => {
  for (const { opening, open } of OWED_OPENINGS) {
    for (const { closing, close } of OWED_CLOSINGS) {
      test(`takes the keyboard to the stacks grid once ${closing} closes it, opened on ${opening}`, async ({
        page,
      }) => {
        const { configure, dialog } = await open(page)
        await expect(dialog.nameInput).toHaveValue("Alpha")
        await expect(dialog.nameInput).toBeFocused()

        await close(dialog)

        await expect(dialog.root).toBeHidden()
        await expect(configure.stacks).toBeFocused()
      })
    }
  }

  test("takes the keyboard to the stacks grid, not the cell that clears the applied stack, once Escape closes it, opened on a Retry", async ({
    page,
  }) => {
    const { configure, dialog } = await owedOnARetry(page, (configure) =>
      configure.chooseStack(STACKS.nextjs)
    )
    await expect(dialog.nameInput).toBeFocused()

    await dialog.nameInput.press("Escape")

    await expect(dialog.root).toBeHidden()
    await expect(configure.stackCell(0)).toHaveAccessibleName(
      STACKS.clearScratch
    )
    await expect(configure.stacks).toBeFocused()
    await expect(configure.stackCell(0)).not.toBeFocused()
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
