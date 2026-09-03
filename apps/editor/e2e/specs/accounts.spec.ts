import { STACKS_URL } from "@workspace/api-mocks"

import { expect, test } from "../fixtures"
import { ConfigurePage, SAVED_STACK } from "../pages/configure-page"
import { DOMAINS, EXCLUSIVE_CATEGORY, STACKS } from "../support/catalog"
import {
  SIGNED_IN_USER,
  stack,
  stubCompose,
  stubSignInRefusalWithoutJson,
  stubSignInUnreachable,
  stubSignOutUnreachable,
  stubSignedIn,
  stubSignedOut,
  stubStackRefusal,
} from "../support/auth"
import {
  OUT_OF_SCOPE_PAYLOAD,
  STORE_UNAVAILABLE,
  STORED_PAYLOAD,
  stubCreateConfig,
  stubCreateConfigRefusal,
} from "../support/sharing"

type TestPage = Parameters<typeof stubSignedOut>[0]

// EDITOR-57. Signing in is ADDITIVE and that is the first claim here rather
// than the last: everything this product does works with no account, the CLI
// resolves a share link without one and always will, and a visitor who never
// signs in must see exactly what they saw before any of this existed.
//
// These specs build their own `ConfigurePage` rather than taking the `configure`
// fixture, and the reason is a real ordering constraint rather than style: that
// fixture navigates during setup, so the first paint — and with it the session
// request — happens before any stub a test installs. Stubbing after it
// is stubbing after the call. The fixture's third-party guard catches exactly
// that and names it, which is how this was found rather than shipped.
const arrive = async (page: TestPage) => {
  const configure = new ConfigurePage(page)
  await configure.goto()
  return configure
}

// Everything the page threw that nobody caught, unhandled rejections included.
//
// That is the whole subject of the sign-in specs below: the rail calls
// `void signIn()`, which has nowhere to put a rejected promise, so a client
// that throws on a refusal leaves the failure in the console and the person
// looking at a button that did nothing. A refusal has to come back as a value.
const uncaught = (page: TestPage) => {
  const thrown: string[] = []
  page.on("pageerror", (error) => thrown.push(error.message))
  return thrown
}

// Every request the page made for a stack list, whether or not anything
// stubbed it. Playwright reports the request either way, which is what lets a
// spec assert that one was never sent — a stub answering a request nobody
// makes tests nothing at all.
const stackRequests = (page: TestPage) => {
  const asked: string[] = []

  page.on("request", (request) => {
    if (request.url().startsWith(STACKS_URL)) asked.push(request.url())
  })

  return asked
}

// The one fixed wait these specs use, and here it IS the assertion rather than
// a workaround for a flaky one: what is checked is that NOTHING was thrown, so
// the click needs a window in which throwing was still possible.
const LONG_ENOUGH_TO_THROW_MS = 500

// Longer than the reset delay in `roster-panel.tsx`, with room for a render
// after it — the same instrument `sharing.spec.ts` uses for the endings that
// must not clear themselves.
const PAST_THE_DECAY_WINDOW_MS = 3_000

test.describe("signed out", () => {
  test("the editor works, and offers a way in", async ({ page }) => {
    stubSignedOut(page)
    const configure = await arrive(page)

    await expect(configure.stacks).toBeVisible()
    await expect(configure.skillCells.first()).toBeVisible()
    await expect(configure.signInButton).toBeVisible()
  })

  // Signing out again after signing in, which is the ONE case that proves
  // `stubSignedOut` installs anything at all. Every other call site here is
  // signed out already — the fixture's default — so all of them would pass
  // against a helper that did nothing, and for a while one did: `stubWith`
  // filtered against `network.listHandlers()`, which msw seeds with the
  // fixture's own `authHandlers`, so the identical instances `stubSignedOut`
  // passes were filtered to an empty array and `use()` returned early. A
  // no-op that reports success is invisible to a green suite, and this is the
  // assertion that would have seen it.
  test("a signed-in page can be signed out again", async ({ page }) => {
    stubSignedIn(page)
    stubSignedOut(page)
    const configure = await arrive(page)

    await expect(configure.signInButton).toBeVisible()
  })

  // The row above never CLICKS anything — it stubs a signed-out session and
  // watches the rail draw itself from that, which is a test of the session
  // read. Its name said sign-out and for the whole life of the feature nothing
  // anywhere pressed the button, so a sign-out request the worker refused 415
  // in every environment was invisible to a green suite.
  //
  // The load-bearing assertion is the ABSENCE of the rail's refusal line. The
  // button flip cannot carry this on its own: the rail calls `refresh()` after
  // the attempt whatever its result, and the session read is stubbed
  // signed-out, so the page returns to "Sign in" even when the sign-out was
  // refused. What only a real sign-out produces is a rail with no alert in it.
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

  // Signed out, the store never gets past the session read, so a stack list is
  // not refused — it is never asked for. This suite used to stub a 401 for it,
  // which never fired once; the request not happening is the real claim.
  test("asks for no stacks at all", async ({ page }) => {
    stubSignedOut(page)
    const asked = stackRequests(page)
    const configure = await arrive(page)

    await expect(configure.signInButton).toBeVisible()
    expect(asked).toStrictEqual([])
  })

  test("saving still puts one snapshot in the grid", async ({ page }) => {
    stubSignedOut(page)
    const configure = await arrive(page)

    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.saveButton.click()

    await expect(configure.savedStack).toBeVisible()
  })
})

