import { installableSeedPayloadSchema } from "@workspace/matrix/seed"
import { getResponse } from "msw"
import { describe, expect, it } from "vitest"

import { EXPOSE_HEADERS_HEADER, answerFor } from "./answer"
import {
  CONFIG_WRITE_WINDOW_SECONDS,
  OUT_OF_SCOPE_PAYLOAD,
  RATE_LIMITED_BODY,
  STORED_ID,
  STORED_PAYLOAD,
  WORKER_EXPOSED_HEADERS,
} from "./fixtures"
import {
  CONFIGS_URL,
  TOO_MANY,
  configHandlers,
  configRateLimitedHandler,
  configRefusedHandlerFor,
  storeRefusedHandler,
} from "./handlers"

import type { MockedAnswer } from "./answer"

// `POST /configs` is the one route in this package whose answer depends on the CALLER's body
// rather than on a fixed fixture — which is exactly the route `apps/server` gates with
// `installableSeedPayloadSchema` and this double did not (CLI-849). A double more permissive
// than the worker cannot fail, and one that cannot fail is not a test of a client that posts to
// it — which is how a real user reached an HTTP 400 this suite could not have seen coming.

const jsonOf = (answer: MockedAnswer): unknown => {
  if (!answer.served) throw new Error(`Not served: ${answer.reason}`)
  return JSON.parse(new TextDecoder().decode(answer.body))
}

const post = (payload: unknown) =>
  new Request(CONFIGS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  })

/** The same lossy trip a `Response` body takes, so a `ZodError` compares as what crosses the wire. */
const wireShapeOf = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value))

describe("createConfig", () => {
  it("mints an id for a payload the write contract accepts", async () => {
    const answer = await answerFor(configHandlers, post(STORED_PAYLOAD))

    expect(answer.served && answer.status).toBe(201)
    expect(jsonOf(answer)).toStrictEqual({ id: STORED_ID })
  })

  // THE defect this double let ship: a project-scoped skill assigned to a sub-agent that rests at
  // global scope, since `OUT_OF_SCOPE_PAYLOAD`'s `agents` map says nothing about it. The base
  // schema takes this payload — only the WRITE schema refuses it, which is the entire reason the
  // two are split (see `installableSeedPayloadSchema` in `@workspace/matrix/seed`). Before this
  // fix, posting it here minted an id exactly as any other payload would.
  it("refuses a project-scoped skill on a sub-agent resting at global, exactly as the worker does", async () => {
    const refused = installableSeedPayloadSchema.safeParse(OUT_OF_SCOPE_PAYLOAD)
    // Guards itself rather than quietly becoming a test of nothing, the way `refusedByStore` does
    // in `publish-seed.test.ts`.
    expect(
      refused.success,
      "the fixture must still be one the write contract refuses"
    ).toBe(false)

    const answer = await answerFor(configHandlers, post(OUT_OF_SCOPE_PAYLOAD))

    expect(answer.served && answer.status).toBe(400)
    // The same envelope `@hono/zod-validator`'s default hook sends: the whole `safeParse` result,
    // JSON-serialized — which is what `publish-seed.ts`'s `refusalSchema` reads on the wire.
    expect(jsonOf(answer)).toStrictEqual(
      wireShapeOf({ success: false, error: refused.error })
    )
  })

  // An opt-in refusal is a spec asking for a SPECIFIC failure, not for the schema's opinion of
  // its body — so it has to keep shadowing the validating default, exactly as it shadowed the
  // fixed 201 before this change.
  it("still lets an installed refusal answer ahead of validation", async () => {
    const answer = await answerFor(
      [storeRefusedHandler, ...configHandlers],
      post(OUT_OF_SCOPE_PAYLOAD)
    )

    expect(answer.served && answer.status).toBe(503)
  })

  it("still lets a parameterised refusal answer ahead of validation, for a payload the schema would accept", async () => {
    const answer = await answerFor(
      [configRefusedHandlerFor(413), ...configHandlers],
      post(STORED_PAYLOAD)
    )

    expect(answer.served && answer.status).toBe(413)
  })
})

// The worker's limiter, which `apps/server/src/stacks.test.ts` pins this double against. Resolved
// with msw's own `getResponse` rather than `answerFor`, because the claim is about the HANDLER:
// `@msw/playwright` fulfils what a handler returns verbatim, so an exposure only `answerFor` adds
// never reaches the browser, and the editor's Install dialog would read no window at all.
describe("a rate-limited mint", () => {
  it("answers as the worker's limiter does, with a window a browser may read", async () => {
    const response = await getResponse(
      [configRateLimitedHandler, ...configHandlers],
      post(STORED_PAYLOAD)
    )
    if (!response) throw new Error("no handler answered the mint")

    expect(response.status).toBe(TOO_MANY)
    expect(await response.text()).toBe(RATE_LIMITED_BODY)
    expect(response.headers.get("retry-after")).toBe(
      String(CONFIG_WRITE_WINDOW_SECONDS)
    )
    expect(response.headers.get(EXPOSE_HEADERS_HEADER)).toBe(
      WORKER_EXPOSED_HEADERS
    )
  })

  // Named by its status like every other refusal here, so a spec asking for a 429 by number gets
  // the worker's whole answer rather than a bare status the worker never sends.
  it("is what a refusal named by the 429 status answers", async () => {
    const response = await getResponse(
      [configRefusedHandlerFor(TOO_MANY)],
      post(STORED_PAYLOAD)
    )

    expect(response?.headers.get("retry-after")).toBe(
      String(CONFIG_WRITE_WINDOW_SECONDS)
    )
  })
})
