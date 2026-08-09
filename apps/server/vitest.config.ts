import { cloudflareTest } from "@cloudflare/vitest-pool-workers"
import { nodeConfig } from "@workspace/vitest-config/node"
import { mergeConfig } from "vitest/config"

// Tests run inside the actual Workers runtime with a simulated KV binding, so
// what passes here is what runs at the edge — no mocked platform.
//
// The runtime is wired in as a Vite plugin rather than through
// `test.poolOptions.workers`. @cloudflare/vitest-pool-workers 0.20 dropped its
// `/config` entry point along with `defineWorkersConfig`, and `cloudflareTest`
// takes exactly what `poolOptions.workers` used to hold. The package ships a
// codemod for the move: `./codemods/vitest-v3-to-v4`.
//
// Everything under `test` comes from the shared config. The include,
// `globals: false` and `clearMocks: true` were restated here by hand until
// 2026-08-07, which is the drift the third axis of `deps:check` exists to
// catch. Its `environment: "node"` reads like a contradiction of the line
// above and is not one: the pool never goes through Vitest's environment
// mechanism, and its own `parseProjectOptions` accepts exactly `undefined` or
// `"node"` and throws a TypeError on anything else. The runtime is the
// plugin's whatever this says — and "node" is the only thing the shared config
// could say here without failing the run outright.
export default mergeConfig(nodeConfig, {
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
})
