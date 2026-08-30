import { configMockServer } from "@workspace/api-mocks/node"
import { afterAll, afterEach, beforeAll } from "vitest"

// The editor's unit suite never reaches the network. `@workspace/api-mocks` is
// the one mock of everything it would otherwise reach — the same one the
// Playwright specs take their payloads from.
//
// `onUnhandledRequest: "error"` is what makes that a guarantee rather than a
// habit: a request to anything not mocked here fails the test that made it,
// instead of quietly leaving the machine.
//
// What is installed by default is the worker answering a browser that holds no
// cookie: no session, and a refusal from every route behind `authenticated`.
// That is the state every first visit is in and the one the app is fully usable
// in, so it is what a test gets without asking. The signed-in worker is opted
// into per test with `configMockServer.use(...signedInHandlers)`.
beforeAll(() => {
  configMockServer.listen({ onUnhandledRequest: "error" })
})

// One-off answers installed with `use()` last until they are reset, so this is
// what keeps a test that provokes a failure from provoking it for the next one.
afterEach(() => {
  configMockServer.resetHandlers()
})

afterAll(() => {
  configMockServer.close()
})
