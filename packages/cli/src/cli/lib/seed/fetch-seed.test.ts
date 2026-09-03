import {
  CONFIGS_URL,
  DEAD_LINK_ID,
  NO_CONFIG_BODY,
  STORED_ID,
  STORED_PAYLOAD,
  UNREADABLE_CONFIG_BODY,
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

/**
 * The read route's third refusal, and the one `@workspace/api-mocks` has no handler for:
 * `configRefusedHandlerFor` there answers the MINT, so nothing in that package refuses a READ with
 * a 503.
 *
 * The body is the worker's own — `getConfig` writes `c.text("Could not read this config", 503)`
 * when the KV read throws — mirrored here because that package holds no constant for it. It is the
 * store's words either way, so nothing quoted in this file is the CLI's own rendering.
 */
const READ_REFUSED = 503;
const READ_REFUSED_BODY = "Could not read this config";

const readRefusedHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text(READ_REFUSED_BODY, { status: READ_REFUSED }),
);

/**
 * The content type the deployed worker really announces its own sentences under, mirrored rather
 * than imported for the reason `READ_REFUSED_BODY` above is: it belongs to hono and `apps/server`.
 *
 * `c.text(...)` writes hono's `TEXT_PLAIN`, which carries a charset parameter. `HttpResponse.text`
 * announces a bare `text/plain` and every other handler in this file takes that default, so
 * without this one fixture nothing here answers in the shape the wire actually carries — and a
 * content-type gate written as EQUALITY rather than as a prefix passes every spec in the file
 * while dropping, against the real worker, every refusal this route can explain.
 *
 * The write side carries the same fixture for the same reason; see `publish-seed.test.ts`.
 */
const HONO_TEXT_PLAIN = "text/plain; charset=UTF-8";

const readRefusedOnTheWireHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text(READ_REFUSED_BODY, {
    status: READ_REFUSED,
    headers: { "content-type": HONO_TEXT_PLAIN },
  }),
);

/**
 * The same refusal with an erase-line and a carriage return inside it — the shape the CLI-855
 * lane watched a real terminal obey on the write route. This route quotes its bodies by the same
 * rule, so it is reachable here too, and by the same party: whatever is answering for the store.
 */
const FORGED_READ_REFUSAL = "Could not read\u001B[2Kthis\r \u203A   STORE COMPROMISED config";

/** The same words with the terminal's ability to act on them removed, and none of them dropped. */
const FORGED_READ_REFUSAL_INERT = "Could not readthis \u203A   STORE COMPROMISED config";

const forgedReadRefusalHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text(FORGED_READ_REFUSAL, { status: READ_REFUSED }),
);

/**
 * A refusal that never reached the worker at all — a proxy, a WAF or a gateway answering in its
 * place, in the content type such a thing answers in.
 *
 * Markup is not an explanation, and a store that has been replaced by one must not get to paint a
 * terminal with it. This is the read side's version of `notJsonRefusalHandler` in
 * `publish-seed.test.ts`: there the envelope's SHAPE is what a foreign body fails to be, and here
 * there is no shape to fail, so the wire's own statement of what it sent is the discriminator.
 */
const BAD_GATEWAY = 502;
const BLOCKED_BY_PROXY = "<html><head><title>Request blocked</title></head></html>";

const proxyRefusalHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.html(BLOCKED_BY_PROXY, { status: BAD_GATEWAY }),
);

/** Where a hostile explanation starts, so a bounded quote can be shown to have kept the front. */
const HOSTILE_OPENING = "This explanation begins here and then runs on";

/** Where it ends, tens of kilobytes later, and what must never reach the terminal. */
const HOSTILE_TAIL = "and here is the end of it";

const hostileRefusalHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text(`${HOSTILE_OPENING} ${"x".repeat(100_000)} ${HOSTILE_TAIL}`, {
    status: READ_REFUSED,
  }),
);

/** A refusal that answers the right content type and then says nothing in it. */
const silentRefusalHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text("   ", { status: READ_REFUSED }),
);

