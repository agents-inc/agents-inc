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
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSeedConfig, SEED_USER_AGENT } from "./fetch-seed";
import { SEED_API_URL } from "../../consts.js";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { useMockWorker } from "../__tests__/helpers/mock-worker.js";

const READ_CONFIG_URL = `${CONFIGS_URL}/:id`;

/** Names the store's address; the suite's setup points it at the mock worker. */
const STORE_ADDRESS_VARIABLE = "AGENTS_INC_API_URL";

/** Answers the shared worker mock lacks: a dropped connection, and an intermediary's HTML. */
const readUnreachableHandler = http.get(READ_CONFIG_URL, () => HttpResponse.error());

const gatewayHtmlHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text("<html>gateway</html>"),
);

/** Mirrors `getConfig`'s 503 body; `@workspace/api-mocks` has no read-refusal handler. */
const READ_REFUSED = 503;
const READ_REFUSED_BODY = "Could not read this config";

const readRefusedHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text(READ_REFUSED_BODY, { status: READ_REFUSED }),
);

/** hono's `c.text` type carries a charset, so a content-type gate must match by prefix. */
const HONO_TEXT_PLAIN = "text/plain; charset=UTF-8";

const readRefusedOnTheWireHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text(READ_REFUSED_BODY, {
    status: READ_REFUSED,
    headers: { "content-type": HONO_TEXT_PLAIN },
  }),
);

/** Terminal control sequences inside a refusal, from whatever answers for the store. */
const FORGED_READ_REFUSAL = "Could not read\u001B[2Kthis\r \u203A   STORE COMPROMISED config";

const FORGED_READ_REFUSAL_INERT = "Could not readthis \u203A   STORE COMPROMISED config";

const forgedReadRefusalHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text(FORGED_READ_REFUSAL, { status: READ_REFUSED }),
);

/** A proxy's markup refusal: not `text/plain`, so not quoted. */
const BAD_GATEWAY = 502;
const BLOCKED_BY_PROXY = "<html><head><title>Request blocked</title></head></html>";

const proxyRefusalHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.html(BLOCKED_BY_PROXY, { status: BAD_GATEWAY }),
);

const HOSTILE_OPENING = "This explanation begins here and then runs on";

const HOSTILE_TAIL = "and here is the end of it";

const hostileRefusalHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text(`${HOSTILE_OPENING} ${"x".repeat(100_000)} ${HOSTILE_TAIL}`, {
    status: READ_REFUSED,
  }),
);

const silentRefusalHandler = http.get(READ_CONFIG_URL, () =>
  HttpResponse.text("   ", { status: READ_REFUSED }),
);

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
    await fetchSeedConfig(STORED_ID);

    const { headers } = firstElement(worker.requests);
    expect(headers.get("user-agent")).toBe(SEED_USER_AGENT);
    expect(headers.get("accept")).toBe("application/json");
  });

  it("sends no session credentials, having no cookie jar to send them from", async () => {
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
    // Control: this status's body is dropped, so quoting is shown to be selective.
    expect(error).not.toContain(NO_CONFIG_BODY);
  });

  it("quotes the store's own account of an integrity failure, beside the status", async () => {
    // The worker's integrity failure: the id is held and its bytes no longer parse.
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
    // The deployed worker announces `text/plain; charset=UTF-8`, not the bare default above.
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
    // What a payload minted against another contract version looks like from here.
    configMockServer.use(storedConfigHandlerFor(STORED_ID, { v: "not-a-seed" }));

    const result = await fetchSeedConfig(STORED_ID);

    expect(result.ok ? "" : result.error).toContain("re-share the configuration");
  });
});

describe("the store fetchSeedConfig asks", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // A literal: it is the address every user's install reads from.
  it("is the public store when no other address is set", async () => {
    vi.stubEnv(STORE_ADDRESS_VARIABLE, undefined);
    vi.resetModules();

    const { SEED_API_URL: storeAddress } = await import("../../consts.js");

    expect(storeAddress).toBe("https://api.agentsinc.sh");
  });
});

describe("fetchSeedConfig's user agent, as the store reads it", () => {
  const worker = useMockWorker();

  // A literal: the store tells an install from someone opening a share link by this exact string.
  it("names itself agents-inc-cli", async () => {
    await fetchSeedConfig(STORED_ID);

    expect(firstElement(worker.requests).headers.get("user-agent")).toBe("agents-inc-cli");
  });
});
