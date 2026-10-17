import path from "path"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { firstPaintBudget } from "./scripts/first-paint-budget"
import { spaFallbackShell } from "./scripts/spa-fallback-shell"
import { parseEnv } from "./src/env.schema"

// One chunk per rate of change. Priorities matter: a group also captures its
// matches' dependencies, so `vendor` must outrank `catalog`; `entriesAware`
// keeps `import()`-only deps lazy. `[\\/]` because module ids use backslashes
// on Windows.
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
  // Above `catalog`, whose test also matches this file; only the lazy preview
  // reads it.
  {
    name: "activation-descriptions",
    test: /packages[\\/]matrix[\\/]src[\\/](vendor[\\/]generated[\\/])?activation-descriptions\./,
    priority: 15,
  },
  {
    name: "catalog",
    test: /packages[\\/]matrix[\\/]/,
    priority: 10,
  },
  // Last: `packages/compile` depends on `packages/matrix`, so ranked higher it
  // would pull the catalogue chunk, and the corpus with it, onto first paint.
  {
    name: "compile",
    test: /packages[\\/]compile[\\/]/,
    priority: 5,
  },
]

export default defineConfig(({ mode }) => {
  // Vite inlines env at build time, so a bad value must fail the build here.
  parseEnv(loadEnv(mode, __dirname, "VITE_"), mode === "production")

  // Maps only when the plugin uploads and then deletes them: all of `dist/` is
  // public.
  const uploadSourceMaps =
    mode === "production" && Boolean(process.env.SENTRY_AUTH_TOKEN)

  return {
    plugins: [
      react(),
      tailwindcss(),
      firstPaintBudget(),
      spaFallbackShell(),
      ...(uploadSourceMaps
        ? [
            sentryVitePlugin({
              // Only set keys: the plugin reads the env itself when an option
              // is absent.
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
              // A failed upload must not stop the deploy.
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
    // Cloudflare does not strip the prefix; must agree with `basepath` in
    // src/routes/router.tsx.
    base: "/editor/",

    build: {
      outDir: "dist/editor",
      sourcemap: uploadSourceMaps ? "hidden" : false,
      // Off to stay under FIRST_PAINT_BUDGET_BYTES; every browser still loads
      // the chunks.
      modulePreload: { polyfill: false },
      rolldownOptions: {
        output: { codeSplitting: { groups: CHUNK_GROUPS } },
      },
    },
    resolve: {
      // Two copies of React break every hook at runtime.
      dedupe: ["react", "react-dom"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
})
