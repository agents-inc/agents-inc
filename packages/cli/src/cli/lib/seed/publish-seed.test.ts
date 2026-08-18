import { afterEach, describe, expect, it, vi } from "vitest";

import { publishSeedConfig } from "./publish-seed";
import { SEED_API_URL, SEED_USER_AGENT } from "./fetch-seed";
import { buildSeedPayload, buildSeedSkill } from "../__tests__/factories/seed-factories.js";

/**
 * The outbound half of the network boundary, held to the same posture as `fetch-seed.ts`: every
 * failure is a message rather than a throw, because nothing has been written anywhere and the
 * caller's only job is to explain.
 *
 * `fetch` is stubbed rather than the module, so the request this would really make — method, path,
 * headers and body — is what the assertions see. A unit test that set `AGENTS_INC_API_URL` instead
 * would hit production: the URL is a module-level const, read once at import.
 */

const MINTED_ID = "Ab3xY9_Q";

/**
 * The request this module builds. Narrower than `RequestInit`, whose `body` admits every
 * `BodyInit` — this one only ever sends serialized JSON, and saying so is what lets the
 * assertions read it as text.
 */
type PostedRequest = { method: string; headers: Record<string, string>; body: string };

const PAYLOAD = buildSeedPayload({
  skills: { "web-framework-react": buildSeedSkill({ assignments: { "web-developer": "lazy" } }) },
});

/** The last `fetch` call as `[url, init]`, whatever the stub was told to answer with. */
function stubPost(response: Response | Error): ReturnType<typeof vi.fn> {
  const stub =
    response instanceof Error
      ? vi.fn().mockRejectedValue(response)
      : vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", stub);
  return stub;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("publishSeedConfig", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the payload to the configs endpoint and returns the id the store minted", async () => {
    const stub = stubPost(jsonResponse({ id: MINTED_ID }, 201));

    const result = await publishSeedConfig(PAYLOAD);

    expect(result).toStrictEqual({ ok: true, id: MINTED_ID });
    // Boundary cast: a `vi.fn()` stub records its arguments as `unknown[]`, so the shape the
    // module under test really passed has to be named here to be read at all.
    const [url, init] = stub.mock.calls[0] as [string, PostedRequest];
    expect(url).toBe(`${SEED_API_URL}/configs`);
    expect(init.method).toBe("POST");
    // The whole request, not a sample: a POST that loses the content type is refused by the
    // worker's JSON validator, and one that loses the body stores an empty configuration.
    expect(init.headers).toStrictEqual({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": SEED_USER_AGENT,
    });
    expect(JSON.parse(init.body)).toStrictEqual(PAYLOAD);
  });

  it("reports a store that refused the write, with the status it refused with", async () => {
    stubPost(new Response("Could not store this config", { status: 503 }));

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("503");
  });

  it("reports a response that carries no id rather than reporting success", async () => {
    stubPost(jsonResponse({ notAnId: true }, 201));

    const result = await publishSeedConfig(PAYLOAD);

    // A caller that trusted this would print an id of `undefined` and tell the user to install it.
    expect(result.ok).toBe(false);
  });

  it("reports an unreachable store by name rather than throwing", async () => {
    stubPost(new TypeError("fetch failed"));

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain(SEED_API_URL);
  });
});
