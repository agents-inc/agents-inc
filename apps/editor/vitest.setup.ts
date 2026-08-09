import { configMockServer } from "@workspace/api-mocks/node"
import { afterAll, afterEach, beforeAll } from "vitest"

// The editor's unit suite never reaches the network. The only service it has to
// talk to is the config-sharing worker, and `@workspace/api-mocks` is the one
// mock of it — the same one the Playwright specs take their payloads from.
//
// `onUnhandledRequest: "error"` is what makes that a guarantee rather than a
// habit: a request to anything not mocked here fails the test that made it,
// instead of quietly leaving the machine.
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
