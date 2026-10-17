import { applyD1Migrations, env } from "cloudflare:test"
import { setupServer } from "msw/node"
import { afterAll, afterEach, beforeAll } from "vitest"

// The pool's D1 starts empty and `--local` migrations do not reach it.
await applyD1Migrations(env.DATABASE, env.TEST_MIGRATIONS)

/**
 * Outbound calls only (GitHub, Anthropic, Sentry). It patches the global
 * `fetch` the worker calls; `SELF.fetch` bypasses it, so the subject is not
 * mocked. No handlers plus `onUnhandledRequest: "error"` fails any call no
 * test described.
 */
export const upstreamMock = setupServer()

beforeAll(() => {
  upstreamMock.listen({ onUnhandledRequest: "error" })
})

afterEach(() => {
  upstreamMock.resetHandlers()
  upstreamMock.events.removeAllListeners()
})

afterAll(() => {
  upstreamMock.close()
})
