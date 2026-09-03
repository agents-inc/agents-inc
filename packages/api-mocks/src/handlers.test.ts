import { installableSeedPayloadSchema } from "@workspace/matrix/seed"
import { describe, expect, it } from "vitest"

import { answerFor } from "./answer"
import { OUT_OF_SCOPE_PAYLOAD, STORED_ID, STORED_PAYLOAD } from "./fixtures"
import {
  CONFIGS_URL,
  configHandlers,
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
