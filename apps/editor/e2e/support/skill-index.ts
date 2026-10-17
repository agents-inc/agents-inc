import {
  EXPOSE_HEADERS_HEADER,
  SKILL_INDEX,
  SKILL_INDEX_URL,
  skillIndexHandlers,
  skillIndexUnavailableHandler,
  staleSkillIndexHandler,
} from "@workspace/api-mocks"
import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"
import { HttpResponse, getResponse, http } from "msw"

import { stubWith } from "./stub"

import type { Page } from "@playwright/test"
import type { RequestHandler } from "msw"

// Skill index stubs; the handlers come from `@workspace/api-mocks`.

/**
 * Adds the worker's `access-control-expose-headers: x-skill-index`:
 * `@msw/playwright` fulfils responses verbatim, so without it the header is
 * hidden. Delegates everything else.
 */
const throughWorkerCors = (handlers: RequestHandler[]) =>
  http.get(SKILL_INDEX_URL, async ({ request }) => {
    const answered = await getResponse(handlers, request)

    if (!answered || answered.headers.has(EXPOSE_HEADERS_HEADER))
      return answered

    answered.headers.set(EXPOSE_HEADERS_HEADER, SKILL_INDEX_FRESHNESS_HEADER)
    return answered
  })

// Each stub returns the requests it answered: freshness decides when the dialog
// asks again.
const stubIndexWith = (page: Page, handlers: RequestHandler[]) => {
  const requests: string[] = []

  page.on("request", (request) => {
    if (request.url().startsWith(SKILL_INDEX_URL)) requests.push(request.url())
  })

  stubWith(page, [throughWorkerCors(handlers)])

  return requests
}

export const stubSkillIndex = (page: Page) =>
  stubIndexWith(page, skillIndexHandlers)

/**
 * GitHub unreachable, or a cold index still filling in. A 200 either way: the
 * body is a normal index and only the header says the list is not everything.
 */
export const stubStaleSkillIndex = (page: Page) =>
  stubIndexWith(page, [staleSkillIndexHandler])

/** Header sent but not exposed: the only path to `freshnessOf`'s `unknown`. */
export const stubSkillIndexHidingFreshness = (page: Page) =>
  stubIndexWith(page, [
    http.get(SKILL_INDEX_URL, () =>
      HttpResponse.json(SKILL_INDEX, {
        headers: {
          [SKILL_INDEX_FRESHNESS_HEADER]: "fresh",
          [EXPOSE_HEADERS_HEADER]: "",
        },
      })
    ),
  ])

/** Nothing cached at all AND an upstream that will not answer. */
export const stubSkillIndexUnavailable = (page: Page) =>
  stubIndexWith(page, [skillIndexUnavailableHandler])