// WHERE THE ACCOUNT SITS IN THE RAIL, which is a claim about the rail's whole
// order rather than about the row. It used to be pinned to the bottom, under a
// flexible spacer, which put "sign in" and "GitHub" on the same footing; it
// belongs with the navigation it qualifies, and the footer belongs to the two
// glyphs that are not navigation at all.
test.describe("the rail's order", () => {
  test("puts the account under the nav words and above the footer", async ({
    page,
  }) => {
    stubSignedOut(page)
    const configure = await arrive(page)

    const configureLink = await page
      .getByRole("link", { name: "Configure" })
      .boundingBox()
    const account = await configure.accountRow.boundingBox()
    const theme = await configure.themeToggle.boundingBox()
    if (!configureLink || !account || !theme)
      throw new Error("the rail's three landmarks must be drawn")

    expect(configureLink.y).toBeLessThan(account.y)
    expect(account.y).toBeLessThan(theme.y)
  })

  // The rule above the account row, and the one horizontal rule in the rail. It
  // is what separates identity from navigation now that neither is in a box —
  // a bordered pill and a recessed field were both built and rejected, because
  // a container in a rail of bare words is the only container in it.
  //
  // Read off the pseudo-element the same way `sticky-bar.spec.ts` reads a
  // `::placeholder`: it carries no role and no text, so there is nothing else
  // to locate it by. Its WIDTH is the assertion — the rule stops short of the
  // rail's left edge and ends flush on the vertical divider, so a full-width
  // one is the failure this catches.
  test("draws a partial rule above the account row", async ({ page }) => {
    stubSignedOut(page)
    const configure = await arrive(page)

    const rule = await configure.accountRow.evaluate((node) => {
      const style = getComputedStyle(node, "::before")
      return {
        height: style.height,
        width: parseFloat(style.width),
        row: node.getBoundingClientRect().width,
      }
    })

    expect(rule.height).toBe("1px")
    expect(rule.width).toBeGreaterThan(0)
    expect(rule.width).toBeLessThan(rule.row)
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

  test("saving sends a name and the id the payload was minted under", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)
    const configure = await arrive(page)

    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.saveButton.click()

    // The whole design of SERVER-04 asserted in one line: what is stored is a
    // POINTER, so the request carries an id minted by `POST /configs` — the
    // same call a share link makes — and no configuration bytes at all.
    await expect.poll(() => created).toHaveLength(1)
    expect(created[0]?.configId).toBeTruthy()
    expect(Object.keys(created[0] ?? {})).toStrictEqual(["name", "configId"])
  })
})