/**
 * What "not dumped into a terminal" means here, held apart from whatever budget the module picks.
 * A quote that outgrew a kilobyte would have stopped being a quote.
 */
const A_TERMINAL_CAN_TAKE = 1000;

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

  it("names the id when the store has nothing under it, rather than quoting a body that cannot", async () => {
    const result = await fetchSeedConfig(DEAD_LINK_ID);

    const error = result.ok ? "" : result.error;
    expect(error).toBe(`No configuration found for id '${DEAD_LINK_ID}'.`);
    // The one refusal on this route whose body is worth LESS than the CLI's own sentence: the
    // store answers `No config under this id`, which does not name the id the user typed. This
    // assertion is the control for the two below — without a status whose body is deliberately
    // dropped, "quotes the store" cannot be told from "quotes whatever arrives".
    expect(error).not.toContain(NO_CONFIG_BODY);
  });

  it("quotes the store's own account of an integrity failure, beside the status", async () => {
    // The worker's integrity failure: the id is present and its bytes no longer parse, which it
    // answers 500 to rather than 404 or 503. It is the refusal the store really produces here,
    // and its body is the only thing that separates it from a store that is simply down.
    const result = await fetchSeedConfig(UNREADABLE_CONFIG_ID);

    expect(result.ok ? "" : result.error).toBe(
      `Fetching configuration failed (HTTP 500). The store said: ${UNREADABLE_CONFIG_BODY}`,
    );
  });

  it("quotes it for a store that refused the read as well", async () => {
    configMockServer.use(readRefusedHandler);

    const result = await fetchSeedConfig(STORED_ID);

    expect(result.ok ? "" : result.error).toBe(
      `Fetching configuration failed (HTTP ${READ_REFUSED}). The store said: ${READ_REFUSED_BODY}`,
    );
  });

  it("quotes it when the type arrives with the charset the worker really sends", async () => {
    // The spec above answers `text/plain` bare, which is `HttpResponse.text`'s default and NOT
    // what the deployed worker writes: `c.text` announces `text/plain; charset=UTF-8`. Held
    // apart from that one rather than folded into it, so the assertion that the store's own
    // words survive the real wire cannot be lost to a fixture's default.
    configMockServer.use(readRefusedOnTheWireHandler);

    const result = await fetchSeedConfig(STORED_ID);

    expect(result.ok ? "" : result.error).toBe(
      `Fetching configuration failed (HTTP ${READ_REFUSED}). The store said: ${READ_REFUSED_BODY}`,
    );
  });

  it("renders a refusal carrying terminal escapes as text rather than obeying it", async () => {
    configMockServer.use(forgedReadRefusalHandler);

    const result = await fetchSeedConfig(STORED_ID);

    expect(result.ok ? "" : result.error).toBe(
      `Fetching configuration failed (HTTP ${READ_REFUSED}). The store said: ${FORGED_READ_REFUSAL_INERT}`,
    );
  });

  it("keeps a refusal that did not arrive as text to its status", async () => {
    configMockServer.use(proxyRefusalHandler);

    const result = await fetchSeedConfig(STORED_ID);

    expect(result.ok ? "" : result.error).toBe(
      `Fetching configuration failed (HTTP ${BAD_GATEWAY}).`,
    );
  });

  it("keeps a refusal whose body says nothing to its status", async () => {
    configMockServer.use(silentRefusalHandler);

    const result = await fetchSeedConfig(STORED_ID);

    expect(result.ok ? "" : result.error).toBe(
      `Fetching configuration failed (HTTP ${READ_REFUSED}).`,
    );
  });

  it("bounds how much of an explanation it quotes back", async () => {
    configMockServer.use(hostileRefusalHandler);

    const result = await fetchSeedConfig(STORED_ID);

    const error = result.ok ? "" : result.error;
    expect(error).toContain(HOSTILE_OPENING);
    expect(error).not.toContain(HOSTILE_TAIL);
    expect(error.length).toBeLessThan(A_TERMINAL_CAN_TAKE);
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
