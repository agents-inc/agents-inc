import { defineNetworkFixture } from "@msw/playwright"
import { authHandlers, composeHandlers } from "@workspace/api-mocks"
import { test as base } from "@playwright/test"

import { ConfigurePage } from "./pages/configure-page"
import { THIRD_PARTY_ORIGINS, servedBy } from "./support/stub"

import type { NetworkFixture } from "@msw/playwright"
import type { UnhandledRequestCallback } from "msw"

type Fixtures = {
  network: NetworkFixture
  // Already navigated and mounted — specs start at the first meaningful action.
  configure: ConfigurePage
}

// Fails any unstubbed request to a third-party origin, naming it. A callback
// rather than `"error"` because the app's own origin is not a mock.
const refuseUnstubbedThirdParty: UnhandledRequestCallback = (
  request,
  print
) => {
  if (THIRD_PARTY_ORIGINS.includes(new URL(request.url).origin)) print.error()
}

export const test = base.extend<Fixtures>({
  network: async ({ context }, use) => {
    const network = defineNetworkFixture({
      context,

      // Signed out by default: the nav rail asks for the session on every page.
      // Initial, so a spec's `use()` wins.
      handlers: [...authHandlers, ...composeHandlers],
      onUnhandledRequest: refuseUnstubbedThirdParty,

      // Every asset this suite could exempt is a route it mocks.
      skipAssetRequests: false,
    })

    await network.enable()
    await use(network)
    await network.disable()
  },

  // A dependency, so interception is installed before the page loads anything.
  page: async ({ network, page }, use) => {
    servedBy(page, network)
    await use(page)
  },

  // A fresh context per test, so localStorage cannot leak between tests.
  configure: async ({ page }, use) => {
    const configure = new ConfigurePage(page)
    await configure.goto()
    await use(configure)
  },
})

export { expect } from "@playwright/test"
