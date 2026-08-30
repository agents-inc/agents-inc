import {
  CONFIGS_URL,
  DEAD_LINK_ID,
  STORED_ID,
  STORED_PAYLOAD,
  UNREADABLE_CONFIG_ID,
  storedConfigHandlerFor,
} from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { fetchSeedConfig, SEED_API_URL, SEED_USER_AGENT } from "./fetch-seed";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { useMockWorker } from "../__tests__/helpers/mock-worker.js";

/**
 * The inbound half of the network boundary, held to the same posture as `publish-seed.ts`: every
 * failure is a message rather than a throw, because nothing has been written anywhere and the
 * caller's only job is to explain.
 *
 * The worker is `@workspace/api-mocks`, so the request this really makes — path, method, headers
 * and session policy — is what the assertions read off the wire whether it is built by hand or by
 * a typed client, and the payload it is answered with is the same one `apps/editor`'s suite reads.
 */

/** The route the store serves one configuration on, in the form msw matches a path parameter in. */
const READ_CONFIG_URL = `${CONFIGS_URL}/:id`;

/**
 * The two answers below are the ones `@workspace/api-mocks` does not carry, and neither is a
 * claim about the worker.
 *
 * A dropped connection is not a status at all — the worker never saw the request — and an HTML
 * body under a 200 is an intermediary answering in its place: a proxy, a captive portal, a
 * gateway. Both are what a terminal on somebody else's network really meets, and both are why
 * `fetchSeedConfig` refuses rather than throws.
 */
const readUnreachableHandler = http.get(READ_CONFIG_URL, () => HttpResponse.error());

const gatewayHtmlHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text("<html>gateway</html>"),
);

describe("fetchSeedConfig", () => {
  const worker = useMockWorker();

  it("gets the shared configuration from the store's own path for an id", async () => {
    await fetchSeedConfig(STORED_ID);

    const request = firstElement(worker.requests);
    expect(request.url).toBe(`${CONFIGS_URL}/${STORED_ID}`);
    expect(request.method).toBe("GET");
  });

  it("identifies itself as the CLI rather than a browser", async () => {
    // SERVER-03's whole attribution signal. `GET /configs/:id` is the only place either side can
    // observe a config being installed rather than merely opened in a browser, and this header is
    // the only thing that says which happened.
    await fetchSeedConfig(STORED_ID);

    const { headers } = firstElement(worker.requests);
    expect(headers.get("user-agent")).toBe(SEED_USER_AGENT);
    expect(headers.get("accept")).toBe("application/json");
  });

  it("sends no session credentials, having no cookie jar to send them from", async () => {
    // The editor's client carries the session cookie by default because the browser has one. A
    // terminal does not, and a shared transport that defaulted the CLI into `include` would be
    // claiming a session that cannot exist.
    await fetchSeedConfig(STORED_ID);

    expect(firstElement(worker.requests).credentials).toBe("omit");
  });

  it("escapes an id that would otherwise reshape the path", async () => {
    await fetchSeedConfig("a/b");

    expect(firstElement(worker.requests).url).toBe(`${CONFIGS_URL}/a%2Fb`);
  });

  it("returns the payload the store answered with", async () => {
    const result = await fetchSeedConfig(STORED_ID);

    expect(result).toStrictEqual({ ok: true, payload: STORED_PAYLOAD });
  });

  it("names the id when the store has nothing under it", async () => {
    const result = await fetchSeedConfig(DEAD_LINK_ID);

    expect(result.ok ? "" : result.error).toBe(`No configuration found for id '${DEAD_LINK_ID}'.`);
  });

  it("names the status when the store refuses for any other reason", async () => {
    // The worker's integrity failure: the id is present and its bytes no longer parse, which it
    // answers 500 to rather than 404 or 503. Any non-404 refusal reaches the same arm, and this
    // is the one the store really produces.
    const result = await fetchSeedConfig(UNREADABLE_CONFIG_ID);

    expect(result.ok ? "" : result.error).toBe("Fetching configuration failed (HTTP 500).");
  });

  it("names the store when it cannot be reached at all", async () => {
    configMockServer.use(readUnreachableHandler);

    const result = await fetchSeedConfig(STORED_ID);

    expect(result.ok ? "" : result.error).toContain(SEED_API_URL);
  });

  it("refuses a body that is not JSON rather than throwing", async () => {
    configMockServer.use(gatewayHtmlHandler);

    const result = await fetchSeedConfig(STORED_ID);

    expect(result.ok ? "" : result.error).toBe(
      "The configuration store returned something that is not JSON.",
    );
  });

  it("tells a user to re-share when the stored payload no longer parses", async () => {
    // A body the store served under an id it really holds — which is what a payload minted
    // against another version of the contract looks like from here.
    configMockServer.use(storedConfigHandlerFor(STORED_ID, { v: "not-a-seed" }));

    const result = await fetchSeedConfig(STORED_ID);

    expect(result.ok ? "" : result.error).toContain("re-share the configuration");
  });
});
