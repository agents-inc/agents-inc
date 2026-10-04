import { nodeConfig } from "@workspace/vitest-config/node"
import { defineConfig } from "vitest/config"

// The worker's end-to-end suite: specs whose subject is a process a developer
// runs, such as `bun run dev`, rather than a request. vitest.config.ts runs
// everything inside workerd, which can neither spawn `bun` nor start a second
// worker, so these have nowhere to run there.
//
// The shared settings with the include REPLACED rather than merged.
// `mergeConfig` concatenates arrays, so merging would collect every `src/**`
// spec here too, and each of those imports `cloudflare:test`, which only the
// Workers pool provides.
//
// `test:e2e` rather than a line inside `test`, for the reason turbo.json gives
// `db:generate:check`: every spec here starts a real worker, which takes
// seconds. turbo's `test:e2e` task, which CI already runs for every workspace
// but the CLI, picks it up by that name.
const START_AND_ASK_MS = 120_000

export default defineConfig({
  test: {
    ...nodeConfig.test,
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: START_AND_ASK_MS,
    hookTimeout: START_AND_ASK_MS,
  },
})
