import {
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
  WORKER_ORIGIN,
} from "@workspace/api-mocks/fixtures"
import { expect, test as base } from "@playwright/test"

import { ConfigurePage } from "./pages/configure-page"

type Fixtures = {
  // Already navigated and mounted — specs start at the first meaningful action.
  configure: ConfigurePage
}

// Every origin this app talks to that is not this app: the worker, and the two
// GitHub hosts an external skill's directory is read from. The list is the
// same one `e2e/support/` stubs, because it is the same boundary — what
// changes below is what happens to a request NOBODY stubbed.
const THIRD_PARTY_ORIGINS = [
  WORKER_ORIGIN,
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
]

export const test = base.extend<Fixtures>({
  // A test suite's freedom from the network is a property of the suite, not of
  // the tests that remembered. Playwright does not block an un-routed request,
  // so before this fixture existed "forgot a stub" and "deliberately unstubbed"
  // were indistinguishable and the failure mode of forgetting was a PASS: one
  // spec resolved a staged skill against the live `api.github.com` and asserted,
  // in effect, that a third party keeps a directory over 256 KB. It was one
  // upstream commit from breaking, and nothing here would have explained the
  // failure to whoever hit it.
  //
  // Both halves are load-bearing. The abort keeps the bytes out, so a spec
  // cannot quietly pass on real content. The teardown assertion is what makes
  // the omission LEGIBLE — an abort alone reaches the app as some failure or
  // other, and a spec that only asks whether an error appeared is satisfied by
  // the wrong one, which is exactly how this went unseen.
  //
  // These routes are installed at page creation, so they are the OLDEST: a
  // per-spec stub added later takes precedence, and the fallback only ever sees
  // what nobody claimed.
  page: async ({ page }, use) => {
    const unstubbed: string[] = []

    for (const origin of THIRD_PARTY_ORIGINS) {
      await page.route(`${origin}/**`, (route) => {
        unstubbed.push(route.request().url())
        return route.abort("blockedbyclient")
      })
    }

    await use(page)

    expect(
      unstubbed,
      "this spec reached a third party nothing stubbed — stub it in e2e/support/, or the assertion below it is about someone else's server"
    ).toStrictEqual([])
  },

  // Every spec gets its own browser context, so localStorage starts empty and
  // the persisted configuration cannot leak between tests. That is what lets
  // the suite run fully parallel.
  configure: async ({ page }, use) => {
    const configure = new ConfigurePage(page)
    await configure.goto()
    await use(configure)
  },
})

export { expect } from "@playwright/test"
