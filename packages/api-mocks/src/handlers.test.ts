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

/** The lossy trip a `Response` body takes, so a `ZodError` compares as it crosses the wire. */
const wireShapeOf = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value))

describe("createConfig", () => {
  it("mints an id for a payload the write contract accepts", async () => {
    const answer = await answerFor(configHandlers, post(STORED_PAYLOAD))

    expect(answer.served && answer.status).toBe(201)
    expect(jsonOf(answer)).toStrictEqual({ id: STORED_ID })
  })

  // The base schema takes this payload; only the write schema refuses it.
  it("refuses a project-scoped skill on a sub-agent resting at global, exactly as the worker does", async () => {
    const refused = installableSeedPayloadSchema.safeParse(OUT_OF_SCOPE_PAYLOAD)
    // Guards against becoming a test of nothing.
    expect(
      refused.success,
      "the fixture must still be one the write contract refuses"
    ).toBe(false)

    const answer = await answerFor(configHandlers, post(OUT_OF_SCOPE_PAYLOAD))

    expect(answer.served && answer.status).toBe(400)
    // `@hono/zod-validator`'s default hook envelope.
    expect(jsonOf(answer)).toStrictEqual(
      wireShapeOf({ success: false, error: refused.error })
    )
  })

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

// Resolved with `getResponse`, not `answerFor`: `@msw/playwright` fulfils handlers verbatim, so the
// exposure must come from the handler itself.
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
