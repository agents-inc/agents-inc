import { SELF, env } from "cloudflare:test"
import {
  COMPOSE_TOO_LONG_BODY,
  NO_CONFIG_BODY,
  UNREADABLE_CONFIG_BODY,
  seedPayload,
} from "@workspace/api-mocks/fixtures"
import { SEED_VERSION } from "@workspace/matrix/seed"
import { hc } from "hono/client"
import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { upstreamMock } from "../vitest.setup"
import { seedSession } from "./db/seed-session"

import type { SeedPayload } from "@workspace/matrix/seed"
import type { AppType } from "./index"

// These run against the real worker in the real runtime, so they cover the
// whole contract a client sees: status codes, idempotent ids, CORS, and the
// round trip.

const BASE = "https://api.test"

// The canonical configuration, from the shared fixture rather than written out
// again here. The copy this replaced restated every field the suite does not
// exercise — the version as a bare `5`, the project-scoped skill, the sub-agent
// pinned so that skill can reach it — each free to drift from the contract and
// from the payload both of apps/editor's suites read. The builder parses itself
// with `seedPayloadSchema`, so drift fails at import rather than as a 400 in
// whichever assertion happens to provoke one.
//
// `stackId` is the one field every spec here overrides: the default is `null`,
// and a round trip reading back `null` cannot tell a value that survived from
// one that was never sent. The specs about the store's scope rule override
// `skills` and `agents` as well, because those two fields ARE that rule's
// subject — see `PROJECT_SKILL_ON_WEB_DEVELOPER`.
const payload = (overrides: Partial<SeedPayload> = {}) =>
  seedPayload({ stackId: "next", ...overrides })

const WEB_DEVELOPER = "web-developer"

// The pair the store's scope rule is about: a project-scoped skill assigned to
// `web-developer`. Stated here rather than inherited from the shared fixture,
// which happens to hold the same pair today — a refusal whose cause sits in
// another package's defaults goes on passing, or starts failing, for a reason
// nobody reading the spec can see.
const PROJECT_SKILL_ON_WEB_DEVELOPER: SeedPayload["skills"] = {
  "web-framework-react": {
    install: "plugin",
    scope: "project",
    assignments: { [WEB_DEVELOPER]: "preloaded" },
  },
}

