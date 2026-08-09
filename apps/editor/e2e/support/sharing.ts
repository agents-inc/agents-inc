import {
  DEAD_LINK_ID,
  NO_CONFIG_BODY,
  STORED_ID,
  STORED_PAYLOAD,
  WORKER_ORIGIN,
} from "@workspace/api-mocks/fixtures"

import type { Page } from "@playwright/test"

// The sharing worker is the app's second network dependency (after GitHub
// search). The specs mock it at the browser boundary: what these test is the
// app's half of the round trip, not KV — apps/server has its own suite.
//
// The interception stays Playwright's, because `page.route` is what works in a
// real browser. What it answers with does not: the ids, the payload and the
// worker's own bodies come from `@workspace/api-mocks`, which is also what the
// unit suite serves through MSW. Two mechanisms, one statement of the response
// — so a change to the contract cannot land in one suite and not the other.

// Re-exported so a spec still reaches the whole seam through one import.
export { DEAD_LINK_ID, STORED_ID, STORED_PAYLOAD }

export const stubCreateConfig = (page: Page) =>
  page.route(`${WORKER_ORIGIN}/configs`, (route) =>
    route.fulfill({ status: 201, json: { id: STORED_ID } })
  )

// The same stub, keeping what was sent. The POST body *is* the contract with
// the CLI, so a spec asserting on the wire needs the request rather than the
// id the worker answers with. Appended in order: minting happens once per
// install-dialog open, so a spec comparing two configurations reads the
// entries it added around each one.
export const captureCreateConfig = async (page: Page) => {
  const posted: Record<string, unknown>[] = []

  await page.route(`${WORKER_ORIGIN}/configs`, (route) => {
    // Playwright decodes a body to `any`. The annotation is the boundary; the
    // assertion after it is deliberate rather than a parse with
    // `seedPayloadSchema` — the schema strips keys it does not know, and what
    // these specs check is precisely that `model` and `effort` are *absent*
    // from a skill. Parsing would make that assertion pass for free.
    const body: unknown = route.request().postDataJSON()
    posted.push(body as Record<string, unknown>)
    return route.fulfill({ status: 201, json: { id: STORED_ID } })
  })

  return posted
}

export const stubGetConfig = (page: Page, id: string) =>
  page.route(`${WORKER_ORIGIN}/configs/${id}`, (route) =>
    route.fulfill({ status: 200, json: STORED_PAYLOAD })
  )

export const stubGetConfigMissing = (page: Page, id: string) =>
  page.route(`${WORKER_ORIGIN}/configs/${id}`, (route) =>
    route.fulfill({ status: 404, body: NO_CONFIG_BODY })
  )
