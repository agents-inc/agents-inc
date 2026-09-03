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

/**
 * The outbound half of the network boundary, held to the same posture as `fetch-seed.ts`: every
 * failure is a message rather than a throw, because nothing has been written anywhere and the
 * caller's only job is to explain.
 *
 * The worker is `@workspace/api-mocks` rather than a `vi.fn()` answering a hand-built `Response`,
 * so the request this really makes — method, path, headers and body — is what the assertions read
 * off the wire, and what it is answered with is the same statement of the worker `apps/editor`'s
 * suite is held to.
 */

/**
 * A mint that answers 201 and no id.
 *
 * The one response here that `@workspace/api-mocks` does not carry, and deliberately: the worker
 * cannot produce it — `POST /configs` answers the id or a status — so a handler for it beside the
 * others would be a claim about the worker that is not true. What it stands for is a deployed
 * worker this CLI was not built against, which is the whole reason `publish-seed.ts` revalidates
 * a response the type system already describes.
 */
const idlessMintHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.json({ notAnId: true }, { status: 201 }),
);

const PAYLOAD = buildSeedPayload({
  skills: { "web-framework-react": buildSeedSkill({ assignments: { "web-developer": "lazy" } }) },
});

/** The status `POST /configs` spends on a body its own schema refuses. */
const REFUSED = 400;

/**
 * A configuration the store's POST schema refuses, and the exact one a real user was refused
 * with: a project-scoped skill assigned to a sub-agent that rests at global scope, which has
 * nowhere to be written. `agents` is sparse, so saying nothing about `web-developer` leaves it on
 * the shared default of `global` — the whole reason the pair is easy to build by accident.
 */
const UNWRITABLE_PAYLOAD = buildSeedPayload({
  skills: {
    "web-framework-react": buildSeedSkill({
      scope: "project",
      assignments: { "web-developer": "lazy" },
    }),
  },
});

/**
 * The store refusing that payload, answered exactly as the deployed worker answers it.
 *
 * `apps/server` registers no `defaultHook`, and its own hook narrows only the seed-version case,
 * so a refused body falls through to `@hono/zod-validator`, which sends `c.json(result, 400)` —
 * the whole `safeParse` result. A `ZodError` carries no own enumerable fields beyond `name` and
 * `message`, so what lands on the wire is `{ success: false, error: { name, message } }` with the
 * issues rendered as a JSON document INSIDE `message`.
 *
 * The body is produced by running the store's own schema rather than transcribed, because that
 * envelope is the one thing this spec is about and a transcription of it would be a second claim
 * about the worker. `@workspace/api-mocks` carries no handler for it — `configRefusedHandlerFor`
 * answers a body only for 503 — so it is declared here beside the other answer that package
 * deliberately does not describe.
 *
 * `error` is `undefined` if `UNWRITABLE_PAYLOAD` ever stops being one the store refuses, which
 * leaves the envelope carrying no message at all and reddens the spec below: the fixture guards
 * itself rather than quietly becoming a test of nothing.
 */
const refusedByStore = installableSeedPayloadSchema.safeParse(UNWRITABLE_PAYLOAD);

const contractRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.json({ success: false, error: refusedByStore.error }, { status: REFUSED }),
);

/**
 * A refusal that never reached the worker at all — a proxy, a WAF or a captive portal answering
 * in its place. HTML rather than JSON, and the thing a terminal must never be painted with.
 *
 * Sent with `HttpResponse.html` rather than `.text`, which is not a detail: the content type is
 * the whole discriminator on the plain-text arm, and a captive portal announces `text/html`. HTML
 * *labelled* `text/plain` is a body no intruder produces, and a fixture that sent one would have
 * made this spec pass for a reason the wire never supplies. `fetch-seed.test.ts` models the same
 * intruder the same way.
 */
const BLOCKED_BY_PROXY = "<html><head><title>Request blocked</title></head></html>";

const notJsonRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.html(BLOCKED_BY_PROXY, { status: REFUSED }),
);

/** JSON, and not the envelope: a store answering some shape this CLI was not built against. */
const foreignRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.json({ reason: "no" }, { status: REFUSED }),
);

/** Where a hostile explanation starts, so a bounded quote can be shown to have kept the front. */
const HOSTILE_OPENING = "This explanation begins here and then runs on";

/** Where it ends, tens of kilobytes later, and what must never reach the terminal. */
const HOSTILE_TAIL = "and here is the end of it";

const HOSTILE_MESSAGE = `${HOSTILE_OPENING} ${"x".repeat(100_000)} ${HOSTILE_TAIL}`;

/**
 * A well-formed envelope carrying an explanation no person could read.
 *
 * Written out rather than produced by the schema, unlike `contractRefusalHandler` above: no
 * payload makes `installableSeedPayloadSchema` write a message this long, and what this stands
 * for is a store that has been replaced by something that does not mean well.
 */
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

/**
 * What "not dumped into a terminal" means here, held apart from whatever budget the module picks.
 * A quote that outgrew a kilobyte would have stopped being a quote.
 */
const A_TERMINAL_CAN_TAKE = 1000;

/**
 * The body the worker really answers a 409 with, and the reason this status cannot be quoted.
 *
 * `refuseAnotherSeedVersion` in `apps/server/src/index.ts` writes it, and it is addressed to the
 * caller that refusal was designed for: a browser tab minting from a bundle older than the last
 * deploy, for which one reload is the entire fix. There is no page in a terminal, so quoting this
 * would hand the one refusal whose whole purpose is naming a remedy an instruction its reader
 * cannot carry out.
 *
 * `SEED_VERSION` is imported because it is a symbol whose removal should break this; the sentence
 * around it is mirrored, because it belongs to the worker rather than to this package.
 */
const RELOAD_THE_PAGE = `Reload the page: this configuration names another version of the sharing contract, and this service serves v${String(SEED_VERSION)}`;

const contractVersionRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(RELOAD_THE_PAGE, { status: OUT_OF_DATE }),
);

/**
 * What a terminal is told instead, mirrored rather than imported.
 *
 * An assertion that read this off the constant the module renders would move with it and could
 * never fail — the rule `e2e/pages/constants.ts` exists for, arriving in a unit spec.
 */
const OUT_OF_DATE_AGAINST_STORE =
  "Sharing this configuration failed (HTTP 409). This CLI is out of date against the configuration store: it writes a version of the sharing contract the store does not serve, and that version travels inside the CLI rather than with the configuration. Re-run this command through 'npx agents-inc@latest'.";

/**
 * The status the worker spends on a body past its size cap — one of the four it writes with
 * `c.text` rather than an envelope, and here to stand for "a refusal that is neither a bad payload
 * nor a stale contract". 503 has a spec of its own above; this one is the control that keeps the
 * 409 branch below from reading as the arm every non-400 takes.
 */
const TOO_LARGE = 413;

/** The status the worker spends on a caller writing more often than the store's quota allows. */
const RATE_LIMITED = 429;

/**
 * Two of the three bodies this route writes with `c.text`, mirrored rather than invented — for the
 * reason `RELOAD_THE_PAGE` above is mirrored: they belong to `apps/server`, not to this package.
 *
 * Each is its own status's reason phrase re-cased. `node:http`'s `STATUS_CODES` gives
 * `Too Many Requests` for 429 and `Payload Too Large` for 413, so a terminal shown either beside
 * `(HTTP 429)` or `(HTTP 413)` has been told one fact twice. They are the control for the third,
 * `Could not store this config`, which is not `Service Unavailable` and does name a cause.
 */
const TOO_MANY_REQUESTS = "Too many requests";
const PAYLOAD_TOO_LARGE = "Payload too large";

/** The status the store spends on a write it could not complete — the one quotable refusal. */
const STORE_REFUSED = 503;