const post = (body: unknown) =>
  SELF.fetch(`${BASE}/configs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

describe("POST /configs", () => {
  it("stores a valid payload and returns its short id", async () => {
    const response = await post(payload())

    expect(response.status).toBe(201)
    const { id } = await response.json<{ id: string }>()
    expect(id).toHaveLength(8)
  })

  it("mints the same id for the same payload", async () => {
    const first = await post(payload())
    const second = await post(payload())

    const [a, b] = await Promise.all([
      first.json<{ id: string }>(),
      second.json<{ id: string }>(),
    ])
    expect(a.id).toBe(b.id)
  })

  it("rejects a body that is not a seed payload", async () => {
    const response = await post({ v: SEED_VERSION, skills: "not-a-record" })
    expect(response.status).toBe(400)
  })

  // The one refusal on this route a caller can do something about, and the
  // reason it needs a status of its own. The writer here is a long-lived
  // browser tab: it mints the version it was BUILT with, its own bundled schema
  // accepts that, and a worker deployed since refuses it — forever, identically,
  // on every click. Folded into the 400 above it is indistinguishable from a
  // malformed body, which is what let this reach the tracker as a console
  // screenshot rather than as something the app said.
  it("answers a payload minted by an older build with 409, not a generic 400", async () => {
    const response = await post({ ...payload(), v: SEED_VERSION - 1 })

    expect(response.status).toBe(409)
  })

  // A version this worker has never served is the same situation seen from the
  // other side — a tab built against a bump that has not deployed yet — and
  // wants the same answer, so the rule is "not our version" rather than "older".
  it("answers a payload from a version it has never served the same way", async () => {
    const response = await post({ ...payload(), v: SEED_VERSION + 1 })

    expect(response.status).toBe(409)
  })

  // The status is only half of it: nothing downstream can turn `409` into words
  // on its own, and a caller reading the body by hand is the person who needs
  // the sentence most.
  it("names reloading as the fix in the body it sends", async () => {
    const response = await post({ ...payload(), v: SEED_VERSION - 1 })

    expect(await response.text()).toContain("Reload")
  })

  // The control. Without it, a rule that answered 409 for every refusal would
  // pass all three assertions above — and the whole point is that the two are
  // told apart.
  it("keeps 400 for a body that is malformed at the current version", async () => {
    const response = await post({ ...payload(), skills: "not-a-record" })

    expect(response.status).toBe(400)
  })

  // Well past `MAX_BODY_BYTES`, which is sized for a payload carrying several
  // external skills' whole directories — the largest real one measures 84 KB.
  const OVERSIZED_FIELD_CHARS = 1_200_000

  // The store is where a bad link stops being one person's mistake and becomes
  // an address other people paste. A project-scoped skill assigned to a
  // sub-agent resting at global scope has nowhere to be written on whoever
  // installs it, so minting an id for one produces a link that fails at the
  // recipient — worse than no link at all.
  it("refuses a project skill assigned to a sub-agent resting at global", async () => {
    const response = await post(
      payload({
        skills: PROJECT_SKILL_ON_WEB_DEVELOPER,
        agents: { [WEB_DEVELOPER]: {} },
      })
    )

    expect(response.status).toBe(400)
  })

  // The control for the refusal above, differing from it in the sub-agent's
  // scope and nothing else. Both outcomes leave KV untouched from outside, so a
  // refusal pinned on its own cannot tell a rule that fires on the pair from
  // one that has swallowed every payload.
  it("stores the same configuration once the sub-agent is pinned", async () => {
    const response = await post(
      payload({
        skills: PROJECT_SKILL_ON_WEB_DEVELOPER,
        agents: { [WEB_DEVELOPER]: { scope: "project" } },
      })
    )

    expect(response.status).toBe(201)
  })

  it("refuses an oversized body before parsing it", async () => {
    const oversized = {
      ...payload(),
      matrixVersion: "x".repeat(OVERSIZED_FIELD_CHARS),
    }

    const response = await post(oversized)
    expect(response.status).toBe(413)
  })

  // The reason the cap moved. A skill added from outside the catalogue travels
  // its whole directory inline, which is tens of KB against the ~2 KB the rest
  // of a payload weighs — so the old 32 KB cap refused one external skill.
  it("stores a payload carrying an external skill's directory", async () => {
    const withContent: SeedPayload = {
      ...payload(),
      external: {
        "external-web-framework-house": {
          displayName: "House",
          description: "The house framework skill.",
          categoryId: "web-framework",
          repo: "acme/skills",
          path: "skills/house",
          files: { "SKILL.md": "# House\n".repeat(4000) },
        },
      },
    }

    const response = await post(withContent)

    expect(response.status).toBe(201)
  })
})

describe("GET /configs/:id", () => {
  it("returns the stored payload unchanged, marked immutable", async () => {
    const created = await post(payload())
    const { id } = await created.json<{ id: string }>()

    const response = await SELF.fetch(`${BASE}/configs/${id}`)

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toContain("immutable")
    expect(await response.json()).toEqual(payload())
  })

  // The body as well as the status, and against the constant packages/api-mocks
  // serves rather than a literal restated here. That package mirrors this
  // worker's refusals so the editor's suites assert on what really arrives, and
  // nothing held the mirror to the worker: a reworded body here would have left
  // every one of those suites green against a sentence the worker had stopped
  // sending. This is the assertion that reddens instead.
  it("404s an unknown id", async () => {
    const response = await SELF.fetch(`${BASE}/configs/unknown1`)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe(NO_CONFIG_BODY)
  })

  // Nothing this worker writes can land here — the POST validates first and the
  // id is the payload's own hash. Writing straight to the binding is how the
  // case becomes reachable at all, and it is worth reaching: without the parse,
  // the route serves arbitrary stored bytes on a response its OpenAPI contract
  // declares to be a seed payload.
  it("500s rather than serving a stored payload that no longer validates", async () => {
    await env.CONFIGS.put(
      "corrupt1",
      JSON.stringify({ v: SEED_VERSION, skills: "no" })
    )

    const response = await SELF.fetch(`${BASE}/configs/corrupt1`)

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(UNREADABLE_CONFIG_BODY)
  })

  it("500s rather than serving stored bytes that are not JSON", async () => {
    await env.CONFIGS.put("corrupt2", "{ not json")

    const response = await SELF.fetch(`${BASE}/configs/corrupt2`)

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(UNREADABLE_CONFIG_BODY)
  })
})

// The editor reaches every route this block calls through `packages/api`'s
// `hc<AppType>` client rather than a hand-written fetch, which makes the
// exported type half of the contract and not a convenience. Running that
// client against the real worker here is what keeps the two halves honest
// about each other: a route that stops being chained onto the exported app
// disappears from the client's surface and this block stops compiling, and a
// body that drifts from what the route declares fails an assertion that no
// cast is standing in front of.
describe("the typed client the editor uses", () => {
  const client = hc<AppType>(BASE, { fetch: SELF.fetch.bind(SELF) })

  const createConfig = () => client.configs.$post({ json: payload() })

  it("mints an id whose type comes from the route, not from a cast", async () => {
    const response = await createConfig()

    expect(response.status).toBe(201)
    if (!response.ok) throw new Error("the store refused a valid payload")

    const { id } = await response.json()
    expect(id).toHaveLength(8)
  })

  it("round-trips a payload the client reads back as a seed payload", async () => {
    const created = await createConfig()
    if (!created.ok) throw new Error("the store refused a valid payload")
    const { id } = await created.json()

    const response = await client.configs[":id"].$get({ param: { id } })

    expect(response.status).toBe(200)
    if (!response.ok) throw new Error("the store lost a payload it just took")
    expect(await response.json()).toEqual(payload())
  })

  // The one failure the editor treats as ordinary rather than reportable, so
  // it is the one status the client has to be able to tell apart.
  it("404s an unknown id", async () => {
    const response = await client.configs[":id"].$get({
      param: { id: "unknown1" },
    })

    expect(response.status).toBe(404)
  })

  const signedIn = async () => {
    const { cookie } = await seedSession(env)
    return hc<AppType>(BASE, {
      fetch: SELF.fetch.bind(SELF),
      headers: { cookie },
    })
  }

  const STACK = { name: "mine", configId: "abcd1234" }

  it("saves a stack and lists it back", async () => {
    const { stacks } = await signedIn()

    const saved = await stacks.$post({ json: STACK })
    expect(saved.status).toBe(201)
    if (!saved.ok) throw new Error("the worker refused a signed-in save")
    const { id } = await saved.json()

    const listed = await stacks.$get()
    if (!listed.ok) throw new Error("the worker refused a signed-in list")
    expect((await listed.json()).map((stack) => stack.id)).toEqual([id])
  })

  // The status `createStack` and `composeProposal` read as signed out rather
  // than as a refusal.
  it("answers a request with no session 401", async () => {
    const save = await client.stacks.$post({ json: STACK })
    const compose = await client.compose.$post({ json: { sentence: "a" } })

    expect([save.status, compose.status]).toEqual([401, 401])
  })

  it("hands back the model's proposal", async () => {
    const proposal = { skillIds: [], reason: "because" }
    upstreamMock.use(
      http.post("https://api.anthropic.com/v1/messages", () =>
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
    )

    const { compose } = await signedIn()

    const response = await compose.$post({ json: { sentence: "a react app" } })

    expect(response.status).toBe(200)
    if (!response.ok) throw new Error("the worker refused a signed-in sentence")
    expect(await response.json()).toEqual(proposal)
  })

  // `refusalFor` in apps/editor/src/lib/api/compose.ts tells this 400 from an
  // empty sentence's by the body alone.
  it("names the guard that refused an over-long sentence", async () => {
    const { compose } = await signedIn()

    const response = await compose.$post({
      json: { sentence: "x".repeat(601) },
    })

    expect(response.status).toBe(400)
    expect(await response.json()).toStrictEqual(COMPOSE_TOO_LONG_BODY)
  })
})

describe("CORS", () => {
  it("admits the configured web origin", async () => {
    const response = await SELF.fetch(`${BASE}/configs`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "POST",
      },
    })

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173"
    )
  })

  it("does not admit any other origin", async () => {
    const response = await SELF.fetch(`${BASE}/configs`, {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    })

    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  // The class, not one status. A refusal a browser cannot READ is a refusal
  // that reaches the app as a network error, so every answer this route can
  // give has to carry the header — and a refusal produced by middleware ahead
  // of the handler (the size cap) or *inside* the validator (the version
  // mismatch) is exactly where that is easy to lose. Listed as bodies rather
  // than as statuses so each row provokes its own answer for real.
  const REFUSED_BODIES = {
    "malformed at the current version": { v: SEED_VERSION, skills: "no" },
    "minted by another build": { ...payload(), v: SEED_VERSION - 1 },
    "a project skill on a globally-scoped sub-agent": payload({
      skills: PROJECT_SKILL_ON_WEB_DEVELOPER,
      agents: { [WEB_DEVELOPER]: {} },
    }),
  }

  it.each(Object.entries(REFUSED_BODIES))(
    "lets the web app read a refusal of a body %s",
    async (_description, body) => {
      const response = await SELF.fetch(`${BASE}/configs`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:5173",
        },
        body: JSON.stringify(body),
      })

      expect(response.ok).toBe(false)
      expect(response.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:5173"
      )
    }
  )
})

// The tunnel exists so browser tracking prevention cannot silently drop error
// reports. What makes it worth testing is the guard: an endpoint that forwards
// whatever it is handed is an open relay into any Sentry account, paid for by
// this worker's quota.
describe("POST /monitoring", () => {
  const INGEST = "o4509197991346176.ingest.de.sentry.io"
  const PROJECT = "4511832531796048"

  const envelope = (dsn: string) =>
    `${JSON.stringify({ event_id: "abc", dsn })}\n{"type":"event"}\n{}`

  const tunnel = (body: string) =>
    SELF.fetch(`${BASE}/monitoring`, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope" },
      body,
    })

  it("refuses an envelope addressed to another project", async () => {
    const response = await tunnel(
      envelope(`https://key@${INGEST}/9999999999999999`)
    )

    expect(response.status).toBe(403)
  })

  it("refuses an envelope addressed to another host", async () => {
    const response = await tunnel(
      envelope(`https://key@evil.example/${PROJECT}`)
    )

    expect(response.status).toBe(403)
  })

  it("refuses a body that is not an envelope", async () => {
    expect((await tunnel("not an envelope")).status).toBe(400)
  })

  it("refuses an envelope whose header carries no dsn", async () => {
    const response = await tunnel(`${JSON.stringify({ event_id: "abc" })}\n{}`)

    expect(response.status).toBe(400)
  })

  // The relay itself, which every case above stops short of.
  it("relays an envelope addressed to this project", async () => {
    const sentry = vi.fn(() => new HttpResponse(null, { status: 200 }))
    upstreamMock.use(
      http.post(`https://${INGEST}/api/${PROJECT}/envelope/`, sentry)
    )

    const response = await tunnel(envelope(`https://key@${INGEST}/${PROJECT}`))

    expect(response.status).toBe(200)
    expect(sentry).toHaveBeenCalledTimes(1)
  })
})
