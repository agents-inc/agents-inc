import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

// Tests run inside the actual Workers runtime with a simulated KV binding, so
// what passes here is what runs at the edge — no mocked platform.
//
// The runtime is wired in as a Vite plugin rather than through
// `test.poolOptions.workers`. @cloudflare/vitest-pool-workers 0.20 dropped its
// `/config` entry point along with `defineWorkersConfig`, and `cloudflareTest`
// takes exactly what `poolOptions.workers` used to hold. The package ships a
// codemod for the move: `./codemods/vitest-v3-to-v4`.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    include: ["src/**/*.test.ts"],
    globals: false,
    clearMocks: true,
  },
})
