import { SELF, env } from "cloudflare:test"
import { hc } from "hono/client"
import { describe, expect, it } from "vitest"

import type { SeedPayload } from "@workspace/matrix/seed"
import type { AppType } from "./index"

// These run against the real worker in the real runtime with a simulated KV
// binding, so they cover the whole contract a client sees: status codes,
// idempotent ids, CORS, and the round trip.

const BASE = "https://api.test"

// The worker deliberately never checks ids against the catalog — that is the
// CLI's warn-and-skip job — so an arbitrary skill id is a valid payload here.
//
// Model and effort belong to the agent, so the skill carries neither and the
// payload has a second map. A pinned-on agent with no skills is expressible
// there, which is why `agents` is not simply derivable from the assignments.
//
// Annotated rather than inferred: a bare literal widens `v` to `number` and
// every enum to `string`, which the typed client below rejects — and rightly,
// since that is the same widening that would let a fixture drift from the
// contract and only say so as a 400 at runtime.
const payload = (): SeedPayload => ({
  v: 5,
  matrixVersion: "1.0.0",
  stackId: "next",
  skills: {
    "web-framework-react": {
      install: "plugin",
      scope: "project",
      assignments: { "web-developer": "preloaded" },
    },
  },
  agents: {
    "web-developer": { model: "haiku", effort: "max" },
    "api-developer": { on: true },
  },
})

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
    const response = await post({ v: 5, skills: "not-a-record" })
    expect(response.status).toBe(400)
  })

  // Well past `MAX_BODY_BYTES`, which is sized for a payload carrying several
  // external skills' whole directories — the largest real one measures 84 KB.
  const OVERSIZED_FIELD_CHARS = 1_200_000

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

  it("404s an unknown id", async () => {
    const response = await SELF.fetch(`${BASE}/configs/unknown1`)
    expect(response.status).toBe(404)
  })

  // Nothing this worker writes can land here — the POST validates first and the
  // id is the payload's own hash. Writing straight to the binding is how the
  // case becomes reachable at all, and it is worth reaching: without the parse,
  // the route serves arbitrary stored bytes on a response its OpenAPI contract
  // declares to be a seed payload.
  it("500s rather than serving a stored payload that no longer validates", async () => {
    await env.CONFIGS.put("corrupt1", JSON.stringify({ v: 5, skills: "no" }))

    const response = await SELF.fetch(`${BASE}/configs/corrupt1`)

    expect(response.status).toBe(500)
  })

  it("500s rather than serving stored bytes that are not JSON", async () => {
    await env.CONFIGS.put("corrupt2", "{ not json")

    const response = await SELF.fetch(`${BASE}/configs/corrupt2`)

    expect(response.status).toBe(500)
  })
})

// apps/editor reaches these two routes through `hc<AppType>` rather than a
// hand-written fetch, which makes the exported type half of the contract and
// not a convenience. Running the editor's own client against the real worker
// here is what keeps the two halves honest about each other: a route that
// stops being chained onto the exported app disappears from the client's
// surface and this block stops compiling, and a body that drifts from what
// the route declares fails an assertion that no cast is standing in front of.
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
})
