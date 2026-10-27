import { SELF, env } from "cloudflare:test"
import {
  COMPOSE_TOO_LONG_BODY,
  NO_CONFIG_BODY,
  STACK_NAME_TAKEN_BODY,
  STORE_REFUSED_BODY,
  UNREADABLE_CONFIG_BODY,
  seedPayload,
} from "@workspace/api-mocks/fixtures"
import { SEED_VERSION } from "@workspace/matrix/seed"
import { hc } from "hono/client"
import { encodeBase64, encodeBase64Url } from "hono/utils/encode"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

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

const ID_LENGTH = 8

// Written out rather than imported, so moving the cap reddens these.
const BODY_CAP_BYTES = 1_048_576

const sha256 = (text: string) =>
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))

const storedUnderItsId = async (body: SeedPayload) => {
  const response = await post(body)
  const { id } = await response.json<{ id: string }>()
  const stored = await env.CONFIGS.get(id)
  if (stored === null) throw new Error("the worker named a key it never wrote")
  return { id, stored }
}

// Both characters a URL cannot carry.
const URL_UNSAFE_PAIR = /\+\//

const PROBE_STACK_ID = "url-unsafe-probe"

// Seven places for the pair, each 1 in 64²: about one id in 585 qualifies, so
// finding none in this many is a fault rather than bad luck.
const CANDIDATE_COUNT = 10_000

/**
 * A stack id whose stored payload hashes to `+/` inside the id. Searched on
 * every run because any change to the stored bytes, a `v` bump included,
 * moves every digest. The body the worker stores for a probe id, with each
 * candidate swapped in, stands for what it would store for that candidate.
 */
const findUrlUnsafeStackId = async () => {
  const { stored } = await storedUnderItsId(
    payload({ stackId: PROBE_STACK_ID })
  )
  const quoted = JSON.stringify(PROBE_STACK_ID)
  if (stored.split(quoted).length !== 2)
    throw new Error(`the stored body does not carry ${quoted} exactly once`)

  for (let n = 0; n < CANDIDATE_COUNT; n += 1) {
    const stackId = `url-unsafe-${String(n)}`
    const digest = await sha256(stored.replace(quoted, JSON.stringify(stackId)))
    if (URL_UNSAFE_PAIR.test(encodeBase64(digest).slice(0, ID_LENGTH)))
      return stackId
  }
  throw new Error(
    `no stack id from url-unsafe-0 to url-unsafe-${String(CANDIDATE_COUNT - 1)} hashes to +/ inside the id`
  )
}

/** Padded so its JSON is exactly `bytes` long. */
const payloadOfLength = (bytes: number) => {
  const unpadded = JSON.stringify(payload({ matrixVersion: "" })).length
  return payload({ matrixVersion: "x".repeat(bytes - unpadded) })
}

const storeFailure = new Error("the store is down")

const STACK = { name: "mine", configId: "abcd1234" }

const CARRIED_ID = "external-web-framework-house"

/**
 * The House skill under the id intake mints, holding `file` beside its SKILL.md. Spread over
 * `payload()` rather than passed to it: the fixture parses, and would refuse an escaping file.
 */
const carryingHouseFile = (file: string): SeedPayload => ({
  ...payload({
    skills: {
      [CARRIED_ID]: { install: "eject", scope: "project", assignments: {} },
    },
  }),
  external: {
    [CARRIED_ID]: {
      displayName: "House",
      description: "The house framework skill.",
      categoryId: "web-framework",
      repo: "acme/skills",
      path: "skills/house",
      files: { "SKILL.md": "# House\n", [file]: "owned\n" },
    },
  },
})

