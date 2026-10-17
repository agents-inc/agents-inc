import { nodeConfig } from "@workspace/vitest-config/node"
import { defineConfig } from "vitest/config"

// Specs that spawn processes, which workerd cannot. The include replaces
// rather than merges: `src/**` specs need the Workers pool.
const START_AND_ASK_MS = 120_000

export default defineConfig({
  test: {
    ...nodeConfig.test,
    include: ["e2e/**/*.e2e.test.ts"],
    testTimeout: START_AND_ASK_MS,
    hookTimeout: START_AND_ASK_MS,
  },
})
