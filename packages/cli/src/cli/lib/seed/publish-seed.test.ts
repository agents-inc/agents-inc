import {
  CONFIGS_URL,
  STORED_ID,
  configUnreachableHandler,
  storeRefusedHandler,
} from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { installableSeedPayloadSchema } from "@workspace/matrix/seed";
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
    // worker's JSON validator, and one that loses the body stores an empty configuration.
    expect(Object.fromEntries(posted.headers)).toStrictEqual({
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": SEED_USER_AGENT,
    });
    expect(JSON.parse(await posted.text())).toStrictEqual(PAYLOAD);
  });

  it("reports a store that refused the write, with the status it refused with", async () => {
    configMockServer.use(storeRefusedHandler);

    const result = await publishSeedConfig(PAYLOAD);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain("503");
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
