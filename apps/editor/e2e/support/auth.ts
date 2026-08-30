import {
  COMPOSE_URL,
  SIGN_IN_URL,
  STACKS_URL,
  authHandlers,
  composeRefusedHandlerFor,
  composeUnreachableHandler,
  savedStack,
  signInUnreachableHandler,
  signOutUnreachableHandler,
  signedInHandlers,
  stackRefusedHandlerFor,
} from "@workspace/api-mocks"
import { HttpResponse, http } from "msw"

import { stubWith } from "./stub"

import type { Page } from "@playwright/test"
import type { SavedStack } from "@workspace/api-mocks"
import type { PathParams } from "msw"

// SERVER-04 / EDITOR-57. The worker's auth and stack routes.
//
// The OAuth redirect itself is NOT stubbed and never will be: it leaves for
// github.com, and a test that fakes both ends of somebody else's protocol
// asserts that the fake works. What these specs cover is everything on this
// side of it — what the editor draws when nobody is signed in, what it draws
// when somebody is, and what it sends when they save.
//
// The handlers are `@workspace/api-mocks`', the same ones the Vitest suite
// runs; `stubWith` is the only thing this suite adds, and all it adds is the
// interception. Before that, this file described the worker a second time and
// got it wrong: a blanket route over `/api/auth/**` answered a SIGN-IN with the
// session body, which is not something the worker can send and not something
// the client can act on.

export { SIGNED_IN_USER } from "@workspace/api-mocks"

// The worker mints a stack row from what it was sent, so the fixture is a
// function and this is that function under the name the specs already use.
export { savedStack as stack }
export type { SavedStack }

const CREATED = 201

// What the composer's stub says when the spec has not named a reason. One
// constant rather than a literal per stub: `stubCompose` and `holdCompose`
// answer with the same envelope and differ only in WHEN.
const DEFAULT_COMPOSE_REASON = "Chosen for you."

/**
 * Nobody is signed in — what a first visit looks like, and the default.
 *
 * The auth routes are the whole stub. `/stacks` is deliberately NOT covered:
 * the store never gets past the session read while signed out, so a 401 here
 * would be an answer to a request that is never sent, and `accounts.spec.ts`
 * asserts the silence instead. Anything that does start asking reaches the
 * fixture's third-party guard, which says so by name.
 */
export const stubSignedOut = (page: Page) => stubWith(page, authHandlers)

/**
 * Somebody is, and these are their stacks.
 *
 * Returns what the page sent, because the interesting assertions are about the
 * REQUEST — a save is a name and a pointer, and the pointer has to be the id
 * the payload was minted under rather than anything derived here.
 *
 * The two list handlers go AHEAD of the signed-in set for the reason
 * `configMockServer.use(...)` takes its arguments in that order: what a spec
 * says about this person's stacks has to outrank the fixture's own two.
 */
export const stubSignedIn = (page: Page, stacks: SavedStack[] = []) => {
  const created: { name: string; configId: string }[] = []
  let current = [...stacks]

  stubWith(page, [
    http.get(STACKS_URL, () => HttpResponse.json(current)),
    http.post<PathParams, { name: string; configId: string }>(
      STACKS_URL,
      async ({ request }) => {
        const body = await request.json()
        created.push(body)

        const saved = savedStack(body.name, body.configId)
        current = [saved, ...current]

        return HttpResponse.json(saved, { status: CREATED })
      }
    ),
    ...signedInHandlers,
  ])

  return { created }
}

// The composer's backend, in the one shape its two stubs share: a chosen set of
// skill ids, the sentences it was asked, and a gate deciding WHEN it answers.
//
// The MODEL is not stubbed — the worker is. That is the boundary worth faking:
// what the editor is responsible for is turning ids into rows, applying them
// through the app's own verb, and not drawing a stale answer. Whether Claude
// picks React for "a react app" is the worker's contract and the model's
// judgement, and asserting on it here would be asserting on a stub.
//
// One route and no more, so a spec that already said who is signed in keeps
// saying it: anything this set does not claim falls through to whatever was
// installed before it.
const stubComposeAnswering = (
  page: Page,
  skillIds: string[],
  reason: string,
  answered: Promise<void>
) => {
  const asked: string[] = []

  stubWith(page, [
    http.post<PathParams, { sentence: string }>(
      COMPOSE_URL,
      async ({ request }) => {
        const { sentence } = await request.json()
        asked.push(sentence)
        await answered

        return HttpResponse.json({ skillIds, reason })
      }
    ),
  ])

  return asked
}

