import {
  GITHUB_API_ORIGIN,
  MALFORMED_CATALOG,
  MARKETPLACE_CATALOG,
  MARKETPLACE_TOKEN,
  PRIVATE_MARKETPLACE_REF,
} from "@workspace/api-mocks/fixtures"

import type { Page, Route } from "@playwright/test"

// A marketplace's `catalog.json`, stubbed at the browser boundary. What these
// specs test is the editor's half — the dialog, the swap, and what a failure
// looks like on screen — not GitHub, and not `build marketplace`, which has its
// own suite in packages/cli.
//
// The interception is Playwright's because `page.route` is what works in a real
// browser; what it answers with comes from `@workspace/api-mocks`, the same
// fixtures MSW serves the unit suite. Two mechanisms, one statement of the
// response — the arrangement `support/skill-index.ts` already established.
//
// Every catalogue request goes to api.github.com and NOT to our worker, which
// is the design rather than an implementation detail: org content never transits
// anything of ours. A stub pointed anywhere else would be testing a different
// architecture.

const CATALOG_URL = `${GITHUB_API_ORIGIN}/repos/*/**/contents/**`

const NOT_FOUND = 404

// Every stub returns the Authorization headers it was called with, in order.
// Whether a token was sent — and whether it was sent when the field was left
// empty — is the security half of the contract, so a spec about it needs the
// headers and not only the body.
const stubCatalogWith = async (
  page: Page,
  fulfil: (route: Route) => Promise<void>
) => {
  const authorizations: (string | null)[] = []

  await page.route(CATALOG_URL, (route) => {
    authorizations.push(route.request().headers()["authorization"] ?? null)
    return fulfil(route)
  })

  return authorizations
}

/** A marketplace anyone may read, answering with the catalogue it published. */
export const stubMarketplaceCatalog = (page: Page) =>
  stubCatalogWith(page, (route) =>
    route.fulfill({ status: 200, json: MARKETPLACE_CATALOG })
  )

// A SECOND marketplace, for the browser that has saved more than one.
//
// Derived from the first by renaming rather than written out again: every id,
// category and display name carries `bigco` where the fixture carries `acme`.
// CLI-498's prefix rule is what makes a rename enough — a marketplace's ids
// carry its own name, so two catalogues share no id at all, which is both
// realistic and what makes "which one is on the grid" observable rather than a
// matter of counting.
export const BIGCO_REF = "bigco/skills"

export const BIGCO_CATALOG = JSON.parse(
  JSON.stringify(MARKETPLACE_CATALOG)
    .replaceAll("acme", "bigco")
    .replaceAll("Acme", "Bigco")
) as typeof MARKETPLACE_CATALOG

const repoSegment = (ref: string) => `/repos/${ref}/`

const isFor = (route: Route, ref: string) =>
  route.request().url().includes(repoSegment(ref))

const isAuthorized = (route: Route) =>
  route.request().headers()["authorization"] === `Bearer ${MARKETPLACE_TOKEN}`

/**
 * Three marketplaces at once: two anyone may read, and one that answers only to
 * the token — which is what a browser holding a PAT for one repository and a
 * plain catalogue for another actually looks like.
 *
 * The arrangement a single `{ marketplace, token }` slot could not hold, so it
 * is the arrangement the keyed one has to be shown holding. Two is also the
 * smallest number that can disagree, and a switcher has nothing to list until
 * there are two.
 */
export const stubMarketplaceEstate = (page: Page) =>
  stubCatalogWith(page, (route) => {
    if (isFor(route, PRIVATE_MARKETPLACE_REF)) {
      return isAuthorized(route)
        ? route.fulfill({ status: 200, json: MARKETPLACE_CATALOG })
        : route.fulfill({ status: NOT_FOUND, json: { message: "Not Found" } })
    }

    return route.fulfill({
      status: 200,
      json: isFor(route, BIGCO_REF) ? BIGCO_CATALOG : MARKETPLACE_CATALOG,
    })
  })

/**
 * A private marketplace: 404 until the token arrives, which is GitHub's own
 * behaviour and the reason a 404 has to offer a token rather than declare the
 * name wrong — an unauthorized caller cannot tell a repository that does not
 * exist from one they may not see.
 */
export const stubPrivateMarketplaceCatalog = (page: Page) =>
  stubCatalogWith(page, (route) => {
    const authorized =
      route.request().headers()["authorization"] ===
      `Bearer ${MARKETPLACE_TOKEN}`

    return authorized
      ? route.fulfill({ status: 200, json: MARKETPLACE_CATALOG })
      : route.fulfill({ status: NOT_FOUND, json: { message: "Not Found" } })
  })

/**
 * A marketplace that does not resolve, for anyone, with any token. The failure
 * path a wrong name reaches.
 */
export const stubMissingMarketplace = (page: Page) =>
  stubCatalogWith(page, (route) =>
    route.fulfill({ status: NOT_FOUND, json: { message: "Not Found" } })
  )

// How long the refusal below takes to arrive. Long enough for a spec to open
// the dialog by hand before an arriving payload's catalogue has failed, which
// is the one window in which the two can collide.
const SLOW_REFUSAL_MS = 1500

/**
 * The same refusal, arriving slowly.
 *
 * What it buys is that window: the form can already be mounted when the
 * recovery turns up, and it has to take one it did not open with.
 */
export const stubSlowMissingMarketplace = (page: Page) =>
  stubCatalogWith(page, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_REFUSAL_MS))
    await route.fulfill({ status: NOT_FOUND, json: { message: "Not Found" } })
  })

/**
 * A catalogue that is JSON and is not a catalogue. The one failure with no
 * retry in it: the bytes will not improve, so the screen has to name the field
 * that is wrong rather than invite another attempt.
 */
export const stubMalformedCatalog = (page: Page) =>
  stubCatalogWith(page, (route) =>
    route.fulfill({ status: 200, json: MALFORMED_CATALOG })
  )
