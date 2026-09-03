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

// EDITOR-54, written before the route. What the worker owns is the boundary
// either side of the model — who may ask, how often, what the model is allowed
// to be asked, and what shape an answer has to have before the editor sees it.
//
// The model itself is answered by msw, which is what `vitest.config.ts` says to
// do for a worker's outbound calls (the pool dropped `fetchMock` in 0.20, and
// `msw/node` runs here). Not a shortcut: a test that really called Anthropic
// would cost money, need a key on every runner, and assert on a
// non-deterministic answer.

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

// The permanent half of the fake-secret binding in vitest.config.ts. Without an
// assertion here, deleting `FAKE_SECRETS` from that file reddens nothing — and
// the failure it prevents is invisible by construction: the suite would run
// against a developer's REAL key from .dev.vars and stay green in CI, where no
// such file exists. `onUnhandledRequest: "error"` now stops a missed mock
// reaching Anthropic at all; this stays because it holds the other end, for
// whatever gets past the mock rather than around it.
describe("the suite's own credentials", () => {
  it("holds a fake key, never the one in .dev.vars", () => {
    expect(env.ANTHROPIC_API_KEY).toBe("sk-ant-not-a-real-key")
    expect(env.ANTHROPIC_API_KEY).not.toMatch(/^sk-ant-api/)
  })
})

describe("who may ask", () => {
  it("refuses a request carrying no session", async () => {
    // The abuse control, and the reason EDITOR-54's Turnstile requirement was
    // re-derived: this route spends real money per call, so the identity that
    // can be rate-limited and quota'd is the point. Turnstile would prove a
    // human was present once and say nothing about the hundredth request.
    expect((await ask("a react app")).status).toBe(401)
  })
})

const MESSAGES_URL = "https://api.anthropic.com/v1/messages"

// The model, answering whatever a case hands it.
//
// The resolver is a spy, so "the model was never asked" stays a call-count
// assertion rather than becoming an absence — and the absence is covered too:
// `vitest.setup.ts` starts msw holding no handlers with
// `onUnhandledRequest: "error"`, so a case that forgot to install this one
// would fail on the outbound call instead of making it. That is the failure
// worth catching here, because the one it used to have was silent — a missed
// stub reached Anthropic for real and billed for it.
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

// One character past the route's own cap, written out rather than imported.
// A test that reads the very constant the guard compares against cannot fail
// when that constant moves, because both halves move together — the reason
// `e2e/pages/constants.ts` mirrors the editor's copy instead of importing it.
const PAST_THE_CAP = "x".repeat(601)

// What `COMPOSE_CALLS` allows in a minute, from wrangler.jsonc's binding.
const COMPOSE_LIMIT = 10

describe("what may be asked", () => {
  it("refuses a sentence long enough to be a payload rather than a prompt", async () => {
    const { cookie } = await seedSession(env)
    const model = answerWith({ skillIds: [], reason: "" })

    const response = await signedIn(cookie, PAST_THE_CAP)

    expect(response.status).toBe(400)
    // EDITOR-69. THE FIXTURE RATHER THAN THE LITERAL, and the opposite call
    // from `PAST_THE_CAP` above for the opposite reason. The cap is this
    // worker's own number and nobody else's, so importing it would let both
    // halves of that assertion move together. This body is a DISCRIMINATOR the
    // editor reads: `refusalFor` in apps/editor/src/lib/api/compose.ts compares
    // against its own copy of these bytes to tell a sentence past the cap from
    // an empty one, because the route spends one 400 on both guards.
    //
    // So a literal written out here is a fourth unlinked copy, and it is the
    // one that makes the other three unfalsifiable: a rename touches the guard
    // and the assertion beside it — which is the shape a rename actually takes
    // — and leaves this suite, the editor's and this package's own all green
    // while the shipped editor reverts to "The model did not answer. Nothing
    // changed." for an over-long sentence and pages `reportIssue` for a request
    // that cost nothing. Pointing this at `COMPOSE_TOO_LONG_BODY` closes that:
    // the fixture has to move too, and moving it reddens the editor's spec,
    // which stands in front of the copy in its production code. It is the same
    // link `UNAUTHORIZED_BODY` already gives the 401 below.
    expect(await response.json()).toStrictEqual(COMPOSE_TOO_LONG_BODY)
    expect(model).not.toHaveBeenCalled()
  })

  /**
   * EDITOR-69. A REFUSAL MAY NOT SPEND WHAT IT REFUSED TO USE.
   *
   * The limiter ran above the length guard, so every over-long attempt burned a
   * slot it never reached the model with — and a visitor who pasted a long
   * paragraph a few times was then told "too many requests", which is a second
   * wrong message caused by the first. Neither sentence described what had
   * happened.
   *
   * The allowance is keyed by user id and `seedSession` mints a fresh person per
   * call, so this case spends nobody else's — see that fixture's own note.
   */
  it("spends no allowance on a sentence it refuses for length", async () => {
    const { cookie } = await seedSession(env)
    const model = answerWith({ skillIds: [], reason: "because" })

    // Past the whole minute's allowance, so an ordinary sentence after them can
    // only get through if none of them was counted.
    for (let attempt = 0; attempt <= COMPOSE_LIMIT; attempt++) {
      expect((await signedIn(cookie, PAST_THE_CAP)).status).toBe(400)
    }

    expect((await signedIn(cookie, "a react app")).status).toBe(200)
    expect(model).toHaveBeenCalledOnce()
  })

  // The other side of it, and the half that makes the case above a REORDERING
  // rather than a removal: what does reach the model is still counted, so the
  // spend this limiter exists to bound is bounded exactly as before.
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
  // Read off the catalogue rather than written down, because an id that is
  // deleted or renamed would otherwise make this test assert about a skill
  // nothing has.
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

  // EDITOR-60. A model that names one skill twice used to be passed straight
  // through, and the editor's proposal then drew two rows for it — applying
  // them toggled the skill on and straight back off, so a proposal reading
  // "2 changes" changed nothing.
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
  // ONE SHAPE ACROSS EVERY GUARDED ROUTE. `authenticated` answers with the
  // same body whatever it wraps, so a route declaring a looser 401 than the
  // one it can actually produce tells the editor's generated client that
  // `error` is any string — and the editor then writes a branch for a body
  // that cannot arrive.
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