test.describe("signing in for the first time", () => {
  // The claim is about what a person sees, not about a request: the grid shows
  // an account's stacks IN PLACE OF the local slot, so without adoption
  // somebody who saved something and then signed in would watch it vanish.
  //
  // THE PERMITTED HALF of the pair below, and neither assertion means anything
  // without the other: a grid that kept every unadopted slot would satisfy the
  // refusal spec on its own, and a grid that had stopped adopting altogether
  // would satisfy neither. The two cells are both named "Saved stack", so the
  // members line is what tells an adopted row from the local slot — the account
  // holds a POINTER and cannot describe what is behind it without a fetch.
  test("carries the local snapshot into the account", async ({ page }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)

    const configure = new ConfigurePage(page)
    await configure.goto()
    await configure.seedSavedStack(STORED_PAYLOAD)
    await configure.goto()

    await expect.poll(() => created).toHaveLength(1)
    await expect(configure.savedStack).toBeVisible()
    await expect(configure.savedStack).toContainText("saved to your account")
    // Nothing to explain, so nothing said. This is the channel the refusal spec
    // below asserts a sentence on, exercised in the direction that proves it
    // can be empty as well as full.
    await expect(configure.adoptionNotice).toHaveCount(0)
  })

  // THE REFUSED HALF. A project-scoped skill assigned to a sub-agent resting at
  // global scope is refused by the write contract before the POST leaves
  // (CLI-851), so the mint the row above depends on cannot succeed — and the
  // grid answered that by drawing neither the account's stacks, of which there
  // are none, nor the local slot, because somebody is signed in. That is a
  // person watching their work disappear as they sign in, with nothing said.
  test("keeps a snapshot the account will not take, and names the conflict", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)

    const configure = new ConfigurePage(page)
    await configure.goto()
    await configure.seedSavedStack(OUT_OF_SCOPE_PAYLOAD)
    await configure.goto()

    // Still on the grid, and still the LOCAL slot: it lists what it holds,
    // where an adopted row says only that it is in the account.
    await expect(configure.savedStack).toBeVisible()
    await expect(configure.savedStack).not.toContainText(
      "saved to your account"
    )

    // The sentence has to name the scope conflict rather than the failure. The
    // rows carrying the fix are not on screen until the snapshot is applied, so
    // "saving failed" sends the reader to the wrong half of the system and
    // "try again" is a lie — this refusal is identical on every load forever.
    await expect(configure.adoptionNotice).toContainText("scope")
    // And nothing reached the account, so the notice is not describing a row
    // the grid is drawing anyway.
    expect(created).toStrictEqual([])
  })

  // THE SAME LOSS, ONE SAVE LATER — EDITOR-73, and the pair below is the
  // EDITOR-67 pair asserted at a second moment rather than a new subject. Both
  // halves above assert at one instant, the first paint after sign-in, so a
  // grid correct then and wrong forever after satisfied both.
  //
  // What went wrong is worth keeping, because the code read as deliberate:
  // `save` cleared `unadopted` on ANY save, on the premise that a save is this
  // browser's work reaching the account. It is not, when what was saved is a
  // different selection — the refused snapshot is still in neither list, and
  // clearing the reason dropped it out of the grid exactly as signing in used
  // to. `adoptLocalStack` then answered `null` for a non-empty account, so a
  // reload did not bring it back either: "we did not try" was returned as if it
  // meant "it is in there".
  //
  // The reload half is asserted rather than left open now, and it is where the
  // fix earns its keep: a slot that survives a save but not F5 is the same loss
  // one keystroke further away. What makes it answerable without re-uploading
  // anything is that `unwritable` is decided from the payload alone, before any
  // request — so a snapshot the write contract refuses is PROVABLY in neither
  // list, on every load, for free.
  const localSlot = (configure: ConfigurePage) =>
    configure.stacks
      .getByRole("button", { name: SAVED_STACK, exact: true })
      .filter({ hasNotText: "saved to your account" })

  test("keeps the refused snapshot when an unrelated stack is saved", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)

    const configure = new ConfigurePage(page)
    await configure.goto()
    await configure.seedSavedStack(OUT_OF_SCOPE_PAYLOAD)
    await configure.goto()

    // The refused half above, holding — this spec starts where it ends.
    await expect(configure.adoptionNotice).toBeVisible()
    await expect(configure.savedStack).toBeVisible()

    // Something else entirely: a catalogue stack the write contract accepts, so
    // the account gains a row that is not this browser's snapshot.
    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.saveButton.click()
    await expect.poll(() => created).toHaveLength(1)

    // Both cells are named "Saved stack", so the members line is what tells them
    // apart — the same reading the adopted spec above relies on, from the other
    // side. The local slot lists what it HOLDS; the account's row cannot.
    await expect(localSlot(configure)).toHaveCount(1)
    await expect(configure.adoptionNotice).toBeVisible()

    // And again after a reload, which is the half the fix had to reach for: the
    // account is no longer empty, so adoption is not re-attempted — asserted by
    // `created` still holding only the save above, not by trusting it.
    await configure.goto()

    await expect(localSlot(configure)).toHaveCount(1)
    await expect(configure.adoptionNotice).toContainText("scope")
    expect(created).toHaveLength(1)
  })

  // THE PERMITTED HALF OF THAT PAIR, at the same second moment, and it is what
  // says the fix above kept its scope. Nothing here is refused: the snapshot is
  // adopted at sign-in, so the account holds it and the local slot is REPLACED
  // rather than kept. Drive the same unrelated save and the same reload, and it
  // must stay replaced — a store that had simply stopped clearing `unadopted`
  // too widely, or a grid that kept every local slot once an account had two
  // rows, would satisfy the refusal spec above on its own and fail here.
  test("leaves an adopted snapshot replaced when an unrelated stack is saved", async ({
    page,
  }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page)

    const configure = new ConfigurePage(page)
    await configure.goto()
    await configure.seedSavedStack(STORED_PAYLOAD)
    await configure.goto()

    // Adopted: the account holds it, so the only "Saved stack" on screen is the
    // account's row and there is nothing to explain.
    await expect.poll(() => created).toHaveLength(1)
    await expect(localSlot(configure)).toHaveCount(0)
    await expect(configure.adoptionNotice).toHaveCount(0)

    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.saveButton.click()
    await expect.poll(() => created).toHaveLength(2)

    await expect(localSlot(configure)).toHaveCount(0)
    await expect(configure.adoptionNotice).toHaveCount(0)

    await configure.goto()

    // Still replaced, and still silent. The snapshot is in the account, so a
    // notice here would be a sentence about work that was never at risk.
    await expect(configure.savedStack.first()).toBeVisible()
    await expect(localSlot(configure)).toHaveCount(0)
    await expect(configure.adoptionNotice).toHaveCount(0)
    expect(created).toHaveLength(2)
  })

  test("leaves an account that already has stacks alone", async ({ page }) => {
    stubCreateConfig(page)
    const { created } = stubSignedIn(page, [stack("Weekday")])

    const configure = new ConfigurePage(page)
    await configure.goto()
    await configure.seedSavedStack(STORED_PAYLOAD)
    await configure.goto()

    await expect(configure.stack("Weekday")).toBeVisible()
    // Somebody with stacks has been here before. Re-uploading a stale local
    // slot on every new machine would breed duplicates nobody asked for.
    expect(created).toStrictEqual([])
  })
})