// `clearMocks` does not restore a spy, and these replace console and KV.
afterEach(() => {
  vi.restoreAllMocks()
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

  // The case above is the control: the same skill under the id intake mints.
  it.each([
    ["climbs out of its own folder", "../victim"],
    ["holds a terminal control", "external-x\u001b]0;PWNED\u0007"],
  ])(
    "refuses a carried skill whose id %s, and stores nothing",
    async (_, id) => {
      const put = vi.spyOn(env.CONFIGS, "put")

      const response = await post(
        payload({
          skills: {
            [id]: { install: "eject", scope: "project", assignments: {} },
          },
          external: {
            [id]: {
              displayName: "House",
              description: "The house framework skill.",
              categoryId: "web-framework",
              repo: "acme/skills",
              path: "skills/house",
              files: { "SKILL.md": "# House\n" },
            },
          },
        })
      )

      expect(response.status).toBe(400)
      expect(put).not.toHaveBeenCalled()
    }
  )

  it.each([
    ["climbs out of its folder", "../victim.md"],
    ["climbs out of its folder on Windows", "..\\victim.md"],
  ])(
    "refuses a carried skill whose file %s, and stores nothing",
    async (_, file) => {
      const put = vi.spyOn(env.CONFIGS, "put")

      const response = await post(carryingHouseFile(file))

      expect(response.status).toBe(400)
      expect(put).not.toHaveBeenCalled()
    }
  )

  // The control: the same file kept inside the skill's folder.
  it("stores a carried skill whose file sits in a folder of its own", async () => {
    const response = await post(carryingHouseFile("reference/victim.md"))

    expect(response.status).toBe(201)
  })

  // A `+` or `/` in the id would break the share link the editor builds from it.
  it("names a payload by the base64url SHA-256 of what it stores", async () => {
    const stackId = await findUrlUnsafeStackId()

    const { id, stored } = await storedUnderItsId(payload({ stackId }))
    const digest = await sha256(stored)

    expect(
      encodeBase64(digest).slice(0, ID_LENGTH),
      "the probe's body did not predict what the worker stored"
    ).toMatch(URL_UNSAFE_PAIR)
    expect(id).toBe(encodeBase64Url(digest).slice(0, ID_LENGTH))
  })

  // The control for the oversized refusal: the cap itself is allowed.
  it("stores a body exactly as long as the cap", async () => {
    const response = await post(payloadOfLength(BODY_CAP_BYTES))

    expect(response.status).toBe(201)
  })

  it("says the body was too large when it refuses one", async () => {
    const response = await post(payloadOfLength(BODY_CAP_BYTES + 1))

    expect(response.status).toBe(413)
    expect(await response.text()).toBe("Payload too large")
  })

  // A stale bundle's payload may differ in shape too; reloading still fixes it.
  it("answers 409 to another version's payload even when its shape is wrong as well", async () => {
    const response = await post({
      ...payload(),
      v: SEED_VERSION - 1,
      skills: "not-a-record",
    })

    expect(response.status).toBe(409)
  })

  // Not JSON means no version; a page on any origin can send such a body
  // without a preflight, so storing it would let anyone mint links.
  it("refuses a body not sent as JSON rather than storing it", async () => {
    const response = await SELF.fetch(`${BASE}/configs`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(payload()),
    })

    expect(response.status).toBe(409)
  })

  // Identical content is already there; a write would only spend the quota.
  it("spends no write on a payload it already holds", async () => {
    await post(payload({ stackId: "stored-once" }))
    const put = vi.spyOn(env.CONFIGS, "put")

    const again = await post(payload({ stackId: "stored-once" }))

    expect(again.status).toBe(201)
    expect(put).not.toHaveBeenCalled()
  })

  it("answers 503 and logs the failure when the store refuses the write", async () => {
    vi.spyOn(env.CONFIGS, "put").mockRejectedValueOnce(storeFailure)
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})

    // A payload no earlier run stored, so the worker does try to write it.
    const response = await post(payload({ stackId: crypto.randomUUID() }))

    expect(response.status).toBe(503)
    expect(await response.text()).toBe(STORE_REFUSED_BODY)
    expect(logged).toHaveBeenCalledWith({
      event: "kv_failure",
      operation: "put",
      message: storeFailure.message,
    })
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

  // A link stored before the mint refused such a file.
  it("500s rather than serving a stored payload whose carried file climbs out of its folder", async () => {
    await env.CONFIGS.put(
      "escaping",
      JSON.stringify(carryingHouseFile("../victim.md"))
    )

    const response = await SELF.fetch(`${BASE}/configs/escaping`)

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(UNREADABLE_CONFIG_BODY)
  })

  it("500s rather than serving stored bytes that are not JSON", async () => {
    await env.CONFIGS.put("corrupt2", "{ not json")

    const response = await SELF.fetch(`${BASE}/configs/corrupt2`)

    expect(response.status).toBe(500)
    expect(await response.text()).toBe(UNREADABLE_CONFIG_BODY)
  })

  // The two corrupt cases log distinct reasons, so an operator can tell them apart.
  it("logs the parser's complaint about stored bytes that are not JSON", async () => {
    await env.CONFIGS.put("corrupt3", "half a payload")
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})

    await SELF.fetch(`${BASE}/configs/corrupt3`)
    const unparsable: Record<string, unknown> = {
      event: "corrupt_payload",
      id: "corrupt3",
      message: expect.stringMatching(/not valid JSON/),
    }

    expect(logged).toHaveBeenCalledWith(unparsable)
  })

  it("logs which stored payload no longer validates", async () => {
    await env.CONFIGS.put(
      "corrupt4",
      JSON.stringify({ v: SEED_VERSION, skills: "no" })
    )
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})

    await SELF.fetch(`${BASE}/configs/corrupt4`)
    const invalid: Record<string, unknown> = {
      event: "corrupt_payload",
      id: "corrupt4",
      message: expect.stringContaining("skills"),
    }

    expect(logged).toHaveBeenCalledWith(invalid)
  })

  it("answers 503 and logs the failure when the store refuses the read", async () => {
    vi.spyOn(env.CONFIGS, "get").mockRejectedValueOnce(storeFailure)
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await SELF.fetch(`${BASE}/configs/unknown1`)

    expect(response.status).toBe(503)
    expect(await response.text()).toBe("Could not read this config")
    expect(logged).toHaveBeenCalledWith({
      event: "kv_failure",
      operation: "get",
      message: storeFailure.message,
    })
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

  // A status the route does not declare fails the narrowing at compile time.
  it("tells a save under a name the account holds apart, by a status it declares", async () => {
    const { stacks } = await signedIn()
    await stacks.$post({ json: STACK })

    const again = await stacks.$post({ json: STACK })

    expect(again.status).toBe(409)
    if (again.status !== 409) throw new Error("the worker took a held name")
    expect(await again.json()).toStrictEqual(STACK_NAME_TAKEN_BODY)
  })

  it("tells a rename onto a name the account holds apart, by a status it declares", async () => {
    const { stacks } = await signedIn()
    await stacks.$post({ json: STACK })
    const other = await stacks.$post({ json: { ...STACK, name: "other" } })
    if (!other.ok) throw new Error("the worker refused a signed-in save")
    const { id } = await other.json()

    const renamed = await stacks[":id"].$patch({
      param: { id },
      json: { name: STACK.name },
    })

    expect(renamed.status).toBe(409)
    if (renamed.status !== 409) throw new Error("the worker took a held name")
    expect(await renamed.json()).toStrictEqual(STACK_NAME_TAKEN_BODY)
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

  // A shared link opens through this read, from the editor's origin.
  it("lets the web app read a stored config", async () => {
    const created = await post(payload())
    const { id } = await created.json<{ id: string }>()

    const response = await SELF.fetch(`${BASE}/configs/${id}`, {
      headers: { origin: "http://localhost:5173" },
    })

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173"
    )
  })

  // The refusal beside the read above: CORS covers the routes it serves.
  it("grants the web origin nothing on a path it serves nothing at", async () => {
    const response = await SELF.fetch(`${BASE}/`, {
      headers: { origin: "http://localhost:5173" },
    })

    expect(response.status).toBe(404)
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
  })

  // Each is sent with a content type or method that needs a preflight first.
  const PREFLIGHTED = [
    { method: "PATCH", path: "/stacks/abc123" },
    { method: "DELETE", path: "/stacks/abc123" },
    { method: "POST", path: "/monitoring" },
    { method: "POST", path: "/compose" },
  ]

  it.each(PREFLIGHTED)(
    "admits the web origin's $method to $path",
    async ({ method, path }) => {
      const response = await SELF.fetch(`${BASE}${path}`, {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": method,
        },
      })

      expect(response.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:5173"
      )
    }
  )

  type WebAppCall = {
    method: string
    path: string
    status: number
    headers?: Record<string, string>
    body?: string
  }

  const asJson = (body: unknown) => ({
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })

  // Signed in, so the stack routes answer past their session check.
  const fromTheWebApp = async ({ method, path, headers, body }: WebAppCall) => {
    const { cookie } = await seedSession(env)

    return SELF.fetch(`${BASE}${path}`, {
      method,
      headers: { ...headers, cookie, origin: "http://localhost:5173" },
      body: body ?? null,
    })
  }

  // `/x/*` matches a bare `/x` as well, and each CORS run appends `Origin` to
  // Vary, so a path two mounts cover names it twice.
  const SERVED_TO_THE_WEB_APP: WebAppCall[] = [
    { method: "POST", path: "/configs", ...asJson(payload()), status: 201 },
    { method: "GET", path: "/configs/unknown1", status: 404 },
    { method: "GET", path: "/stacks", status: 200 },
    { method: "POST", path: "/stacks", ...asJson(STACK), status: 201 },
    {
      method: "PATCH",
      path: "/stacks/unknown1",
      ...asJson({ name: "other" }),
      status: 404,
    },
    { method: "DELETE", path: "/stacks/unknown1", status: 204 },
    {
      method: "POST",
      path: "/compose",
      ...asJson({ sentence: "x".repeat(601) }),
      status: 400,
    },
    {
      method: "POST",
      path: "/monitoring",
      headers: { "content-type": "application/x-sentry-envelope" },
      body: "not an envelope",
      status: 400,
    },
    { method: "GET", path: "/api/auth/get-session", status: 200 },
  ]

  it.each(SERVED_TO_THE_WEB_APP)(
    "names the origin once in Vary on the web app's $method to $path",
    async (call) => {
      const response = await fromTheWebApp(call)

      expect(response.status).toBe(call.status)
      expect(response.headers.get("vary")).toBe("Origin")
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

  const relayTo = (status: number) => {
    const sentry = vi.fn(() => new HttpResponse(null, { status }))
    upstreamMock.use(
      http.post(`https://${INGEST}/api/${PROJECT}/envelope/`, sentry)
    )
    return sentry
  }

  // With no line break there is no envelope, however readable the text is.
  it("refuses a lone line, even one holding a readable header", async () => {
    const sentry = relayTo(200)

    const response = await tunnel(
      `${JSON.stringify({ dsn: `https://key@${INGEST}/${PROJECT}` })} `
    )

    expect(response.status).toBe(400)
    expect(sentry).not.toHaveBeenCalled()
  })

  const REFUSALS = [
    {
      body: "a body with no line break",
      envelope: "not an envelope",
      status: 400,
      reason: "Not a readable envelope",
    },
    {
      body: "a header that is not JSON",
      envelope: "not json\n{}",
      status: 400,
      reason: "Not a readable envelope",
    },
    {
      body: "a header with no dsn",
      envelope: `${JSON.stringify({ event_id: "abc" })}\n{}`,
      status: 400,
      reason: "Envelope carries no DSN",
    },
    {
      body: "a dsn naming another project",
      envelope: envelope(`https://key@${INGEST}/9999999999999999`),
      status: 403,
      reason: "Envelope is addressed to another project",
    },
  ]

  it.each(REFUSALS)(
    "says why it refused $body",
    async ({ envelope: refused, status, reason }) => {
      const response = await tunnel(refused)

      expect(response.status).toBe(status)
      expect(await response.text()).toBe(reason)
    }
  )

  // The SDK backs off on Sentry's own refusals, so they must reach it.
  it("hands back the status Sentry answered with", async () => {
    relayTo(429)

    const response = await tunnel(envelope(`https://key@${INGEST}/${PROJECT}`))

    expect(response.status).toBe(429)
  })
})
