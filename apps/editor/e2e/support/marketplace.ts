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
import { HttpResponse, http } from "msw"

import { stubWith } from "./stub"

import type { Page } from "@playwright/test"
import type { Matrix } from "@workspace/matrix"

// Marketplace `catalog.json` stubs; the handlers come from
// `@workspace/api-mocks`.

export { BIGCO_CANONICAL_REF, BIGCO_CATALOG, BIGCO_REF }

// Each stub returns the Authorization headers it saw. Recorded in the handler:
// Playwright answers the preflight itself, so counting requests would count
// OPTIONS too.
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

/** Answers whichever repository is asked for. */
export const stubMarketplaceCatalog = (page: Page) =>
  stubCatalogWith(page, () => HttpResponse.json(MARKETPLACE_CATALOG))

/** Publishes a catalogue the spec built. */
export const stubMarketplaceCatalogOf = (page: Page, catalog: Matrix) =>
  stubCatalogWith(page, () => HttpResponse.json(catalog))

/** Three marketplaces: two public, one answering only to the token. */
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

/** 404 until the token arrives, as GitHub does for a private repository. */
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

/**
 * Held until the spec releases it, so the form is mounted when the recovery
 * arrives. Returns the release.
 */
export const stubHeldMissingMarketplace = (page: Page) => {
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })

  stubCatalogWith(page, async () => {
    await released
    return githubNotFound()
  })

  return release
}

/** JSON that is not a catalogue. */
export const stubMalformedCatalog = (page: Page) =>
  stubCatalogWith(page, () => HttpResponse.json(MALFORMED_CATALOG))
