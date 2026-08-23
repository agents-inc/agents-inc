import path from "path"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { firstPaintBudget } from "./scripts/first-paint-budget"
import { parseEnv } from "./src/env.schema"

// One chunk per rate of change, so a deploy invalidates only what changed. The
// whole app used to be a single 1.03 MB file — 302 KB gzipped — which meant a
// one-line copy edit re-hashed React, the catalogue and every brand icon along
// with it, and every returning visitor downloaded all of them again. Split, the
// app's own code is 29 KB and an ordinary deploy leaves the other six alone. A
// cold first paint pays 0.6 KB for the arrangement: 310.9 KB gzipped before
// against 311.5 KB after, both measured 2026-08-21 UNDER NODE. The runtime is
// part of the figure rather than a footnote to it: Node's and Bun's zlib
// disagree by about 2% on the same bytes, and the same build reads 304.4 KB
// under Bun, so a gzipped size here is comparable only to another taken under
// the same runtime. `FIRST_PAINT_BUDGET_BYTES` in
// ./scripts/first-paint-budget.ts records that fact for the budget it guards.
//
// THE PRIORITIES ARE LOAD-BEARING, and not for the reason the order suggests. A
// group captures its matches' dependencies as well as its matches, so unless
// `vendor` outranks `catalog` the catalogue's chunk swallows zod — 18 KB of a
// library that has not changed, re-downloaded every time the marketplace is
// regenerated.
//
// SO IS `entriesAware` ON THE CATCH-ALL. Without it a `test: /node_modules/`
// group collects a dependency reached only through `import()` — posthog-js is
// the one here — and hoists it into the static graph, which put 74 KB back on
// the first-paint path while reading as a tidier list of chunks. With it,
// modules are grouped by which entry actually reaches them, so the lazy half
// stays lazy.
//
// `[\\/]` rather than `/` in every test: these match absolute module ids, which
// use backslashes on Windows.
const CHUNK_GROUPS = [
  {
    name: "react",
    test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/,
    priority: 60,
  },
  {
    name: "icons",
    test: /node_modules[\\/]simple-icons[\\/]/,
    priority: 55,
  },
  {
    name: "observability",
    test: /node_modules[\\/]@sentry[\\/]/,
    priority: 50,
  },
  {
    name: "vendor",
    test: /node_modules[\\/]/,
    priority: 40,
    entriesAware: true,
  },
  // Last, so the four above have already claimed anything of theirs it depends
  // on: what is left is the generated catalogue itself, which changes when the
  // marketplace does rather than when this app does.
  {
    name: "catalog",
    test: /packages[\\/]matrix[\\/]/,
    priority: 10,
  },
]

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Vite inlines env at build time, so an unset variable is not a startup
  // error — it is a bundle that silently points somewhere wrong. Parsing here,
  // in Node before anything is emitted, turns that into a failed build.
  parseEnv(loadEnv(mode, __dirname, "VITE_"), mode === "production")

  // Source maps and their upload are one decision, not two. Everything under
  // `dist/` is served publicly by the assets Worker, so a `.map` left behind
  // publishes the whole source — and `hidden` only drops the reference
  // comment, it still writes the file. Generating them *only* when the plugin
  // is there to upload and then delete them means there is no arrangement in
  // which a map survives into the deployment.
  const uploadSourceMaps =
    mode === "production" && Boolean(process.env.SENTRY_AUTH_TOKEN)

  return {
    plugins: [
      react(),
      tailwindcss(),
      firstPaintBudget(),
      ...(uploadSourceMaps
        ? [
            sentryVitePlugin({
              // Each key is passed only when it is set. The plugin reads the
              // same three variables itself when an option is absent, so an
              // unset one has to stay absent rather than arrive as undefined.
              ...(process.env.SENTRY_ORG !== undefined && {
                org: process.env.SENTRY_ORG,
              }),
              ...(process.env.SENTRY_PROJECT !== undefined && {
                project: process.env.SENTRY_PROJECT,
              }),
              ...(process.env.SENTRY_AUTH_TOKEN !== undefined && {
                authToken: process.env.SENTRY_AUTH_TOKEN,
              }),
              sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
              // A rejected upload — wrong token scope, Sentry unreachable —
              // must not stop the site shipping. The deploy is the important
              // half; readable stack traces are the nice half. It stays loud
              // in the CI log rather than failing the run.
              errorHandler: (error) => {
                console.warn(
                  "[sentry] source map upload failed — deploying without them\n",
                  error
                )
              },
            }),
          ]
        : []),
    ],
    build: {
      sourcemap: uploadSourceMaps ? "hidden" : false,
      rolldownOptions: {
        output: { codeSplitting: { groups: CHUNK_GROUPS } },
      },
    },
    resolve: {
      // The repository root holds react 18, because the CLI depends on ink and
      // won the hoist slot; apps/editor and packages/ui each got their own nested
      // react 19. Anything else hoisted to the root — @base-ui/react is the one
      // that matters here — resolves `react` upwards and lands on 18, so a
      // production build genuinely shipped both copies. Two Reacts means two
      // hook dispatchers, and every Base UI component would have thrown
      // "Invalid hook call" at runtime with nothing failing at build time.
      // Deduping pins the whole graph to this app's copy. react-dom is listed
      // for the same reason even though it happens to resolve correctly today:
      // the two have to come from the same copy or React breaks anyway.
      dedupe: ["react", "react-dom"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
