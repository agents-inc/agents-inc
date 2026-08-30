import {
  BIGCO_CANONICAL_REF,
  BIGCO_CATALOG,
  BIGCO_REF,
  CATALOG_URL,
  MALFORMED_CATALOG,
  MARKETPLACE_CATALOG,
  PRIVATE_MARKETPLACE_REF,
  carriesMarketplaceToken,
  githubNotFound,
} from "@workspace/api-mocks"
import { HttpResponse, delay, http } from "msw"

import { stubWith } from "./stub"

import type { Page } from "@playwright/test"

// A marketplace's `catalog.json`. What these specs test is the editor's half —
// the dialog, the swap, and what a failure looks like on screen — not GitHub,
// and not `build marketplace`, which has its own suite in packages/cli.
//
// The handlers are msw's, resolved into the browser by `stubWith`, and the
// route, the catalogues, GitHub's own 404 and the token check are all
// `@workspace/api-mocks`' — the same ones the Vitest suite serves. What is
// decided here rather than there is only WHICH repository answers, because that
// is the whole subject of these specs and a fixture cannot hold a per-spec
// estate.
//
// Every catalogue request goes to api.github.com and NOT to our worker, which
// is the design rather than an implementation detail: org content never transits
// anything of ours. A stub pointed anywhere else would be testing a different
// architecture.

// Re-exported so a spec reaches the second marketplace through the module that
// serves it.
export { BIGCO_CANONICAL_REF, BIGCO_CATALOG, BIGCO_REF }

// Every stub returns the Authorization headers it was called with, in order.
// Whether a token was sent — and whether it was sent when the field was left
// empty — is the security half of the contract, so a spec about it needs the
// headers and not only the body.
//
// Recorded inside the handler rather than off `page.on("request")`, because a
// request carrying an Authorization header preflights and Playwright answers
// that preflight itself: counting requests would count the OPTIONS too.
const stubCatalogWith = (
  page: Page,
  answer: (repo: string, request: Request) => Response | Promise<Response>
) => {
  const authorizations: (string | null)[] = []

  stubWith(page, [
    http.get<{ owner: string; repo: string }>(
      CATALOG_URL,
      ({ params, request }) => {
        authorizations.push(request.headers.get("authorization"))
        return answer(`${params.owner}/${params.repo}`, request)
      }
    ),
  ])

  return authorizations
}

/**
 * A marketplace anyone may read, answering with the catalogue it published.
 *
 * Whichever repository is asked for, deliberately: a spec names the marketplace
 * it is about, and GitHub refusing one it has never heard of is what
 * `stubMissingMarketplace` is for.
 */
export const stubMarketplaceCatalog = (page: Page) =>
  stubCatalogWith(page, () => HttpResponse.json(MARKETPLACE_CATALOG))

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
  stubCatalogWith(page, (repo, request) => {
    if (repo === PRIVATE_MARKETPLACE_REF) {
      return carriesMarketplaceToken(request)
        ? HttpResponse.json(MARKETPLACE_CATALOG)
        : githubNotFound()
    }

    return HttpResponse.json(
      repo === BIGCO_REF ? BIGCO_CATALOG : MARKETPLACE_CATALOG
    )
  })

/**
 * A private marketplace: 404 until the token arrives, which is GitHub's own
 * behaviour and the reason a 404 has to offer a token rather than declare the
 * name wrong — an unauthorized caller cannot tell a repository that does not
 * exist from one they may not see.
 */
export const stubPrivateMarketplaceCatalog = (page: Page) =>
  stubCatalogWith(page, (_repo, request) =>
    carriesMarketplaceToken(request)
      ? HttpResponse.json(MARKETPLACE_CATALOG)
      : githubNotFound()
  )

/**
 * A marketplace that does not resolve, for anyone, with any token. The failure
 * path a wrong name reaches.
 */
export const stubMissingMarketplace = (page: Page) =>
  stubCatalogWith(page, githubNotFound)

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
  stubCatalogWith(page, async () => {
    await delay(SLOW_REFUSAL_MS)
    return githubNotFound()
  })

/**
 * A catalogue that is JSON and is not a catalogue. The one failure with no
 * retry in it: the bytes will not improve, so the screen has to name the field
 * that is wrong rather than invite another attempt.
 */
export const stubMalformedCatalog = (page: Page) =>
  stubCatalogWith(page, () => HttpResponse.json(MALFORMED_CATALOG))
