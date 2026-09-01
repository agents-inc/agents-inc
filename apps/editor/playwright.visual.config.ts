import { createArgosReporterOptions } from "@argos-ci/playwright/reporter"
import { defineConfig, devices } from "@playwright/test"

// The appearance suite. A second config rather than a project inside
// playwright.config.ts, because the two suites disagree about what they run
// against — and that disagreement is the entire reason this file exists.
//
// THE BEHAVIOURAL SUITE RUNS AGAINST THE DEV SERVER. THIS ONE CANNOT.
// Measured on 2026-08-28 rather than assumed: against `vite dev`, eleven of
// twelve captures failed, every one of them with the page navigating out from
// under the screenshot — "Execution context was destroyed", "Frame is
// currently attempting a navigation", and Argos's own injected `window.__ARGOS__`
// gone by the time it was read back. Against a production build served
// statically, the same twelve passed with no navigation events at all. Two
// hypotheses were built and discarded on the way: Vite's dependency optimizer
// re-bundling the `import()`-only deps (shiki, liquidjs), and the HMR client —
// `optimizeDeps.include` for all six changed nothing, and so did `hmr: false`.
// What survives is the plain statement: the dev server moves the page under a
// one-shot operation, an auto-retrying `expect` never notices, and
// `page.screenshot` has no retry to hide it with.
//
// So this is the better test anyway. A visual baseline of the dev server is a
// baseline of something no visitor ever loads — different chunking, unminified
// CSS, an HMR client in the page. What is diffed here is the artefact that
// deploys.
const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`

// The same floor the behavioural suite pins, and for the same reason: the
// editor is desktop-only below 1324px. Restated rather than imported, because
// a shared constant across two configs is a coupling that would silently move
// every baseline the day the other suite retuned its viewport.
//
// It is the only capture dimension pinned HERE. The other one is the theme,
// and it is pinned per capture in e2e/specs/visual.spec.ts instead: the app has
// no theme switch, so the second palette is a `page.emulateMedia` on the same
// page rather than a second project — which is also what keeps two projects
// from handing Argos two screenshots under one name. That file carries the
// reasoning, including why every state is captured in both.
const VIEWPORT = { width: 1600, height: 1000 }

// `--mode test` is what points the built bundle at the stub worker. The e2e
// fixtures route `http://localhost:8787`, and `.env.production` would bake in
// `https://api.agentsinc.sh` — an origin no stub claims, which the fixture's
// third-party guard cannot see either, since it only watches the three origins
// it knows. The captures would then be of whatever the live API returned.
//
// A separate `dist-test/` so a visual run never overwrites the directory
// `bun run deploy` uploads.
// `dist-test/editor`, mirroring production's `dist/editor`, so the captures are
// taken against the same directory layout the Worker serves rather than a
// flattened one — and so scripts/spa-fallback-shell.ts writes its copy to
// `dist-test/index.html` instead of the workspace root.
const BUILD = "bunx vite build --mode test --outDir dist-test/editor"
const SERVE = `bunx vite preview --outDir dist-test/editor --port ${PORT} --strictPort`

export default defineConfig({
  testDir: "./e2e/specs",
  testMatch: "visual.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries. A retried screenshot is a second answer to a question that is
  // supposed to have one, and a capture that only passes on the second attempt
  // is a finding rather than a flake to paper over.
  retries: 0,
  ...(process.env.CI ? { workers: 2 } : {}),

  // Argos collects rather than prints, so a human-readable reporter sits
  // beside it. `uploadToArgos` is CI-only: a local run still captures every
  // screenshot — which is the point, because a capture nobody can look at
  // before pushing is not much of a review — and simply sends them nowhere.
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
        // Two flags about DIFFS rather than about how the app looks. Subpixel
        // antialiasing and font hinting are resolved by the machine doing the
        // rendering, so the same glyph lands on different pixels on a laptop
        // and on ubuntu-latest — which would report every text-bearing capture
        // as changed the first time a locally-taken baseline met a CI run.
        // Off, the render is deterministic across machines. It costs slightly
        // softer text in the screenshots and changes nothing about what ships.
        launchOptions: {
          args: ["--disable-lcd-text", "--font-render-hinting=none"],
        },
      },
    },
  ],

  webServer: {
    command: `${BUILD} && ${SERVE}`,
    url: BASE_URL,
    // Never reused, unlike the dev server the other config starts. A preview
    // server left running from an earlier session is serving an earlier build,
    // and a baseline taken against stale bytes is worse than no baseline: it
    // passes.
    reuseExistingServer: false,
    // The build is part of the command, so the wait covers a cold compile.
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
})
