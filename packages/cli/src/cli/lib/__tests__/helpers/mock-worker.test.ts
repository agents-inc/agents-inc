import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";

import { useMockWorker } from "./mock-worker.js";

/** yoga-layout, Ink's layout engine, fetches its wasm from a URL shaped like this one. */
const ENCODED_BYTES = "wasm";
const A_DATA_URL = `data:application/octet-stream;base64,${btoa(ENCODED_BYTES)}`;

const UNDESCRIBED_PATH = "/no-handler-describes-this";
const UNHANDLED_REFUSAL = "[MSW] Error: intercepted a request without a matching request handler:";
const REQUEST_ERRORED = '[MSW] Cannot bypass a request when using the "error" strategy';

describe("useMockWorker", () => {
  const { requests } = useMockWorker();

  /** Listening on this machine, so a refusal that let a request out would be answered here. */
  let reachable: Server;
  let reachableOrigin: string;
  const reachedPaths: string[] = [];

  beforeAll(async () => {
    reachable = createServer((request, response) => {
      reachedPaths.push(String(request.url));
      response.end();
    });
    await new Promise<void>((resolve) => reachable.listen(0, "127.0.0.1", resolve));
    // A TCP listener's address() is always an AddressInfo.
    reachableOrigin = `http://127.0.0.1:${(reachable.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => reachable.close(() => resolve()));
  });

  let stderrWrite: MockInstance<typeof process.stderr.write>;

  beforeEach(() => {
    stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrWrite.mockRestore();
  });

  const stderr = () => stderrWrite.mock.calls.map(([chunk]) => String(chunk)).join("");

  it("prints nothing to stderr while Ink's layout engine loads", async () => {
    await import("ink");

    expect(
      requests.map((request) => new URL(request.url).protocol),
      "yoga-layout fetched its wasm in this test rather than before the worker listened",
    ).toContain("data:");
    expect(stderr()).toBe("");
  });

  it("answers a data: URL with the bytes it encodes, as yoga-layout fetches them", async () => {
    const response = await fetch(A_DATA_URL, { credentials: "same-origin" });

    expect(await response.text()).toBe(ENCODED_BYTES);
    expect(stderr()).toBe("");
  });

  it("refuses a route no handler describes before it leaves this process, and says so on stderr", async () => {
    const undescribedRoute = `${reachableOrigin}${UNDESCRIBED_PATH}`;

    await expect(fetch(undescribedRoute)).rejects.toThrow(REQUEST_ERRORED);

    expect(
      reachedPaths,
      "the refused request reached the server it was addressed to",
    ).toStrictEqual([]);
    expect(stderr()).toContain(UNHANDLED_REFUSAL);
    expect(stderr()).toContain(`• GET ${undescribedRoute}`);
  });
});
