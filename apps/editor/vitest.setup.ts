import { configMockServer } from "@workspace/api-mocks/node"
import { afterAll, afterEach, beforeAll } from "vitest"

// Unmocked requests fail the test. The default handlers are the signed-out
// worker.
beforeAll(() => {
  configMockServer.listen({ onUnhandledRequest: "error" })
})

afterEach(() => {
  configMockServer.resetHandlers()
})

afterAll(() => {
  configMockServer.close()
})
