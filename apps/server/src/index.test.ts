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

const BASE = "https://api.test"

// Specs override `stackId`, since a round trip of the default `null` proves
// nothing.
const payload = (overrides: Partial<SeedPayload> = {}) =>
  seedPayload({ stackId: "next", ...overrides })

const WEB_DEVELOPER = "web-developer"

// Stated here rather than inherited from the shared fixture, so the refusal's
// cause is visible in the spec.
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

  // A stale browser tab: a reload fixes it, so it needs its own status.
  it("answers a payload minted by an older build with 409, not a generic 400", async () => {
    const response = await post({ ...payload(), v: SEED_VERSION - 1 })

    expect(response.status).toBe(409)
  })

  // "Not our version", not "older".
  it("answers a payload from a version it has never served the same way", async () => {
    const response = await post({ ...payload(), v: SEED_VERSION + 1 })

    expect(response.status).toBe(409)
  })

  it("names reloading as the fix in the body it sends", async () => {
    const response = await post({ ...payload(), v: SEED_VERSION - 1 })

    expect(await response.text()).toContain("Reload")
  })

  // The control: a malformed body still gets 400.
  it("keeps 400 for a body that is malformed at the current version", async () => {
    const response = await post({ ...payload(), skills: "not-a-record" })

    expect(response.status).toBe(400)
  })

  const OVERSIZED_FIELD_CHARS = 1_200_000

  // Such a link would fail at every recipient.
  it("refuses a project skill assigned to a sub-agent resting at global", async () => {
    const response = await post(
      payload({
        skills: PROJECT_SKILL_ON_WEB_DEVELOPER,
        agents: { [WEB_DEVELOPER]: {} },
      })
    )

    expect(response.status).toBe(400)
  })

  // The control: differs only in the sub-agent's scope.
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

  // An external skill travels its whole directory inline.
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

  // Against the api-mocks constant, so its mirror of this body cannot drift.
  it("404s an unknown id", async () => {
    const response = await SELF.fetch(`${BASE}/configs/unknown1`)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe(NO_CONFIG_BODY)
  })

  // Written straight to the binding: no worker write can produce this.
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

// Through the `hc<AppType>` client the editor uses, so a route dropped from
// the exported type stops this compiling.
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

  // The editor treats this one as ordinary, so the client must tell it apart.
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

  // Every answer, including middleware and validator refusals, must carry the
  // header or the browser sees a network error.
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

// The DSN guard keeps the tunnel from being an open relay.
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
