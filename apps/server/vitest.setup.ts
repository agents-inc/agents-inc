import { applyD1Migrations, env } from "cloudflare:test"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll } from "vitest"

// The simulated D1 starts empty, and `wrangler d1 migrations apply --local`
// does not reach it — that writes to `.wrangler/state`, which the pool does not
// share. So the schema is applied here, once per worker, from the array
// `vitest.config.ts` read off disk and handed over as a binding.
await applyD1Migrations(env.DATABASE, env.TEST_MIGRATIONS)

/**
 * Everything the worker reaches OUT to — GitHub, Anthropic, Sentry — and
 * nothing it serves.
 *
 * `msw/node` runs in this pool: it patches the global `fetch`, which is the one
 * the worker itself calls because `main` runs in the isolate the tests run in.
 * `SELF.fetch` is a `Fetcher` method rather than that global, so a request
 * dispatched INTO the worker passes this by untouched — which is what lets one
 * server sit over the whole suite without mocking the subject.
 *
 * Started holding NO handlers, and that is the guarantee rather than an
 * omission: paired with `onUnhandledRequest: "error"`, an outbound call that no
 * test described fails the test that provoked it instead of leaving the
 * machine. `apps/editor/vitest.setup.ts` holds the same line for the same
 * reason.
 *
 * Deliberately not `configMockServer` from `@workspace/api-mocks/node`. That
 * one answers AS this worker, for the suites that call it; this suite runs the
 * real one, so installing it here would mock the subject. What this suite takes
 * from that package is the other half — the origins, the bodies and the payload
 * builder, each imported where it is used.
 */
export const upstreamMock = setupServer()

beforeAll(() => {
  upstreamMock.listen({ onUnhandledRequest: "error" })
})

// One-off answers installed with `use()` last until they are reset, and a
// listener recording what one test saw would otherwise go on recording for the
// next one.
afterEach(() => {
  upstreamMock.resetHandlers()
  upstreamMock.events.removeAllListeners()
})

afterAll(() => {
  upstreamMock.close()
})
