import {
  SKILL_INDEX,
  SKILL_INDEX_UNAVAILABLE_BODY,
  STALE_SKILL_INDEX,
  WORKER_ORIGIN,
} from "@workspace/api-mocks/fixtures"
import { SKILL_INDEX_FRESHNESS_HEADER } from "@workspace/matrix/skill-index"

import type { Page, Route } from "@playwright/test"

// The federated skill index — the add-skills dialog's only network call. The
// specs mock it at the browser boundary: what these test is the dialog's half
// of the round trip, not the crawler — apps/server has its own suite.
//
// The interception stays Playwright's, because `page.route` is what works in a
// real browser. What it answers with does not: the entries, the freshness
// header and the worker's own refusal body come from `@workspace/api-mocks`,
// which is also what the unit suite serves through MSW. Two mechanisms, one
// statement of the response.
//
// Every stub declares `Access-Control-Expose-Headers`, and that line is load-
// bearing rather than ceremony. `x-skill-index` is a custom response header,
// which a browser hides from a cross-origin caller unless the server also names
// it there — so a stub that sets the freshness header and not this one is
// answering as a worker whose `cors()` exposes nothing, and Chromium enforces
// that here exactly as it does against the real origin.
//
// The worker exposes it, so the two freshness stubs are faithful. The third,
// `stubSkillIndexHidingFreshness`, is what the browser sees when it is not —
// see its own note.

const SKILL_INDEX_URL = `${WORKER_ORIGIN}/skills`

const INDEX_UNAVAILABLE = 503

const declaredFresh = {
  [SKILL_INDEX_FRESHNESS_HEADER]: "fresh",
  "access-control-expose-headers": SKILL_INDEX_FRESHNESS_HEADER,
}

const declaredStale = {
  [SKILL_INDEX_FRESHNESS_HEADER]: "stale",
  "access-control-expose-headers": SKILL_INDEX_FRESHNESS_HEADER,
}

// Every stub returns the requests it answered, appended in order. The
// freshness contract is about WHEN the dialog asks again — a fresh index is
// the whole picture and is reused, anything else is not — so a spec about it
// needs the count and not only the body.
const stubSkillIndexWith = async (
  page: Page,
  fulfil: (route: Route) => Promise<void>
) => {
  const requests: string[] = []

  await page.route(SKILL_INDEX_URL, (route) => {
    requests.push(route.request().url())
    return fulfil(route)
  })

  return requests
}

/** The worker answering with everything it has crawled and nothing stale. */
export const stubSkillIndex = (page: Page) =>
  stubSkillIndexWith(page, (route) =>
    route.fulfill({ status: 200, json: SKILL_INDEX, headers: declaredFresh })
  )

/**
 * GitHub unreachable, or a cold index still filling in. A 200 either way: the
 * body is a normal index and only the header says the list is not everything.
 */
export const stubStaleSkillIndex = (page: Page) =>
  stubSkillIndexWith(page, (route) =>
    route.fulfill({
      status: 200,
      json: STALE_SKILL_INDEX,
      headers: declaredStale,
    })
  )

/**
 * The freshness header set and then discarded by the browser, because nothing
 * exposed it cross-origin. This was the deployed worker until `cors()` gained
 * `exposeHeaders`; it is now the two ways that can still happen — the option
 * being dropped again, or a proxy between the worker and the browser stripping
 * a header neither end is told about.
 *
 * It stays because `freshnessOf`'s `unknown` branch stays, and this is the only
 * thing that reaches it: whatever the worker meant, the dialog cannot read it,
 * which is a third answer rather than a stale one and the difference is visible
 * to a user.
 */
export const stubSkillIndexHidingFreshness = (page: Page) =>
  stubSkillIndexWith(page, (route) =>
    route.fulfill({
      status: 200,
      json: SKILL_INDEX,
      headers: { [SKILL_INDEX_FRESHNESS_HEADER]: "fresh" },
    })
  )

/** Nothing cached at all AND an upstream that will not answer. */
export const stubSkillIndexUnavailable = (page: Page) =>
  stubSkillIndexWith(page, (route) =>
    route.fulfill({
      status: INDEX_UNAVAILABLE,
      body: SKILL_INDEX_UNAVAILABLE_BODY,
    })
  )
