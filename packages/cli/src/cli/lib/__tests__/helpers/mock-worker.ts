import { configMockServer } from "@workspace/api-mocks/node";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

// Handlers anchor on WORKER_ORIGIN; vitest.setup.ts points AGENTS_INC_API_URL there before
// imports, so setting it from a spec is too late. Not in helpers/index.ts: keeps msw/node out of
// every other module graph.

export type MockWorkerLog = {
  /** Clones in arrival order (body readable once); includes unmatched requests. */
  readonly requests: readonly Request[];
};

/** Unhandled requests error, so a route the handlers don't describe fails its test. */
export function useMockWorker(): MockWorkerLog {
  const requests: Request[] = [];

  beforeAll(() => {
    configMockServer.listen({ onUnhandledRequest: "error" });
    configMockServer.events.on("request:start", ({ request }) => {
      requests.push(request.clone());
    });
  });

  beforeEach(() => {
    requests.length = 0;
  });

  afterEach(() => {
    configMockServer.resetHandlers();
  });

  afterAll(() => {
    configMockServer.close();
  });

  return { requests };
}
