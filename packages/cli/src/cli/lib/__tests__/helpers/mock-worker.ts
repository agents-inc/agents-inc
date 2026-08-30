import { configMockServer } from "@workspace/api-mocks/node";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

/**
 * The config store's answers, taken from `@workspace/api-mocks` rather than written here.
 *
 * Every file that answered this store used to stub `globalThis.fetch` with a `vi.fn()` and
 * hand-build the `Response` it was to answer with, which made each of them a second description
 * of one worker — free to disagree with `apps/server` and with each other, and they did.
 * `share.test.ts` and `edit-ui.test.ts` carried byte-identical `stubStore`/`mintedResponse`
 * pairs; `init-from-plugin-install.test.ts` and `init-unbacked-plugin-refusal.test.ts` carried a
 * byte-identical `stubSeedFetch`; and `edit-from.test.ts` wrote the 404 body as `"no config"`
 * where the worker answers `"No config under this id"`. Nothing could see any of it, because a
 * stub answers whatever it was handed without judging it.
 *
 * `msw/node` patches the process rather than a global, so what the command under test really
 * sends — method, path, headers, credentials and body — is what these handlers match on, and the
 * request log below is the request itself rather than a record of what a spy was called with.
 *
 * The one thing to know before using it: `@workspace/api-mocks` anchors every handler on
 * `WORKER_ORIGIN`, and `SEED_API_URL` is read from `AGENTS_INC_API_URL` once at module load. The
 * two are made to agree in `vitest.setup.ts`, which runs before a test file's imports; setting
 * the variable from inside a spec is too late and would reach production.
 *
 * Deliberately absent from `helpers/index.ts`, unlike `silenceConsole` beside it: that barrel is
 * imported by most of this suite, and re-exporting from here would pull `msw/node` into every one
 * of those module graphs to serve the handful of files that mock a network.
 */

/** What the mock saw, for the assertions a stub's `mock.calls` used to carry. */
export type MockWorkerLog = {
  /**
   * Every request the mock received during the current test, in arrival order.
   *
   * Each is a clone, so a spec may read its body — once. Requests to an origin no handler
   * claims are recorded too: `request:start` fires before matching, which is what lets
   * "nothing was posted" be asserted against the whole of what left the process.
   */
  readonly requests: readonly Request[];
};

/**
 * Installs the shared worker mock for this file and records what reached it.
 *
 * Call once at the top of a describe block, beside `silenceConsole()`. `onUnhandledRequest` is
 * `"error"` so a request to a route these handlers do not describe fails the test that made it
 * rather than quietly leaving the machine — which is the whole difference between a suite that
 * mocks the network and one that happens not to use it.
 *
 * A spec that needs a one-off answer installs it with `configMockServer.use(...)` and gets it
 * withdrawn by the `afterEach` below, exactly as `apps/editor`'s suite does.
 */
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
