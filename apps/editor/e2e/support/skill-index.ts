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

// The federated skill index — the add-skills dialog's only network call. The
// specs mock it at the browser boundary: what these test is the dialog's half
// of the round trip, not the crawler — apps/server has its own suite.
//
// The handlers are `@workspace/api-mocks`', the same ones the Vitest suite
// runs, and `stubWith` supplies only the interception a real browser needs.

/**
 * The worker's `cors()` exposing `x-skill-index`, added to what these handlers
 * answered — and the one thing this route needs that the handlers do not say.
 *
 * `x-skill-index` is a custom response header, which a browser hides from a
 * cross-origin caller unless the server names it in
 * `access-control-expose-headers`. The deployed worker does name it; msw's own
 * interception is in-process, so the Vitest suite never has to care, and no
 * handler in `@workspace/api-mocks` states it. Under `@msw/playwright` a
 * handler's response is fulfilled verbatim, so unstated means hidden, and the
 * dialog reads every freshness as unknown.
 *
 * It DELEGATES rather than answers: the body, the status and the freshness are
 * still the handlers', resolved by msw's own `getResponse`, so this says one
 * thing about the worker and one only. And it leaves an exposure the handler
 * named alone, which is what keeps `stubSkillIndexHidingFreshness` — whose
 * whole subject is an EMPTY exposure list — meaning what it says.
 *
 * Its home is `@workspace/api-mocks`, beside the handlers whose responses it
 * amends — one statement of the worker rather than two. What keeps it here is
 * that the exposure that package DOES state, `throughCors` in `src/answer.ts`,
 * is reachable only through `answerFor` — the seam for callers that intercept
 * outside msw, whose one caller is packages/cli's config-store server
 * (`grep -rn 'answerFor' apps packages --include='*.ts' | grep -v node_modules`).
 * `@msw/playwright` never goes through it: it resolves the handlers itself with
 * msw's `handleRequest` and fulfils what they return verbatim. So the amendment
 * has to be made where these handlers are registered, which is here.
 */
const throughWorkerCors = (handlers: RequestHandler[]) =>
  http.get(SKILL_INDEX_URL, async ({ request }) => {
    const answered = await getResponse(handlers, request)

    if (!answered || answered.headers.has(EXPOSE_HEADERS_HEADER))
      return answered

    answered.headers.set(EXPOSE_HEADERS_HEADER, SKILL_INDEX_FRESHNESS_HEADER)
    return answered
  })

// Every stub returns the requests it answered, appended in order. The
// freshness contract is about WHEN the dialog asks again — a fresh index is
// the whole picture and is reused, anything else is not — so a spec about it
// needs the count and not only the body.
const stubIndexWith = (page: Page, handlers: RequestHandler[]) => {
  const requests: string[] = []

  page.on("request", (request) => {
    if (request.url().startsWith(SKILL_INDEX_URL)) requests.push(request.url())
  })

  stubWith(page, [throughWorkerCors(handlers)])

  return requests
}

/** The worker answering with everything it has crawled and nothing stale. */
export const stubSkillIndex = (page: Page) =>
  stubIndexWith(page, skillIndexHandlers)

/**
 * GitHub unreachable, or a cold index still filling in. A 200 either way: the
 * body is a normal index and only the header says the list is not everything.
 */
export const stubStaleSkillIndex = (page: Page) =>
  stubIndexWith(page, [staleSkillIndexHandler])

/**
 * The freshness header set and then discarded by the browser, because nothing
 * exposed it cross-origin. This was the deployed worker until `cors()` gained
 * `exposeHeaders`; it is now the two ways that can still happen — the option
 * being dropped again, or a proxy between the worker and the browser stripping
 * a header neither end is told about.
 *
 * The empty exposure list is what says so, and it has to be written out: with
 * the header absent, `throughWorkerCors` would supply the worker's own, which
 * is the arrangement this stub exists to be the opposite of.
 *
 * It stays because `freshnessOf`'s `unknown` branch stays, and this is the only
 * thing that reaches it: whatever the worker meant, the dialog cannot read it,
 * which is a third answer rather than a stale one and the difference is visible
 * to a user.
 */
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
