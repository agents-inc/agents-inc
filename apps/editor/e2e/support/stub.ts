import {
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
  WORKER_ORIGIN,
} from "@workspace/api-mocks"

import type { NetworkFixture } from "@msw/playwright"
import type { Page } from "@playwright/test"
import type { RequestHandler } from "msw"

// How this suite installs the ONE mock of everything the editor talks to.
//
// The handlers come from `@workspace/api-mocks`, which is also what the Vitest
// suite runs — so the two suites do not describe the worker twice. What differs
// is only the interception: Vitest gets msw's own, patched into the process; a
// real browser cannot be patched, so `@msw/playwright` — msw's own Playwright
// binding — routes the browser's requests back through the same handlers.
//
// That binding is why this file is now bookkeeping and nothing else. Which
// handler wins, what a refusal's body says, how a dead connection ends: every
// one of those is msw's answer rather than a second opinion, and a second
// opinion is exactly what produced a Playwright suite answering
// `POST /api/auth/sign-in/social` with a session body the worker cannot send.

/**
 * Every origin this app talks to that is not this app: the worker, and the two
 * GitHub hosts an external skill's directory is read from.
 *
 * This is the set an unstubbed request is REFUSED for, in `fixtures.ts`.
 * Everything else a page asks for is the dev server handing over the app
 * itself, which is nobody's mock and has to be left alone.
 */
export const THIRD_PARTY_ORIGINS = [
  WORKER_ORIGIN,
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
]

// Which network fixture owns which page. Keyed by page so every helper under
// e2e/support/ keeps taking the `page` its specs already hold: the fixture is
// what `use()` has to be called on, and threading it through thirty spec files
// would buy nothing but the churn.
const networks = new WeakMap<Page, NetworkFixture>()

/** Told to this module by the fixture, as the page is handed to a test. */
export const servedBy = (page: Page, network: NetworkFixture) => {
  networks.set(page, network)
}

const networkOf = (page: Page) => {
  const network = networks.get(page)

  if (!network) {
    throw new Error(
      "this page has no network fixture — import `test` from e2e/fixtures.ts rather than from @playwright/test"
    )
  }

  return network
}

/**
 * Answer this page's requests with these handlers, first match winning.
 *
 * The same argument order `configMockServer.use(...)` obeys in the Vitest suite,
 * so a refusal that can only be reached signed in goes AHEAD of the signed-in
 * set here too.
 *
 * CALLS ACCUMULATE, AND THE FILTER IS THE WHOLE OF THIS FUNCTION. `use()` puts
 * everything it is handed in front of what is already there, so a call that
 * RE-PASSES a set already registered moves that set ahead of whatever an
 * earlier call put in front of it. `stubGetConfig` registers
 * `[thisId, ...configHandlers]` and `stubCreateConfig` registers
 * `configHandlers`; in that order and without the filter, `readConfig` — which
 * claims every id and answers 404 for the ones it does not hold — lands ahead
 * of `thisId` and shadows it with a 404. Deleting the filter reddens five tests
 * in `specs/scope-reach.spec.ts`, which is that pair in that order.
 *
 * The same shadowing under the hand-rolled bridge this replaced was expensive
 * to find: a shared-link spec read "this share link points to nothing" while
 * its own stub sat one registration below the default set. So only genuinely
 * new handlers go in front, and one already present keeps the position it was
 * first given.
 *
 * WHAT IS FILTERED AGAINST IS THIS MODULE'S OWN RECORD, AND THAT DISTINCTION IS
 * THE BUG THIS ONCE HAD. `network.listHandlers()` also returns the fixture's
 * INITIAL set — msw seeds `state.handlers` from `initialHandlers` — and
 * `fixtures.ts` seeds it with `authHandlers`, the very instances
 * `stubSignedOut` passes. Filtered against that list, `stubSignedOut` reduced
 * to an empty array and `use()` returns early on one, so it was a TOTAL NO-OP:
 * a page signed in by `stubSignedIn` could never be signed out again. Nothing
 * was red, because signed-out is the fixture's default and no spec called both
 * — its five call sites were passing on the default rather than on the helper
 * they name. A helper that installs nothing and reports success is the one
 * failure a green suite cannot show you, which is why the record is kept here
 * rather than read back from the fixture: the baseline is what `use()` exists
 * to override, so it must never count as already installed.
 */
const installed = new WeakMap<Page, RequestHandler[]>()

export const stubWith = (page: Page, handlers: RequestHandler[]) => {
  const network = networkOf(page)
  const known = installed.get(page) ?? []
  const fresh = handlers.filter((handler) => !known.includes(handler))

  installed.set(page, [...fresh, ...known])
  network.use(...fresh)
}
