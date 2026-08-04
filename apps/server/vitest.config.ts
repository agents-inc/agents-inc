import { createRequire } from "node:module"

import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config"

// Vitest's own `vitest:resolve-core` plugin deliberately resolves every bare
// `@vitest/*` specifier from the project root rather than from the importer,
// and the Workers pool pushes its whole runtime through that resolver because
// the isolate asks the module fallback service for each module by name. Since
// the monorepo root hoists Vitest 4 (packages/cli depends on it) while this
// app pins Vitest 3, resolving from the root hands the v3 runner v4 internals
// and the isolate dies on `getSafeTimers`. Resolve those specifiers from the
// Vitest that is actually running here instead, which keeps the deliberate
// 3-vs-4 split working without touching what any other workspace installs.
const VITEST_INTERNALS =
  /^@vitest\/(expect|mocker|pretty-format|runner|snapshot|spy|utils)(\/.*)?$/

const requireFromConfig = createRequire(import.meta.url)
const requireFromLocalVitest = createRequire(
  requireFromConfig.resolve("vitest/package.json")
)

function resolveAlongsideLocalVitest(id: string): string {
  return requireFromLocalVitest.resolve(id)
}

// Tests run inside the actual Workers runtime with a simulated KV binding, so
// what passes here is what runs at the edge — no mocked platform.
export default defineWorkersConfig({
  resolve: {
    alias: [
      {
        find: VITEST_INTERNALS,
        replacement: "$&",
        customResolver: resolveAlongsideLocalVitest,
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
    clearMocks: true,
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
      },
    },
  },
})
