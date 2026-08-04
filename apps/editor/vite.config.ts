import path from "path"
import { sentryVitePlugin } from "@sentry/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { parseEnv } from "./src/env.schema"

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
      ...(uploadSourceMaps
        ? [
            sentryVitePlugin({
              org: process.env.SENTRY_ORG,
              project: process.env.SENTRY_PROJECT,
              authToken: process.env.SENTRY_AUTH_TOKEN,
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
    build: { sourcemap: uploadSourceMaps ? "hidden" : false },
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
