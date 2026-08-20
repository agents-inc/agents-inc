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
// The same release dropped two things the Workers testing docs still lead with,
// and both losses are silent:
//
//   - `isolatedStorage` is gone, so KV STATE LEAKS BETWEEN TESTS IN A FILE. A
//     test that needs a cold binding must clear its own keys in `beforeEach` —
//     see `src/skill-index.test.ts`, which says why it deletes one key rather
//     than reaching for `reset()`.
//   - `fetchMock` is gone. Intercept a Worker's OUTBOUND requests with
//     `vi.stubGlobal("fetch", ...)`, paired with `vi.unstubAllGlobals()` in
//     `afterEach` — `clearMocks: true` from the shared config clears mock
//     CALLS, not stubbed globals. This works because the `main` worker runs in
//     the same isolate as the tests, while `SELF.fetch` is a `Fetcher` method
//     rather than the global, so dispatching INTO the worker still works.
//     The undici `MockAgent` types remain in the package's
//     `types/cloudflare-test.d.ts`, describing an API `cloudflare:test` no
//     longer exports, so the old approach type-checks and fails at import.
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
