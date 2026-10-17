import { SELF, env } from "cloudflare:test"
import {
  COMPOSE_TOO_LONG_BODY,
  UNAUTHORIZED_BODY,
} from "@workspace/api-mocks/fixtures"
import { CATALOG } from "@workspace/matrix"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { upstreamMock } from "../vitest.setup"
import { composeRoute } from "./compose"
import { seedSession } from "./db/seed-session"
import { listStacksRoute } from "./stacks"

// The model is answered by msw: a real call would cost money and be
// non-deterministic.

const BASE = "https://api.test"
const WEB_ORIGIN = "http://localhost:5173"

const ask = (sentence: string, ip = "203.0.113.90") =>
  SELF.fetch(`${BASE}/compose`, {
    method: "POST",
    headers: {
      origin: WEB_ORIGIN,
      "content-type": "application/json",
      "cf-connecting-ip": ip,
    },
    body: JSON.stringify({ sentence }),
  })

// Guards vitest.config.ts' fake secret, so the suite never runs on a real key.
describe("the suite's own credentials", () => {
  it("holds a fake key, never the one in .dev.vars", () => {
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-not-a-real-key")
    expect(env.ANTHROPIC_API_KEY).not.toMatch(/^sk-ant-api/)
  })
})

describe("who may ask", () => {
  it("refuses a request carrying no session", async () => {
    expect((await ask("a react app")).status).toBe(401)
  })
})

const MESSAGES_URL = "https://api.anthropic.com/v1/messages"

// A spy, so "never asked" is a call count. msw rejects unhandled requests.
const answerWith = (proposal: { skillIds: string[]; reason: string }) => {
  const model = vi.fn(() =>
    HttpResponse.json({
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-opus-5",
      content: [{ type: "text", text: JSON.stringify(proposal) }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    })
  )

  upstreamMock.use(http.post(MESSAGES_URL, model))

  return model
}

const signedIn = (cookie: string, sentence: string) =>
  SELF.fetch(`${BASE}/compose`, {
    method: "POST",
    headers: {
      origin: WEB_ORIGIN,
      "content-type": "application/json",
      cookie,
    },
    body: JSON.stringify({ sentence }),
  })

// Written out rather than imported, so moving the cap reddens this.
const PAST_THE_CAP = "x".repeat(601)

const COMPOSE_LIMIT = 10

describe("what may be asked", () => {
  it("refuses a sentence long enough to be a payload rather than a prompt", async () => {
    const { cookie } = await seedSession(env)
    const model = answerWith({ skillIds: [], reason: "" })

    const response = await signedIn(cookie, PAST_THE_CAP)

    expect(response.status).toBe(400)
    // The fixture, not a literal: the editor discriminates on these bytes, so
    // the shared fixture must move with the route.
    expect(await response.json()).toStrictEqual(COMPOSE_TOO_LONG_BODY)
    expect(model).not.toHaveBeenCalled()
  })

  it("spends no allowance on a sentence it refuses for length", async () => {
    const { cookie } = await seedSession(env)
    const model = answerWith({ skillIds: [], reason: "because" })

    // Past the whole allowance, so the next sentence passes only if none counted.
    for (let attempt = 0; attempt <= COMPOSE_LIMIT; attempt++) {
      expect((await signedIn(cookie, PAST_THE_CAP)).status).toBe(400)
    }

    expect((await signedIn(cookie, "a react app")).status).toBe(200)
    expect(model).toHaveBeenCalledOnce()
  })

  // What reaches the model is still counted.
  it("still spends an allowance on every sentence that reaches the model", async () => {
    const { cookie } = await seedSession(env)
    answerWith({ skillIds: [], reason: "because" })

    for (let attempt = 0; attempt < COMPOSE_LIMIT; attempt++) {
      expect((await signedIn(cookie, "a react app")).status).toBe(200)
    }

    expect((await signedIn(cookie, "a react app")).status).toBe(429)
  })

  it("refuses an empty sentence without asking the model", async () => {
    const { cookie } = await seedSession(env)
    const model = answerWith({ skillIds: [], reason: "" })

    const response = await signedIn(cookie, "   ")

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: "empty" })
    expect(model).not.toHaveBeenCalled()
  })
})

describe("what the editor is handed back", () => {
  // Read off the catalogue so a renamed id cannot leave this stale.
  const [first = "", second = ""] = Object.keys(CATALOG.skillsById).sort()

  it("drops an id the catalogue does not have", async () => {
    const { cookie } = await seedSession(env)
    answerWith({ skillIds: [first, "not-a-skill"], reason: "because" })

    const response = await signedIn(cookie, "a react app")

    expect(await response.json()).toEqual({
      skillIds: [first],
      reason: "because",
    })
  })

  // A repeated id would toggle the skill on and back off in the editor.
  it("names a skill once however many times the model said it", async () => {
    const { cookie } = await seedSession(env)
    answerWith({ skillIds: [first, second, first], reason: "because" })

    const response = await signedIn(cookie, "a react app")

    expect(await response.json()).toEqual({
      skillIds: [first, second],
      reason: "because",
    })
  })
})

describe("a request with no session", () => {
  // Every guarded route declares the same 401 body.
  const bodySchemaOf = (route: typeof composeRoute | typeof listStacksRoute) =>
    route.responses[401].content["application/json"].schema

  it("is refused with the body the routes declare", async () => {
    const response = await ask("a react app")

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(UNAUTHORIZED_BODY)
  })

  it("declares that body identically on /compose and on /stacks", () => {
    for (const route of [composeRoute, listStacksRoute]) {
      const schema = bodySchemaOf(route)

      expect(schema.safeParse(UNAUTHORIZED_BODY).success).toBe(true)
      expect(schema.safeParse({ error: "nope" }).success).toBe(false)
    }
  })
})
