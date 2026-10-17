import { createArgosReporterOptions } from "@argos-ci/playwright/reporter"
import { defineConfig, devices } from "@playwright/test"

// Separate from playwright.config.ts: captures run against a production build,
// because the dev server navigates the page under one-shot screenshots.
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`

const VIEWPORT = { width: 1600, height: 1000 }

// `--mode test` points the bundle at the stub worker; its own outDir leaves
// `dist/` alone.
const BUILD = "bunx vite build --mode test --outDir dist-test/editor"
const SERVE = `bunx vite preview --outDir dist-test/editor --port ${PORT} --strictPort`

export default defineConfig({
  testDir: "./e2e/specs",
  testMatch: "visual.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  ...(process.env.CI ? { workers: 2 } : {}),

  reporter: [
    process.env.CI ? ["github" as const] : ["list" as const],
    [
      "@argos-ci/playwright/reporter",
      createArgosReporterOptions({ uploadToArgos: !!process.env.CI }),
    ],
  ],

  use: {
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: VIEWPORT,
        // Deterministic text rendering across machines.
        launchOptions: {
          args: ["--disable-lcd-text", "--font-render-hinting=none"],
        },
      },
    },
  ],

  webServer: {
    command: `${BUILD} && ${SERVE}`,
    url: BASE_URL,
    // A leftover preview server would be serving an old build.
    reuseExistingServer: false,
    // Includes the cold build.
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
