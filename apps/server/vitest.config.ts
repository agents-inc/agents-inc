import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

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
//   - `fetchMock` is gone, and the undici `MockAgent` types remain in the
//     package's `types/cloudflare-test.d.ts` describing an API
//     `cloudflare:test` no longer exports — so the old approach type-checks
//     and fails at import.
//
//     WHAT REPLACED IT IS `msw/node`, WHICH LOADS AND INTERCEPTS IN THIS POOL.
//     This file used to say `vi.stubGlobal("fetch", ...)` was the way, on the
//     belief that msw could not run in workerd; it can. `vitest.setup.ts`
//     starts one server holding no handlers with
//     `onUnhandledRequest: "error"`, and each file installs what it needs with
//     `use()`.
//
//     It works for the same reason the stub did: the `main` worker runs in the
//     isolate the tests run in, so the global msw patches is the one the worker
//     calls — and `SELF.fetch` is a `Fetcher` method rather than that global,
//     so dispatching INTO the worker passes msw by untouched. What runs the
//     claim rather than asserting it is `src/index.test.ts` -> "relays an
//     envelope addressed to this project": the only case in this suite where
//     the outbound call is made by the WORKER and not by the test file, and
//     removing its handler fails it with `[MSW] Cannot bypass a request when
//     using the "error" strategy`.
//
//     `vi.stubGlobal("fetch", ...)` still works, still needs
//     `vi.unstubAllGlobals()` in `afterEach` — `clearMocks: true` from the
//     shared config clears mock CALLS, not stubbed globals — and is down to one
//     use: `serveGitHubUnreachable` in `src/crawl.test.ts`. msw's own way of
//     saying unreachable, `HttpResponse.error()`, leaks an unhandled rejection
//     per call out of `@mswjs/interceptors` here and fails the run whether or
//     not the caller catches the fetch; that comment carries the reproduction.
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
// The D1 schema, read here in Node because the setup file cannot: it runs
// inside the Workers runtime, which has no filesystem. This replaces
// `readD1Migrations` from `@cloudflare/vitest-pool-workers/config`, an entry
// point 0.20 dropped along with `defineWorkersConfig` — the runtime half,
// `applyD1Migrations` from `cloudflare:test`, survived and is what the setup
// file calls.
//
// `--> statement-breakpoint` is drizzle-kit's own separator, and splitting on
// it is required rather than tidy: D1 executes one statement per call, so a
// whole file handed over at once fails on the second CREATE TABLE.
//
// Without this the suite does not fail honestly — every test that reaches the
// database dies with `no such table`, which reads like a broken query rather
// than an unmigrated database.
// Resolved against THIS FILE rather than the process cwd. A relative path
// works for `vitest run` inside the workspace and breaks for anything invoked
// from the repository root — `bun run deps:dead`, the only documented way to
// run knip, throws here and then reports seven live files as unused.
const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations"
)

const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => ({
    name,
    queries: readFileSync(join(MIGRATIONS_DIR, name), "utf8")
      .split("--> statement-breakpoint")
      .map((query) => query.trim())
      .filter(Boolean),
  }))

// The three secrets, held to values that cannot buy anything.
//
// `configPath` above makes the pool read wrangler.jsonc, and reading it pulls
// in `.dev.vars` — that is the "Using secrets defined in .dev.vars" line the
// run prints. So on a developer's machine the suite ran with the REAL Anthropic
// key in `env.ANTHROPIC_API_KEY`, and CI, which has no such file, ran with the
// binding absent. Both were green, which is the problem: a compose test that
// ever missed its mock billed a real call locally and passed in CI, so the bill
// was the only place it would have shown.
//
// `onUnhandledRequest: "error"` now catches that half — a call nothing
// described fails the test instead of leaving the machine — and these bindings
// stay anyway, because a key that cannot buy anything and a call that cannot
// leave are two different guarantees and this one survives the mock being
// bypassed.
//
// Bindings given here win over `.dev.vars` — the line still prints, the values
// no longer reach the worker — so the two environments stop differing.
// Anthropic is never reached.
//
// `BETTER_AUTH_SECRET` is load-bearing rather than filler: it is 32+
// characters because better-auth wants that many, and it is what
// `src/db/seed-session.ts` signs a session cookie with. The worker verifies
// that signature against this same binding, so the two agreeing is what makes
// a seeded session resolve to a person — and every authenticated test 401s if
// they ever stop.
const FAKE_SECRETS = {
  ANTHROPIC_API_KEY: "sk-ant-not-a-real-key",
  BETTER_AUTH_SECRET: "not-a-real-secret-not-a-real-secret-32",
  GITHUB_CLIENT_SECRET: "not-a-real-github-client-secret",
}

export default mergeConfig(nodeConfig, {
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations, ...FAKE_SECRETS },
      },
    }),
  ],
  test: { setupFiles: ["./vitest.setup.ts"] },
})
