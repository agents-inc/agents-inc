import { defineConfig, devices } from "@playwright/test"

const PORT = 5173
const BASE_URL = `http://localhost:${PORT}`

// The editor is a desktop-only screen with a hard 1324px `min-width`;
// below it the page scrolls horizontally rather than reflowing. Anything
// narrower would be testing a layout that is explicitly not designed yet, so
// the viewport is fixed above that floor for every project.
const VIEWPORT = { width: 1600, height: 1000 }

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
      use: { ...devices["Desktop Chrome"], viewport: VIEWPORT },
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
