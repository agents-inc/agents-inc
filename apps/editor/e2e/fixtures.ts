import { defineNetworkFixture } from "@msw/playwright"
import { authHandlers, composeHandlers } from "@workspace/api-mocks"
import { test as base } from "@playwright/test"

import { ConfigurePage } from "./pages/configure-page"
import { THIRD_PARTY_ORIGINS, servedBy } from "./support/stub"

import type { NetworkFixture } from "@msw/playwright"
import type { UnhandledRequestCallback } from "msw"

type Fixtures = {
  // msw, routing this browser's requests through the shared handlers.
  network: NetworkFixture
  // Already navigated and mounted — specs start at the first meaningful action.
  configure: ConfigurePage
}

// A test suite's freedom from the network is a property of the suite, not of
// the tests that remembered. Playwright does not block an un-routed request, so
// before this existed "forgot a stub" and "deliberately unstubbed" were
// indistinguishable and the failure mode of forgetting was a PASS: one spec
// resolved a staged skill against the live `api.github.com` and asserted, in
// effect, that a third party keeps a directory over 256 KB. It was one upstream
// commit from breaking, and nothing here would have explained the failure to
// whoever hit it.
//
// msw's `error` strategy is the whole guard now, and it replaces both halves of
// the hand-rolled one: the request is never handed on, so no bytes leave, and
// the throw is reported against the test ahead of whatever assertion failed
// downstream. Delete `stubSkillContents(page)` from the "confirming adds the
// skills" spec and the run says
// `GET https://api.github.com/repos/obra/superpowers/git/trees/HEAD?recursive=1`
// by name. What it replaces had to abort the request and then assert in
// TEARDOWN that nothing had been aborted, because an abort alone reaches the
// app as some failure or other and a spec that only asks whether an error
// appeared is satisfied by the wrong one.
//
// It is a callback rather than the bare `"error"` because the app's own origin
// is not a third party: the dev server hands over the document, the modules and
// the icons, and none of that is anybody's mock. msw's own asset exemption
// cannot draw that line — it would exempt `raw.githubusercontent.com/**/SKILL.md`
// and `api.github.com/**/catalog.json` along with the app's own JavaScript.
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

      // Signed out, for every spec that has not said otherwise — the worker
      // answering a browser that holds no cookie, which is exactly what
      // `vitest.setup.ts` installs by default for the same reason.
      //
      // EDITOR-57 made "who is signed in?" part of the baseline page load — the
      // nav rail asks on mount, on every route — so it is no longer something a
      // spec opts into, and EDITOR-54's composer route is signed-in only, so the
      // submit specs need its refusal here too. It is the INITIAL set rather
      // than the first `use()`, so anything a spec adds still wins.
      //
      // Without it the guard above fires on every existing spec at once, which
      // is exactly what happened: a component added in one corner of the app
      // made a request the whole suite then refused, and the failure named the
      // fixture rather than the component. Signed-out is also the honest
      // default — it is the state every one of those specs was written against.
      handlers: [...authHandlers, ...composeHandlers],
      onUnhandledRequest: refuseUnstubbedThirdParty,

      // Every asset exemption this suite could take is a route it MOCKS: a
      // skill's `SKILL.md` off the raw CDN, a marketplace's `catalog.json` off
      // the contents API. Exempting them would send both to the real host.
      skipAssetRequests: false,
    })

    await network.enable()
    await use(network)
    await network.disable()
  },

  // Listed as a dependency rather than requested by a spec, so the interception
  // is installed before anything this page loads — and so `stubWith(page, …)`
  // can find the fixture from the page every helper under e2e/support/ is
  // already handed.
  page: async ({ network, page }, use) => {
    servedBy(page, network)
    await use(page)
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
