import { defineConfig, devices } from "@playwright/test"

const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`

// The editor is a desktop-only screen with a hard 1324px `min-width`;
// below it the page scrolls horizontally rather than reflowing. Anything
// narrower would be testing a layout that is explicitly not designed yet, so
// the viewport is fixed above that floor for every project.
const VIEWPORT = { width: 1600, height: 1000 }

const CHROMIUM = { ...devices["Desktop Chrome"], viewport: VIEWPORT }

// The appearance suite is not collected here. It runs against a production
// build rather than this config's dev server, which is not a preference:
// one-shot captures are not survivable on the dev server, and the reasoning
// and the measurement are in playwright.visual.config.ts.
const APPEARANCE_SUITE = "visual.spec.ts"

// Collected by its own project below rather than alongside everything else.
const AUDIT_SUITE = "a11y.spec.ts"

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: true,
  // A committed `test.only` should fail the pipeline, not silently skip the suite.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Absent locally rather than undefined, which is how Playwright is asked for
  // its own default (half the cores) — CI pins it instead, where two runners'
  // worth of parallelism is what the machine has.
  ...(process.env.CI ? { workers: 2 } : {}),
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      // Both exclusions have to be named here. A project's `testIgnore`
      // REPLACES the config-level one rather than extending it — `takeFirst`
      // in playwright/lib/common/config.js — so a config-level entry would
      // stop applying to this project the moment it declared one of its own.
      testIgnore: [APPEARANCE_SUITE, AUDIT_SUITE],
      use: CHROMIUM,
    },
    // The audits, one at a time. `analyze()` runs axe inside the page, and axe
    // builds its own tree of every node it finds there — over this screen's
    // grid, the largest thing the app draws. An audit per worker therefore
    // holds several of the suite's heaviest pages in memory at once, and enough
    // of those together exhaust the machine: the kernel OOM-kills a renderer
    // (`task=headless_shell` in `dmesg`) and the spec sees `page.evaluate:
    // Target crashed` on whichever audit was unlucky, which is why it landed
    // somewhere different every time. REPO-38. Reproduce by deleting the cap
    // below and running the file over itself:
    //
    //   for i in 1 2 3; do bunx playwright test a11y.spec.ts & done; wait
    //
    // `workers` caps this project alone — the global limit still governs the
    // total, and the rest of the suite keeps the pool. A CAP IS THE POINT: it
    // changes how many audits run together and nothing else, so a renderer that
    // dies for a real reason still fails its test exactly as it did. Retrying
    // the crash, or teaching the audit to tolerate one, would have bought the
    // same green by hiding the thing worth seeing.
    {
      name: "a11y",
      testMatch: AUDIT_SUITE,
      workers: 1,
      use: CHROMIUM,
    },
  ],

  webServer: {
    command: `bun run dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
})
