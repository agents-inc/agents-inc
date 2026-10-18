import {
  CONFIGS_URL,
  OUT_OF_DATE,
  STORED_ID,
  STORE_REFUSED_BODY,
  configRefusedHandlerFor,
  configUnreachableHandler,
  storeRefusedHandler,
} from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { SEED_VERSION, installableSeedPayloadSchema } from "@workspace/matrix/seed";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { publishSeedConfig } from "./publish-seed";
import { SEED_API_URL, SEED_USER_AGENT } from "./fetch-seed";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { useMockWorker } from "../__tests__/helpers/mock-worker.js";
import { buildSeedPayload, buildSeedSkill } from "../__tests__/factories/seed-factories.js";

/** A 201 with no id: the real worker cannot send it, so `@workspace/api-mocks` has no handler. */
const idlessMintHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.json({ notAnId: true }, { status: 201 }),
);

const PAYLOAD = buildSeedPayload({
  skills: { "web-framework-react": buildSeedSkill({ assignments: { "web-developer": "lazy" } }) },
});

const REFUSED = 400;

/** A project-scoped skill on a sub-agent resting at global scope, which the store refuses. */
const UNWRITABLE_PAYLOAD = buildSeedPayload({
  skills: {
    "web-framework-react": buildSeedSkill({
      scope: "project",
      assignments: { "web-developer": "lazy" },
    }),
  },
});

/** The validator's envelope, produced by running the store's own schema, not transcribed. */
const refusedByStore = installableSeedPayloadSchema.safeParse(UNWRITABLE_PAYLOAD);

const contractRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.json({ success: false, error: refusedByStore.error }, { status: REFUSED }),
);

/** A proxy's refusal, sent as `text/html` because the content type is the plain-text arm's gate. */
const BLOCKED_BY_PROXY = "<html><head><title>Request blocked</title></head></html>";

const notJsonRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.html(BLOCKED_BY_PROXY, { status: REFUSED }),
);

const foreignRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.json({ reason: "no" }, { status: REFUSED }),
);

const HOSTILE_OPENING = "This explanation begins here and then runs on";

const HOSTILE_TAIL = "and here is the end of it";

const HOSTILE_MESSAGE = `${HOSTILE_OPENING} ${"x".repeat(100_000)} ${HOSTILE_TAIL}`;

const hostileRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.json(
    {
      success: false,
      error: {
        name: "ZodError",
        message: JSON.stringify([{ code: "custom", path: [], message: HOSTILE_MESSAGE }]),
      },
    },
    { status: REFUSED },
  ),
);

/** Held apart from the module's own budget. */
const A_TERMINAL_CAN_TAKE = 1000;

/** The worker's 409 body, mirrored; its "Reload the page" cannot be followed from a terminal. */
const RELOAD_THE_PAGE = `Reload the page: this configuration names another version of the sharing contract, and this service serves v${String(SEED_VERSION)}`;

const contractVersionRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(RELOAD_THE_PAGE, { status: OUT_OF_DATE }),
);

/** Mirrored rather than imported, so the assertion cannot move with the code under test. */
const OUT_OF_DATE_AGAINST_STORE =
  "Sharing this configuration failed (HTTP 409). This CLI is out of date against the configuration store: it writes a version of the sharing contract the store does not serve, and that version travels inside the CLI rather than with the configuration. Re-run this command through 'npx agents-inc@latest'.";

const TOO_LARGE = 413;

const RATE_LIMITED = 429;

/** Each restates its own status's reason phrase; mirrored from `apps/server`. */
const TOO_MANY_REQUESTS = "Too many requests";
const PAYLOAD_TOO_LARGE = "Payload too large";

const STORE_REFUSED = 503;

/** What `c.text` really announces; a content-type gate written as equality would fail on it. */
const HONO_TEXT_PLAIN = "text/plain; charset=UTF-8";

const storeRefusedOnTheWireHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(STORE_REFUSED_BODY, {
    status: STORE_REFUSED,
    headers: { "content-type": HONO_TEXT_PLAIN },
  }),
);

/** A body whose erase-line and carriage return would repaint the CLI's own line. */
const FORGED_REFUSAL = "Could not store\u001B[2Kthis\r \u203A   STORE COMPROMISED config";

const FORGED_REFUSAL_INERT = "Could not storethis \u203A   STORE COMPROMISED config";

const forgedRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(FORGED_REFUSAL, { status: STORE_REFUSED }),
);

const rateLimitedHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(TOO_MANY_REQUESTS, { status: RATE_LIMITED }),
);

/** The control for trimming before the restatement check. */
const paddedRestatementHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(`  ${TOO_MANY_REQUESTS}\n`, { status: RATE_LIMITED }),
);

const tooLargeHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(PAYLOAD_TOO_LARGE, { status: TOO_LARGE }),
);

const blankRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text("   ", { status: REFUSED }),
);

/** A mint the store acknowledged with something other than JSON. */
const notJsonMintHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text("created", { status: 201 }),
);

/** Two issues: one at a path, one about the payload as a whole. */
const twoIssueRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.json(
    {
      success: false,
      error: {
        name: "ZodError",
        message: JSON.stringify([
          { code: "custom", path: ["skills", "web-framework-react"], message: "is not offered" },
          { code: "custom", path: [], message: "Nothing here can be installed" },
        ]),
      },
    },
    { status: REFUSED },
  ),
);

describe("publishSeedConfig", () => {
  const worker = useMockWorker();

  it("posts a configuration the store's own POST schema would accept", () => {
    const mintable = installableSeedPayloadSchema.safeParse(PAYLOAD);
    expect(mintable.success ? [] : mintable.error.issues.map((issue) => issue.path.join("."))) //
      .toStrictEqual([]);
  });

  it("posts the payload to the configs endpoint and returns the id the store minted", async () => {
    const result = await publishSeedConfig(PAYLOAD);

    expect(result).toStrictEqual({ ok: true, id: STORED_ID });
    const posted = firstElement(worker.requests);
    expect(posted.url).toBe(CONFIGS_URL);
    expect(posted.method).toBe("POST");
    expect(Object.fromEntries(posted.headers)).toStrictEqual({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": SEED_USER_AGENT,
    });
    expect(JSON.parse(await posted.text())).toStrictEqual(PAYLOAD);
  });

  it("quotes a plain-text refusal whose body names a cause its status line does not", async () => {
    configMockServer.use(storeRefusedHandler);

    const result = await publishSeedConfig(PAYLOAD);

    // Mirrored rather than assembled from the module's constants.
    expect(result.ok ? "" : result.error).toBe(
      "Sharing this configuration failed (HTTP 503). The store said: Could not store this config",
    );
  });

  it("quotes it when the type arrives with the charset the worker really sends", async () => {
    // The real worker's `text/plain; charset=UTF-8`, not `HttpResponse.text`'s bare default.
    configMockServer.use(storeRefusedOnTheWireHandler);

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok ? "" : result.error).toBe(
      "Sharing this configuration failed (HTTP 503). The store said: Could not store this config",
    );
  });

  it("renders a refusal that carries terminal escapes as text rather than obeying it", async () => {
    configMockServer.use(forgedRefusalHandler);

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok ? "" : result.error).toBe(
      `Sharing this configuration failed (HTTP ${STORE_REFUSED}). The store said: ${FORGED_REFUSAL_INERT}`,
    );
  });

  it("keeps a refusal whose body only restates its own reason phrase to its status", async () => {
    configMockServer.use(rateLimitedHandler);

    const result = await publishSeedConfig(PAYLOAD);

    const error = result.ok ? "" : result.error;
    expect(error).toBe(`Sharing this configuration failed (HTTP ${RATE_LIMITED}).`);
    expect(error).not.toContain(TOO_MANY_REQUESTS);
  });

  it("keeps one restating around whitespace to its status too, the body being trimmed first", async () => {
    configMockServer.use(paddedRestatementHandler);

    const result = await publishSeedConfig(PAYLOAD);

    const error = result.ok ? "" : result.error;
    expect(error).toBe(`Sharing this configuration failed (HTTP ${RATE_LIMITED}).`);
    expect(error).not.toContain(TOO_MANY_REQUESTS);
  });

  it("does the same for the other restating status, the rule being general", async () => {
    configMockServer.use(tooLargeHandler);

    const result = await publishSeedConfig(PAYLOAD);

    const error = result.ok ? "" : result.error;
    expect(error).toBe(`Sharing this configuration failed (HTTP ${TOO_LARGE}).`);
    expect(error).not.toContain(PAYLOAD_TOO_LARGE);
  });

  it("keeps a refusal announcing prose and carrying none to its status", async () => {
    configMockServer.use(blankRefusalHandler);

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok ? "" : result.error).toBe("Sharing this configuration failed (HTTP 400).");
  });

  it("quotes the store's own account of a refusal back, beside the status", async () => {
    configMockServer.use(contractRefusalHandler);

    const result = await publishSeedConfig(UNWRITABLE_PAYLOAD);

    const error = result.ok ? "" : result.error;
    // Mirrored rather than read off `installableSeedPayloadSchema`.
    expect(error).toContain(
      "nowhere to be written on 'web-developer', which rests at global scope",
    );
    expect(error).toContain("skills.web-framework-react.assignments.web-developer");
    expect(error).toContain("400");
  });

  it("keeps a refusal something answered in the store's place to its status", async () => {
    configMockServer.use(notJsonRefusalHandler);

    const result = await publishSeedConfig(PAYLOAD);

    const error = result.ok ? "" : result.error;
    expect(error).toBe("Sharing this configuration failed (HTTP 400).");
    expect(error).not.toContain(BLOCKED_BY_PROXY);
  });

  it("keeps a refusal that carries no body at all to its status", async () => {
    configMockServer.use(configRefusedHandlerFor(REFUSED));

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok ? "" : result.error).toBe("Sharing this configuration failed (HTTP 400).");
  });

  it("keeps a refusal whose JSON is not the store's envelope to its status", async () => {
    configMockServer.use(foreignRefusalHandler);

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok ? "" : result.error).toBe("Sharing this configuration failed (HTTP 400).");
  });

  it("reports the status a refusal other than a bad payload arrived with", async () => {
    configMockServer.use(configRefusedHandlerFor(TOO_LARGE));

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok ? "" : result.error).toBe(
      `Sharing this configuration failed (HTTP ${TOO_LARGE}).`,
    );
  });

  it("tells a 409 caller the CLI is out of date rather than repeating browser advice", async () => {
    configMockServer.use(contractVersionRefusalHandler);

    const result = await publishSeedConfig(PAYLOAD);

    const error = result.ok ? "" : result.error;
    expect(error).toBe(OUT_OF_DATE_AGAINST_STORE);
    expect(error).not.toContain(RELOAD_THE_PAGE);
  });

  it("says the same for a 409 carrying no body, the status being the whole of the fact", async () => {
    configMockServer.use(configRefusedHandlerFor(OUT_OF_DATE));

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok ? "" : result.error).toBe(OUT_OF_DATE_AGAINST_STORE);
  });

  it("bounds how much of an explanation it quotes back", async () => {
    configMockServer.use(hostileRefusalHandler);

    const result = await publishSeedConfig(PAYLOAD);

    const error = result.ok ? "" : result.error;
    expect(error).toContain(HOSTILE_OPENING);
    expect(error).not.toContain(HOSTILE_TAIL);
    expect(error.length).toBeLessThan(A_TERMINAL_CAN_TAKE);
  });

  it("reports a response that carries no id rather than reporting success", async () => {
    configMockServer.use(idlessMintHandler);

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok).toBe(false);
  });

  it("reports an unreachable store by name rather than throwing", async () => {
    configMockServer.use(configUnreachableHandler);

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain(SEED_API_URL);
  });
});

describe("publishSeedConfig messages, word for word", () => {
  useMockWorker();

  it("reports a mint the store acknowledged with something other than JSON", async () => {
    configMockServer.use(notJsonMintHandler);

    expect(await publishSeedConfig(PAYLOAD)).toStrictEqual({
      ok: false,
      error: "The configuration store returned something that is not JSON.",
    });
  });

  it("reports a mint that carries no id", async () => {
    configMockServer.use(idlessMintHandler);

    expect(await publishSeedConfig(PAYLOAD)).toStrictEqual({
      ok: false,
      error: "The configuration store did not return an id for this share.",
    });
  });

  it("quotes each issue the store names, its path first, and a pathless one on its own", async () => {
    configMockServer.use(twoIssueRefusalHandler);

    expect(await publishSeedConfig(PAYLOAD)).toStrictEqual({
      ok: false,
      error:
        "Sharing this configuration failed (HTTP 400). The store said: skills.web-framework-react: is not offered; Nothing here can be installed",
    });
  });
});
