import {
  ACME_SKILL_ID,
  CONFIGS_URL,
  DEAD_LINK_ID,
  DRIFTED_IMPORT_ID,
  DRIFTED_MARKETPLACE_PAYLOAD,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  OUT_OF_DATE,
  OUT_OF_SCOPE_IMPORT_ID,
  OUT_OF_SCOPE_PAYLOAD,
  PRIVATE_IMPORT_ID,
  PRIVATE_MARKETPLACE_PAYLOAD,
  RETIRED_SKILL_ID,
  STORED_ID,
  STORED_PAYLOAD,
  STORE_UNAVAILABLE,
  configHandlers,
  configRefusedHandlerFor,
  configUnreachableHandler,
  missingConfigHandlerFor,
  storedConfigHandlerFor,
} from "@workspace/api-mocks"
import { getResponse, http } from "msw"

import { stubWith } from "./stub"

import type { Page } from "@playwright/test"
import type { JsonBodyType, PathParams, RequestHandler } from "msw"

// The sharing worker's handlers come from `@workspace/api-mocks`; this file
// decides only which answer a spec gets.

export {
  ACME_SKILL_ID,
  DEAD_LINK_ID,
  DRIFTED_IMPORT_ID,
  DRIFTED_MARKETPLACE_PAYLOAD,
  MARKETPLACE_IMPORT_ID,
  MARKETPLACE_PAYLOAD,
  OUT_OF_DATE,
  OUT_OF_SCOPE_IMPORT_ID,
  OUT_OF_SCOPE_PAYLOAD,
  PRIVATE_IMPORT_ID,
  PRIVATE_MARKETPLACE_PAYLOAD,
  RETIRED_SKILL_ID,
  STORED_ID,
  STORED_PAYLOAD,
  STORE_UNAVAILABLE,
}

/**
 * The store answering as it does when nothing has gone wrong: the POST mints
 * the content address, and the GET holds one payload and knows no other id.
 */
export const stubCreateConfig = (page: Page) => stubWith(page, configHandlers)

// The same stub, keeping each POST body in order. A spy only: the worker's own
// validating handler answers.
export const captureCreateConfig = (page: Page) => {
  const posted: Record<string, unknown>[] = []

  stubWith(page, [
    http.post<PathParams, Record<string, unknown>>(
      CONFIGS_URL,
      async ({ request }) => {
        // A body is read once, so the clone is forwarded; `request.json()` is
        // the typed half.
        const forwarded = request.clone()

        // Raw, not parsed: the schema strips unknown keys, and specs assert
        // `model` and `effort` are absent.
        posted.push(await request.json())

        // The worker's own answer, validation included.
        return getResponse(configHandlers, forwarded)
      }
    ),
    ...configHandlers,
  ])

  return posted
}

/**
 * Keeps the raw bytes: parsing normalises, and some specs claim two payloads
 * are byte-identical.
 */
export const captureCreateConfigBodies = (page: Page) => {
  const bodies: string[] = []

  stubWith(page, [
    http.post<PathParams, Record<string, unknown>>(
      CONFIGS_URL,
      async ({ request }) => {
        // Here the recording takes the original and the clone is forwarded.
        const forwarded = request.clone()
        bodies.push(await request.text())

        return getResponse(configHandlers, forwarded)
      }
    ),
    ...configHandlers,
  ])

  return bodies
}

/**
 * Posts from the page, bypassing the app: nothing the app sends can reach a
 * body the write contract refuses.
 */
export const postToConfigStore = (page: Page, seed: unknown) =>
  page.evaluate(
    async ({ url, body }) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

      const answered: unknown = await response.json()
      return { status: response.status, body: answered }
    },
    { url: CONFIGS_URL, body: seed }
  )

/**
 * JSON rather than a `SeedPayload`: one spec serves back a body it captured
 * unparsed.
 */
export const stubGetConfig = (
  page: Page,
  id: string,
  payload: JsonBodyType = STORED_PAYLOAD
) => stubWith(page, [storedConfigHandlerFor(id, payload), ...configHandlers])

/** The store having never heard of one named id. */
export const stubGetConfigMissing = (page: Page, id: string) =>
  stubWith(page, [missingConfigHandlerFor(id), ...configHandlers])

/**
 * The POST refusing with `status`; anything it does not claim falls through.
 */
export const stubCreateConfigRefusal = (page: Page, status: number) =>
  stubWith(page, [configRefusedHandlerFor(status)])

/** The next POST refused with `status`; every later one falls through. */
export const stubCreateConfigRefusalOnce = (page: Page, status: number) =>
  stubWith(page, [
    http.post(
      CONFIGS_URL,
      ({ request }) => getResponse([configRefusedHandlerFor(status)], request),
      { once: true }
    ),
  ])

/**
 * Every POST answered by the worker only once `release` is called, so a spec
 * can read what the page shows while it waits.
 */
export const holdCreateConfig = (page: Page) => {
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })

  stubWith(page, [
    http.post(CONFIGS_URL, async ({ request }) => {
      await released
      return getResponse(configHandlers, request)
    }),
  ])

  return release
}

const holdGetConfigAnswering = (
  page: Page,
  id: string,
  answer: RequestHandler
) => {
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })

  stubWith(page, [
    http.get(`${CONFIGS_URL}/${id}`, async ({ request }) => {
      await released
      return getResponse([answer], request)
    }),
  ])

  return release
}

/**
 * One id's GET answered with `payload` only once `release` is called, so a
 * spec can read what the page shows before the payload arrives.
 */
export const holdGetConfig = (
  page: Page,
  id: string,
  payload: JsonBodyType = STORED_PAYLOAD
) => holdGetConfigAnswering(page, id, storedConfigHandlerFor(id, payload))

/** One id's GET answered 404 only once `release` is called. */
export const holdGetConfigMissing = (page: Page, id: string) =>
  holdGetConfigAnswering(page, id, missingConfigHandlerFor(id))

/** The POST never answered: unlike a refusal, there is no status to read. */
export const stubCreateConfigUnreachable = (page: Page) =>
  stubWith(page, [configUnreachableHandler])