test.describe("the composer, signed in", () => {
  // EDITOR-54. The worker owns the model, the key and the prompt; what the
  // editor owns is everything on this side of an id, and that is what these
  // cover. The model is deliberately not stubbed — the WORKER is — because
  // whether Claude picks React for "a react app" is its judgement, and a test
  // asserting it here would be asserting on a fixture.
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

    // Selected exactly as a click on the cell would have selected it — which is
    // the claim that matters, because it is what stops a proposal reaching a
    // configuration a person could not have reached by hand.
    await expect(
      configure.skillIn(DOMAINS.web, EXCLUSIVE_CATEGORY.name, "React").root
    ).toHaveAttribute("aria-pressed", "true")
  })
})

// The auth routes are rate limited — `apps/server/src/auth.ts` carries the
// windows, and sign-in's is the tightest — so a refusal here is an ordinary
// Tuesday rather than an outage. Every one of them used to reach the browser
// as an unhandled rejection or as nothing at all.
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

  // A refusal whose body is not JSON — which is what a rate limiter, a proxy
  // or a gateway in front of the worker answers with. Reading one as JSON was
  // the second way a click became an unhandled rejection.
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
    // Still signed in, because the worker never heard the request — and that
    // is the honest reading rather than a rail drawn from a hope.
    await expect(configure.accountName).toHaveText(SIGNED_IN_USER.name)
  })
})

// The signed-out Save always succeeds — it writes to localStorage — so a
// signed-in Save that fails silently makes one button mean two things. Every
// refusal below is reported on the button that was pressed.
test.describe("a save the worker will not take", () => {
  test("a refused mint says so on the button", async ({ page }) => {
    stubCreateConfigRefusal(page, STORE_UNAVAILABLE)
    stubSignedIn(page)
    const configure = await arrive(page)

    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.saveButton.click()

    await expect(
      configure.roster.root.getByRole("button", { name: "Saving failed" })
    ).toBeVisible()
    // Nothing to do but try later, so the words clear themselves.
    await expect(configure.roster.saveButton).toBeVisible()
  })

  test("a refused save says so, and the grid gains nothing", async ({
    page,
  }) => {
    stubCreateConfig(page)
    stubSignedIn(page)
    stubStackRefusal(page, STORE_UNAVAILABLE)
    const configure = await arrive(page)

    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.saveButton.click()

    await expect(
      configure.roster.root.getByRole("button", { name: "Saving failed" })
    ).toBeVisible()
    // The stub refused it, so no cell may appear: a grid that draws a stack the
    // account does not have is the defect this refusal exists to make
    // impossible.
    //
    // `created` is deliberately NOT asserted here. Playwright matches routes in
    // reverse registration order, so `stubStackRefusal` shadows the POST handler
    // that fills that array — it would read empty whether the refusal worked or
    // not, which is an assertion that cannot fail. The button's words and the
    // absent cell are what actually distinguish the two outcomes.
    await expect(configure.savedStack).toBeHidden()
  })

  // The session expired while the tab was open. It is the one refusal here
  // that names an action, so like the stale-tab ending it must not clear
  // itself — the words have to survive being looked away from.
  test("an expired session names its own fix, and the words stay", async ({
    page,
  }) => {
    stubCreateConfig(page)
    stubSignedIn(page)
    stubStackRefusal(page, 401)
    const configure = await arrive(page)

    await configure.chooseStack(STACKS.nextjs)
    await configure.roster.saveButton.click()

    const instruction = configure.roster.root.getByRole("button", {
      name: "Signed out — sign in",
    })
    await expect(instruction).toBeVisible()

    await page.waitForTimeout(PAST_THE_DECAY_WINDOW_MS)
    await expect(instruction).toBeVisible()
  })
})