/**
 * The content type the deployed worker really announces its own sentences under, mirrored rather
 * than imported for the reason `RELOAD_THE_PAGE` above is: it belongs to hono and `apps/server`.
 *
 * `c.text(...)` writes hono's `TEXT_PLAIN`, which carries a charset parameter. `HttpResponse.text`
 * announces a bare `text/plain` and every other handler in this file takes that default, so
 * without this one fixture nothing here answers in the shape the wire actually carries — and a
 * content-type gate written as EQUALITY rather than as a prefix passes every spec in the file
 * while silencing, against the real worker, the one refusal on this route that names a cause.
 */
const HONO_TEXT_PLAIN = "text/plain; charset=UTF-8";

const storeRefusedOnTheWireHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(STORE_REFUSED_BODY, {
    status: STORE_REFUSED,
    headers: { "content-type": HONO_TEXT_PLAIN },
  }),
);

/**
 * The 503 the CLI-855 lane watched a real terminal obey, verbatim.
 *
 * `Could not store this config` is the one refusal on this route that names a cause rather than
 * restating its own status, so it is the one body that reaches a terminal — and an erase-line and
 * a carriage return inside it repaint the line the CLI printed in its own voice. What a reader
 * saw was a forged prompt claiming the store was compromised, assembled out of the CLI's own
 * words. Announced as `text/plain`, because that is the arm this body really arrives on.
 */
const FORGED_REFUSAL = "Could not store\u001B[2Kthis\r \u203A   STORE COMPROMISED config";

/** The same body with the terminal's ability to act on it removed, and none of its words. */
const FORGED_REFUSAL_INERT = "Could not storethis \u203A   STORE COMPROMISED config";

const forgedRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(FORGED_REFUSAL, { status: STORE_REFUSED }),
);

const rateLimitedHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(TOO_MANY_REQUESTS, { status: RATE_LIMITED }),
);

/**
 * The same restatement with whitespace around it — a body written with a trailing newline, which
 * is what anything echoing a line really puts on the wire.
 *
 * The control for the TRIMMING half of the restatement rule. Every other body in this file is
 * already flush against its reason phrase, so a comparison made on the untrimmed body agrees with
 * the trimmed one everywhere except here — and a padded restatement then reaches the terminal
 * beside the status line that had already said it.
 */
const paddedRestatementHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(`  ${TOO_MANY_REQUESTS}\n`, { status: RATE_LIMITED }),
);

const tooLargeHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text(PAYLOAD_TOO_LARGE, { status: TOO_LARGE }),
);

/**
 * The store announcing prose and sending none — a truncated write, or a handler that returned
 * early. Quoting it would put a `The store said:` on the terminal with nothing after the colon.
 */
const blankRefusalHandler = http.post(CONFIGS_URL, () =>
  HttpResponse.text("   ", { status: REFUSED }),
);

