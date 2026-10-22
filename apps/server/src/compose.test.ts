import { SELF, env } from "cloudflare:test"
import {
  COMPOSE_FAILED_BODY,
  COMPOSE_TOO_LONG_BODY,
  COMPOSE_TOO_MANY_BODY,
  UNAUTHORIZED_BODY,
} from "@workspace/api-mocks/fixtures"
import { CATALOG } from "@workspace/matrix"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { upstreamMock } from "../vitest.setup"
import { seedSession } from "./db/seed-session"
import { app } from "./index"

// `clearMocks` does not restore a spy, and some cases replace console or a binding.
afterEach(() => {
  vi.restoreAllMocks()
})

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

type Proposal = { skillIds: string[]; reason: string }

/** The model's reply; the SDK reads the proposal from its first text block. */
const modelReply = (content: readonly { type: "text"; text: string }[]) =>
  HttpResponse.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content,
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  })

const proposing = (proposal: Proposal) =>
  modelReply([{ type: "text", text: JSON.stringify(proposal) }])

// A spy, so "never asked" is a call count. msw rejects unhandled requests.
const answerWith = (proposal: Proposal) => {
  const model = vi.fn(() => proposing(proposal))

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
const AT_THE_CAP = "x".repeat(600)

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

  // The control for the length refusal: the cap itself is allowed.
  it("takes a sentence exactly as long as the cap", async () => {
    const { cookie } = await seedSession(env)
    const model = answerWith({ skillIds: [], reason: "because" })

    const response = await signedIn(cookie, AT_THE_CAP)

    expect(response.status).toBe(200)
    expect(model).toHaveBeenCalledOnce()
  })

  // The binding is stubbed: its window is the wall clock's minute, so spending
  // it for real fails whenever the requests straddle a minute boundary.
  it("says the allowance is spent in the body the editor reads", async () => {
    const { cookie } = await seedSession(env)
    const model = answerWith({ skillIds: [], reason: "because" })
    vi.spyOn(env.COMPOSE_CALLS, "limit").mockResolvedValueOnce({
      success: false,
    })

    const response = await signedIn(cookie, "a react app")

    expect(response.status).toBe(429)
    expect(await response.json()).toStrictEqual(COMPOSE_TOO_MANY_BODY)
    expect(model).not.toHaveBeenCalled()
  })
})

// The format the prompt itself states: one `id — name: description` per line,
// sorted, so the cached prefix is byte-identical between calls.
const CATALOGUE_AS_PROMPTED = Object.values(CATALOG.skillsById)
  .map((skill) => `${skill.id} — ${skill.displayName}: ${skill.description}`)
  .sort()
  .join("\n")

const GATEWAY_URL =
  "https://gateway.ai.cloudflare.test/v1/account/gateway/anthropic"

describe("what the model is asked", () => {
  const recordAsking = () => {
    const asked: unknown[] = []
    upstreamMock.use(
      http.post(MESSAGES_URL, async ({ request }) => {
        asked.push(await request.json())
        return proposing({ skillIds: [], reason: "because" })
      })
    )
    return asked
  }

  it("sends the whole catalogue as a cached prefix and the trimmed sentence as the message", async () => {
    const { cookie } = await seedSession(env)
    const asked = recordAsking()

    await signedIn(cookie, "  a react app  ")
    const cachedCatalogue: Record<string, unknown> = {
      type: "text",
      text: expect.stringContaining(CATALOGUE_AS_PROMPTED),
      cache_control: { type: "ephemeral" },
    }

    expect(asked).toStrictEqual([
      expect.objectContaining({
        model: "claude-opus-5",
        system: [cachedCatalogue],
        messages: [{ role: "user", content: "a react app" }],
      }),
    ])
  })

  // Bindings handed in directly: the suite's own leave the gateway unset.
  it("asks through the AI Gateway when one is configured", async () => {
    const { cookie } = await seedSession(env)
    const gateway = vi.fn(() => proposing({ skillIds: [], reason: "because" }))
    upstreamMock.use(http.post(`${GATEWAY_URL}/v1/messages`, gateway))

    const response = await app.request(
      `${BASE}/compose`,
      {
        method: "POST",
        headers: {
          origin: WEB_ORIGIN,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ sentence: "a react app" }),
      },
      { ...env, AI_GATEWAY_URL: GATEWAY_URL }
    )

    expect(response.status).toBe(200)
    expect(gateway).toHaveBeenCalledOnce()
  })
})

describe("when the model does not answer usefully", () => {
  it("answers 502 when the reply holds no answer at all", async () => {
    const { cookie } = await seedSession(env)
    upstreamMock.use(http.post(MESSAGES_URL, () => modelReply([])))

    const response = await signedIn(cookie, "a react app")

    expect(response.status).toBe(502)
    expect(await response.json()).toStrictEqual({ error: "unparseable" })
  })

  // The upstream message is logged, never returned: it can carry account details.
  it("answers 502, and logs why, when the call itself fails", async () => {
    const { cookie } = await seedSession(env)
    upstreamMock.use(
      http.post(MESSAGES_URL, () =>
        HttpResponse.json(
          {
            type: "error",
            error: {
              type: "invalid_request_error",
              message: "the request was malformed",
            },
          },
          { status: 400 }
        )
      )
    )
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await signedIn(cookie, "a react app")
    const failure: Record<string, unknown> = {
      event: "compose_failure",
      message: expect.stringContaining("the request was malformed"),
    }

    expect(response.status).toBe(502)
    expect(await response.json()).toStrictEqual(COMPOSE_FAILED_BODY)
    expect(logged).toHaveBeenCalledWith(failure)
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
  const NEEDS_A_SESSION = [
    { method: "post", path: "/compose" },
    { method: "get", path: "/stacks" },
    { method: "post", path: "/stacks" },
    { method: "patch", path: "/stacks/{id}" },
    { method: "delete", path: "/stacks/{id}" },
  ] as const

  // Read off the document the exported app generates, so a route may be
  // declared anywhere.
  const declaredRefusals = () => {
    const { paths = {} } = app.getOpenAPI31Document({
      openapi: "3.1.0",
      info: { title: "agents-inc", version: "0" },
    })

    return NEEDS_A_SESSION.map(
      ({ method, path }): unknown => paths[path]?.[method]?.responses?.["401"]
    )
  }

  const REFUSAL_DECLARED: Record<string, unknown> = {
    description: expect.any(String),
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            error: { type: "string", enum: [UNAUTHORIZED_BODY.error] },
          },
          required: ["error"],
        },
      },
    },
  }

  it("is refused with the body the routes declare", async () => {
    const response = await ask("a react app")

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual(UNAUTHORIZED_BODY)
  })

  it("declares that body on every route that needs a session", () => {
    expect(declaredRefusals()).toStrictEqual(
      NEEDS_A_SESSION.map(() => REFUSAL_DECLARED)
    )
  })
})
