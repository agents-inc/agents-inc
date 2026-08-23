import { SELF, env } from "cloudflare:test"
import { SEED_VERSION } from "@workspace/matrix/seed"
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
    // Pinned into the project, and load-bearing rather than flavour: the skill
    // above is project-scoped, and a project skill never reaches a sub-agent
    // whose front-matter is written to ~/.claude. Without the pin this is a
    // payload the wire now refuses, which is not what the canonical "a valid
    // configuration" fixture should be.
    "web-developer": { model: "haiku", effort: "max", scope: "project" },
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
    const response = await post({
      ...payload(),
      agents: { "web-developer": { model: "haiku", effort: "max" } },
    })

    expect(response.status).toBe(400)
  })

  // The control for the refusal above. Both outcomes leave KV untouched from
  // outside, so a refusal pinned on its own cannot tell a rule that fires on
  // the pair from one that has swallowed every payload.
  it("stores the same configuration once the sub-agent is pinned", async () => {
    const response = await post(payload())

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

  // The class, not one status. A refusal a browser cannot READ is a refusal
  // that reaches the app as a network error, so every answer this route can
  // give has to carry the header — and a refusal produced by middleware ahead
  // of the handler (the size cap) or *inside* the validator (the version
  // mismatch) is exactly where that is easy to lose. Listed as bodies rather
  // than as statuses so each row provokes its own answer for real.
  const REFUSED_BODIES = {
    "malformed at the current version": { v: SEED_VERSION, skills: "no" },
    "minted by another build": { ...payload(), v: SEED_VERSION - 1 },
    "a project skill on a globally-scoped sub-agent": {
      ...payload(),
      agents: { "web-developer": { model: "haiku", effort: "max" } },
    },
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
})
