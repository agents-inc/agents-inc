import { SELF } from "cloudflare:test"
import { describe, expect, it } from "vitest"

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
const payload = () => ({
  v: 3,
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
    const response = await post({ v: 3, skills: "not-a-record" })
    expect(response.status).toBe(400)
  })

  it("refuses an oversized body before parsing it", async () => {
    const oversized = {
      ...payload(),
      matrixVersion: "x".repeat(40_000),
    }

    const response = await post(oversized)
    expect(response.status).toBe(413)
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