/** A gate that was never shut — the answer lands the moment it is asked for. */
const ANSWERED_AT_ONCE = Promise.resolve()

/** One that stays shut until the caller releases it. */
const heldShut = () => {
  let open!: () => void
  const answered = new Promise<void>((resolve) => {
    open = resolve
  })

  return { answered, release: () => open() }
}

/** Answering with a chosen set of skill ids, and saying why. */
export const stubCompose = (
  page: Page,
  skillIds: string[],
  reason = DEFAULT_COMPOSE_REASON
) => ({
  asked: stubComposeAnswering(page, skillIds, reason, ANSWERED_AT_ONCE),
})

/**
 * The same route, ANSWERING ONLY WHEN TOLD TO.
 *
 * Every claim about an in-flight submit is a claim about the window between the
 * press and the answer, and a stub that fulfils at once closes that window
 * before an assertion can look into it. `release` reopens it, so a test decides
 * when the round trip ends rather than racing it.
 *
 * `asked` is what makes a gate assertable in the only place it is visible: a
 * press the composer swallows and a press it never accepted look identical on
 * screen, and differ only in how many sentences reached the worker.
 *
 * A handler is an ordinary async function, so holding one open is the same
 * `await` a slow worker would make the browser do — which is why this needs no
 * interception of its own, and why it takes part in the accumulation and the
 * fixture's third-party guard like every other stub here.
 */
export const holdCompose = (page: Page, skillIds: string[] = []) => {
  const { answered, release } = heldShut()
  const asked = stubComposeAnswering(
    page,
    skillIds,
    DEFAULT_COMPOSE_REASON,
    answered
  )

  return { asked, release }
}

/**
 * The save refusing, named by the status it refuses with.
 *
 * Installed AFTER `stubSignedIn` so it outranks it, and it answers the GET
 * with an empty list rather than refusing that too: what is under test is the
 * POST, and a refused load would put the page in a different state before the
 * click that matters.
 */
export const stubStackRefusal = (page: Page, status: number) =>
  stubWith(page, [
    http.get(STACKS_URL, () => HttpResponse.json([])),
    stackRefusedHandlerFor(status),
  ])

/** The composer's route refusing, named by the status it refuses with. */
export const stubComposeRefusal = (page: Page, status: number) =>
  stubWith(page, [composeRefusedHandlerFor(status)])

/**
 * The request never getting an answer at all, which is a different ending from
 * any refusal above — the worker never saw it.
 */
export const stubComposeUnreachable = (page: Page) =>
  stubWith(page, [composeUnreachableHandler])

/** Sign-in never getting an answer at all. */
export const stubSignInUnreachable = (page: Page) =>
  stubWith(page, [signInUnreachableHandler])

/** Sign-out never getting one — a different claim, and a different screen. */
export const stubSignOutUnreachable = (page: Page) =>
  stubWith(page, [signOutUnreachableHandler])

const TOO_MANY = 429

/**
 * A sign-in refused with a body that is NOT JSON.
 *
 * The one refusal here that `@workspace/api-mocks` deliberately does not carry,
 * because it is not the worker: `signInRateLimitedHandler` is the route's own
 * 429 and it sends no body at all. These bytes are a limiter, a proxy or a
 * gateway IN FRONT of the worker answering instead — prose where the client
 * expects an envelope, which is how a click became an unhandled rejection. A
 * body that describes somebody else's infrastructure does not belong in the
 * package that states this worker's contract.
 */
export const stubSignInRefusalWithoutJson = (page: Page) =>
  stubWith(page, [
    http.post(SIGN_IN_URL, () =>
      HttpResponse.text("Too many requests", { status: TOO_MANY })
    ),
  ])
