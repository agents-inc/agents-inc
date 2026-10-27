import { configMockServer } from "@workspace/api-mocks/node";
import { http, passthrough } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

// Handlers anchor on WORKER_ORIGIN; vitest.setup.ts points AGENTS_INC_API_URL there before
// imports, so setting it from a spec is too late. Not in helpers/index.ts: keeps msw/node out of
// every other module graph.

export type MockWorkerLog = {
  /** Clones in arrival order (body readable once); includes unmatched requests. */
  readonly requests: readonly Request[];
};

/** yoga-layout, Ink's layout engine, fetches its wasm from a data: URL, which answers itself. */
const dataUrlsAnswerThemselves = http.get(
  ({ request }) => request.url.startsWith("data:"),
  () => passthrough(),
);

/** `resetHandlers()` drops every handler `use()` added, this one included. */
function startFromTheDescribedRoutes(): void {
  configMockServer.resetHandlers();
  configMockServer.use(dataUrlsAnswerThemselves);
}

/** Unhandled requests error, so a route the handlers don't describe fails its test. */
export function useMockWorker(): MockWorkerLog {
  const requests: Request[] = [];

  beforeAll(() => {
    configMockServer.listen({ onUnhandledRequest: "error" });
    startFromTheDescribedRoutes();
    configMockServer.events.on("request:start", ({ request }) => {
      requests.push(request.clone());
    });
  });

  beforeEach(() => {
    requests.length = 0;
  });

  afterEach(() => {
    startFromTheDescribedRoutes();
  });

  afterAll(() => {
    configMockServer.close();
  });

  return { requests };
}
