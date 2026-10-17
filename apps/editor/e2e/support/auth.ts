import {
  COMPOSE_URL,
  SIGN_IN_URL,
  STACKS_URL,
  authHandlers,
  composeRefusedHandlerFor,
  composeTooLongHandler,
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

// The worker's auth and stack routes. The OAuth redirect leaves for github.com
// and is never stubbed.

export { SIGNED_IN_USER } from "@workspace/api-mocks"

export { savedStack as stack }
export type { SavedStack }

const CREATED = 201
const SERVICE_UNAVAILABLE = 503

const DEFAULT_COMPOSE_REASON = "Chosen for you."

type StackBody = { name: string; configId: string }

/**
 * Nobody is signed in. `/stacks` is not covered: signed out, it is never
 * asked, and `accounts.spec.ts` asserts that silence.
 */
export const stubSignedOut = (page: Page) => stubWith(page, authHandlers)

/**
 * Signed in with these stacks. Returns the stored `POST /stacks` bodies and
 * `refusing` (names answered 503). Ahead of the signed-in set.
 */
export const stubSignedIn = (page: Page, stacks: SavedStack[] = []) => {
  const created: StackBody[] = []
  const refusing = new Set<string>()
  let current = [...stacks]

  stubWith(page, [
    http.get(STACKS_URL, () => HttpResponse.json(current)),
    http.post<PathParams, StackBody>(STACKS_URL, async ({ request }) => {
      const body = await request.json()
      if (refusing.has(body.name))
        return new HttpResponse(null, { status: SERVICE_UNAVAILABLE })

      created.push(body)

      const saved = savedStack(body.name, body.configId)
      current = [saved, ...current]

      return HttpResponse.json(saved, { status: CREATED })
    }),
    ...signedInHandlers,
  ])

  return { created, refusing }
}

// The composer's route answering with `skillIds` once `answered` settles. The
// worker is stubbed, not the model.
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

const ANSWERED_AT_ONCE = Promise.resolve()

/** A gate that stays shut until the caller releases it. */
const heldShut = () => {
  let open!: () => void
  const answered = new Promise<void>((resolve) => {
    open = resolve
  })

  return { answered, release: () => open() }
}

export const stubCompose = (
  page: Page,
  skillIds: string[],
  reason = DEFAULT_COMPOSE_REASON
) => ({
  asked: stubComposeAnswering(page, skillIds, reason, ANSWERED_AT_ONCE),
})

/**
 * The same route, answering only on `release`, so a test can look inside the
 * in-flight window. `asked` counts what reached the worker.
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
 * `POST /stacks` answering only on `release`, so a test can look at a save in
 * flight. Install after `stubSignedIn` so it outranks that POST.
 */
export const holdStackSave = (page: Page) => {
  const { answered, release } = heldShut()

  stubWith(page, [
    http.post<PathParams, StackBody>(STACKS_URL, async ({ request }) => {
      const body = await request.json()
      await answered

      return HttpResponse.json(savedStack(body.name, body.configId), {
        status: CREATED,
      })
    }),
  ])

  return { release }
}

/**
 * The save refusing with `status`. Install after `stubSignedIn`; the GET
 * answers an empty list so only the POST differs.
 */
export const stubStackRefusal = (page: Page, status: number) =>
  stubWith(page, [
    http.get(STACKS_URL, () => HttpResponse.json([])),
    stackRefusedHandlerFor(status),
  ])

export const stubComposeRefusal = (page: Page, status: number) =>
  stubWith(page, [composeRefusedHandlerFor(status)])

/** The one `/compose` 400 told apart by its body: a sentence past the cap. */
export const stubComposeTooLong = (page: Page) =>
  stubWith(page, [composeTooLongHandler])

export const stubComposeUnreachable = (page: Page) =>
  stubWith(page, [composeUnreachableHandler])

export const stubSignInUnreachable = (page: Page) =>
  stubWith(page, [signInUnreachableHandler])

export const stubSignOutUnreachable = (page: Page) =>
  stubWith(page, [signOutUnreachableHandler])

const TOO_MANY = 429

/**
 * A sign-in refused with a non-JSON body, as a limiter or proxy in front of
 * the worker answers. Not the worker's contract, so not in api-mocks.
 */
export const stubSignInRefusalWithoutJson = (page: Page) =>
  stubWith(page, [
    http.post(SIGN_IN_URL, () =>
      HttpResponse.text("Too many requests", { status: TOO_MANY })
    ),
  ])