describe("publishSeedConfig", () => {
  const worker = useMockWorker();

  it("posts a configuration the store's own POST schema would accept", () => {
    // Every assertion below sends `PAYLOAD`, and every one of them holds for any bytes at all —
    // the handlers record what they were handed without judging it. So nothing else in this
    // file can notice a fixture the endpoint would refuse, and a fixture that stands in for "a
    // shared configuration" while being unmintable teaches that shape to everything copying it.
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
    // The whole request, not a sample: a POST that loses the content type is refused by the
    // worker's JSON validator.
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

    // Mirrored rather than assembled from the module's own constants, for the reason
    // `OUT_OF_DATE_AGAINST_STORE` above is: an expectation reading its sentence off the code
    // under test moves with that code and can never fail. Still carries the status, which is
    // what separates this from the 400, 409, 413 and 429 arms.
    expect(result.ok ? "" : result.error).toBe(
      "Sharing this configuration failed (HTTP 503). The store said: Could not store this config",
    );
  });

  it("quotes it when the type arrives with the charset the worker really sends", async () => {
    // The spec above answers `text/plain` bare, which is `HttpResponse.text`'s default and NOT
    // what the deployed worker writes: `c.text` announces `text/plain; charset=UTF-8`. Held
    // apart from that one rather than folded into it, so the assertion that the store's own
    // words survive the real wire cannot be lost to a fixture's default.
    configMockServer.use(storeRefusedOnTheWireHandler);

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok ? "" : result.error).toBe(
      "Sharing this configuration failed (HTTP 503). The store said: Could not store this config",
    );
  });

  it("renders a refusal that carries terminal escapes as text rather than obeying it", async () => {
    configMockServer.use(forgedRefusalHandler);

    const result = await publishSeedConfig(PAYLOAD);

    // Asserted on the whole message the caller will print, not on the quoted fragment picked back
    // out of it: what matters is that nothing reaching a terminal can move its cursor.
    expect(result.ok ? "" : result.error).toBe(
      `Sharing this configuration failed (HTTP ${STORE_REFUSED}). The store said: ${FORGED_REFUSAL_INERT}`,
    );
  });

  it("keeps a refusal whose body only restates its own reason phrase to its status", async () => {
    configMockServer.use(rateLimitedHandler);

    const result = await publishSeedConfig(PAYLOAD);

    const error = result.ok ? "" : result.error;
    expect(error).toBe(`Sharing this configuration failed (HTTP ${RATE_LIMITED}).`);
    // The half a blanket quote would have got wrong. Without this, the spec above is satisfied by
    // a module that repeats every body it is sent, which is not the rule being asked for.
    expect(error).not.toContain(TOO_MANY_REQUESTS);
  });

  it("keeps one restating around whitespace to its status too, the body being trimmed first", async () => {
    configMockServer.use(paddedRestatementHandler);

    const result = await publishSeedConfig(PAYLOAD);

    const error = result.ok ? "" : result.error;
    expect(error).toBe(`Sharing this configuration failed (HTTP ${RATE_LIMITED}).`);
    // A body written with a trailing newline is not its reason phrase as a string, so a
    // comparison made before the trim finds no restatement and quotes it — putting the sentence
    // the status line already carried onto the terminal a second time.
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
    // The literals are the store's sentence, mirrored rather than imported: an assertion that
    // read it off `installableSeedPayloadSchema` would move with it and could never fail.
    expect(error).toContain(
      "nowhere to be written on 'web-developer', which rests at global scope",
    );
    // The path is the half the sentence cannot carry — it names WHICH skill was refused.
    expect(error).toContain("skills.web-framework-react.assignments.web-developer");
    // Still the status. It is what separates this from a 409, a 413, a 429 and a 503.
    expect(error).toContain("400");
  });

  it("keeps a refusal something answered in the store's place to its status", async () => {
    configMockServer.use(notJsonRefusalHandler);

    const result = await publishSeedConfig(PAYLOAD);

    const error = result.ok ? "" : result.error;
    expect(error).toBe("Sharing this configuration failed (HTTP 400).");
    // The control for the plain-text arm. "Not the envelope" stopped being enough to keep a body
    // off the terminal the moment prose became quotable, and what holds this one back is the
    // content type — so name the markup the assertion above is silently excluding.
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
    // The half the status alone cannot carry, and the half a blanket quote would have got wrong.
    expect(error).not.toContain(RELOAD_THE_PAGE);
  });

  it("says the same for a 409 carrying no body, the status being the whole of the fact", async () => {
    // Which is why this branch reads the status rather than the body: what a 409 means is that
    // this CLI and the store name different contract versions, and nothing a body adds can
    // change that or make it any more actionable from a terminal.
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

    // A caller that trusted this would print an id of `undefined` and tell the user to install it.
    expect(result.ok).toBe(false);
  });

  it("reports an unreachable store by name rather than throwing", async () => {
    configMockServer.use(configUnreachableHandler);

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain(SEED_API_URL);
  });
});
