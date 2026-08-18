import {
  DEAD_LINK_ID,
  MARKETPLACE_CATALOG,
  MARKETPLACE_REF,
  NO_CONFIG_BODY,
  PRIVATE_MARKETPLACE_REF,
  STORED_ID,
  STORED_PAYLOAD,
  WORKER_ORIGIN,
} from "@workspace/api-mocks/fixtures"
import { SEED_VERSION, seedPayloadSchema } from "@workspace/matrix/seed"

import type { Page } from "@playwright/test"
import type { SeedPayload } from "@workspace/matrix/seed"

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

// What `edit --ui` hands over: ids from a marketplace's catalogue, and the
// marketplace named at the top so a receiver knows which catalogue can resolve
// them. Every id below carries the marketplace's own name as a prefix
// (CLI-498), so none of them exists in the public catalogue — which is what
// makes "the catalogue was loaded before the ids were read" observable rather
// than a coincidence of counting.

const [ACME_SKILL_ID] = Object.keys(MARKETPLACE_CATALOG.skills) as [string]

export { ACME_SKILL_ID }

/** An id no catalogue carries — the drift a payload has to survive out loud. */
export const RETIRED_SKILL_ID = "acme-web-retired"

export const MARKETPLACE_IMPORT_ID = "AcmeMk_1"
export const PRIVATE_IMPORT_ID = "AcmePv_2"
export const DRIFTED_IMPORT_ID = "AcmeDr_3"

// Parsed rather than asserted, for the reason every fixture beside it is: a
// payload that drifts from the shared contract fails here rather than in
// whichever assertion happens to read the changed field.
const marketplacePayload = (marketplace: string, skillIds: string[]) =>
  seedPayloadSchema.parse({
    v: SEED_VERSION,
    matrixVersion: MARKETPLACE_CATALOG.version,
    stackId: null,
    marketplace,
    skills: Object.fromEntries(
      skillIds.map((skillId) => [
        skillId,
        {
          install: "plugin",
          scope: "project",
          assignments: { "web-developer": "preloaded" },
        },
      ])
    ),
    agents: {},
  })

/** A marketplace anyone may read. */
export const MARKETPLACE_PAYLOAD = marketplacePayload(MARKETPLACE_REF, [
  ACME_SKILL_ID,
])

/** One that needs a token, which is where the recovery flow starts. */
export const PRIVATE_MARKETPLACE_PAYLOAD = marketplacePayload(
  PRIVATE_MARKETPLACE_REF,
  [ACME_SKILL_ID]
)

/** One naming a skill its own marketplace has since retired. */
export const DRIFTED_MARKETPLACE_PAYLOAD = marketplacePayload(MARKETPLACE_REF, [
  ACME_SKILL_ID,
  RETIRED_SKILL_ID,
])

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

// The payload defaults to the public-catalogue one, so every spec written
// before marketplaces existed reads exactly as it did.
export const stubGetConfig = (
  page: Page,
  id: string,
  payload: SeedPayload = STORED_PAYLOAD
) =>
  page.route(`${WORKER_ORIGIN}/configs/${id}`, (route) =>
    route.fulfill({ status: 200, json: payload })
  )

export const stubGetConfigMissing = (page: Page, id: string) =>
  page.route(`${WORKER_ORIGIN}/configs/${id}`, (route) =>
    route.fulfill({ status: 404, body: NO_CONFIG_BODY })
  )
