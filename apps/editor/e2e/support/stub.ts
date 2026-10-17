import {
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
  WORKER_ORIGIN,
} from "@workspace/api-mocks"

import type { NetworkFixture } from "@msw/playwright"
import type { Page } from "@playwright/test"
import type { RequestHandler } from "msw"

// Routes the browser through the same `@workspace/api-mocks` handlers Vitest
// uses.

/** Origins an unstubbed request is refused for, in `fixtures.ts`. */
export const THIRD_PARTY_ORIGINS = [
  WORKER_ORIGIN,
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
]

// Keyed by page so helpers keep taking the `page` specs already hold.
const networks = new WeakMap<Page, NetworkFixture>()

export const servedBy = (page: Page, network: NetworkFixture) => {
  networks.set(page, network)
}

const networkOf = (page: Page) => {
  const network = networks.get(page)

  if (!network) {
    throw new Error(
      "this page has no network fixture — import `test` from e2e/fixtures.ts rather than from @playwright/test"
    )
  }

  return network
}

/**
 * First match wins, as in `configMockServer.use(...)`. `use()` prepends, so
 * only handlers new to this module's own record go in; the fixture's initial
 * set must never count as installed.
 */
const installed = new WeakMap<Page, RequestHandler[]>()

export const stubWith = (page: Page, handlers: RequestHandler[]) => {
  const network = networkOf(page)
  const known = installed.get(page) ?? []
  const fresh = handlers.filter((handler) => !known.includes(handler))

  installed.set(page, [...fresh, ...known])
  network.use(...fresh)
}
