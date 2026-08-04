import { test as base } from "@playwright/test"

import { ConfigurePage } from "./pages/configure-page"

type Fixtures = {
  // Already navigated and mounted — specs start at the first meaningful action.
  configure: ConfigurePage
}

// Every spec gets its own browser context, so localStorage starts empty and the
// persisted configuration cannot leak between tests. That is what lets the
// suite run fully parallel.
export const test = base.extend<Fixtures>({
  configure: async ({ page }, use) => {
    const configure = new ConfigurePage(page)
    await configure.goto()
    await use(configure)
  },
})

export { expect } from "@playwright/test"
