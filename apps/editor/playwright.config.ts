import { defineConfig, devices } from "@playwright/test"

// Own port, never reused, so a run cannot test someone's dev server.
const PORT = Number(process.env.EDITOR_E2E_PORT ?? 5199)
const BASE_URL = `http://localhost:${PORT}`

// Above the 1500px threshold in src/lib/viewport.ts, so specs get the wide
// layout.
const VIEWPORT = { width: 1600, height: 1000 }

const CHROMIUM = { ...devices["Desktop Chrome"], viewport: VIEWPORT }

// Runs from playwright.visual.config.ts, against a production build.
const APPEARANCE_SUITE = "visual.spec.ts"

const AUDIT_SUITE = "a11y.spec.ts"

export default defineConfig({
  testDir: "./e2e/specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
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
      // A project's testIgnore replaces the config-level one.
      testIgnore: [APPEARANCE_SUITE, AUDIT_SUITE],
      use: CHROMIUM,
    },
    // One audit at a time: concurrent axe runs over the grid OOM-kill the
    // renderer.
    {
      name: "a11y",
      testMatch: AUDIT_SUITE,
      workers: 1,
      // axe over the grid is CPU-bound and slows under load.
      timeout: 90_000,
      use: CHROMIUM,
    },
  ],

  webServer: {
    command: `bun run dev --config vite.e2e.config.ts --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
  },
})
