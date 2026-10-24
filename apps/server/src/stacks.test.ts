import { SELF, env } from "cloudflare:test"
import {
  CONFIG_WRITE_WINDOW_SECONDS,
  NO_STACK_BODY,
  RATE_LIMITED_BODY,
  WORKER_EXPOSED_HEADERS,
} from "@workspace/api-mocks/fixtures"
import { SEED_VERSION } from "@workspace/matrix/seed"
import { afterEach, describe, expect, it, vi } from "vitest"

import { seedSession } from "./db/seed-session"

// The OAuth round trip is not testable here (the editor's Playwright suite
// covers it); `seedSession` supplies a signed-in caller.

const BASE = "https://api.test"
const WEB_ORIGIN = "http://localhost:5173"

const GUARDED = [
  { method: "GET", path: "/stacks" },
  { method: "POST", path: "/stacks" },
  { method: "PATCH", path: "/stacks/abc123" },
  { method: "DELETE", path: "/stacks/abc123" },
] as const

// `clearMocks` does not restore a spy.
afterEach(() => {
  vi.restoreAllMocks()
})

describe("the auth handler", () => {
  it("is mounted, and answers a session request from a browser with no cookie", async () => {
    const response = await SELF.fetch(`${BASE}/api/auth/get-session`, {
      headers: { origin: WEB_ORIGIN },
    })

    // Not 404: the handler is mounted.
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })
})

describe("the stack routes", () => {
  for (const { method, path } of GUARDED) {
    it(`${method} ${path} refuses a request carrying no session`, async () => {
      const response = await SELF.fetch(`${BASE}${path}`, {
        method,
        headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
        ...(method === "GET" || method === "DELETE"
          ? {}
          : { body: JSON.stringify({ name: "mine", configId: "abcd1234" }) }),
      })

      // 401, not 403: the editor answers it with a sign-in control.
      expect(response.status).toBe(401)
    })
  }
})

describe("cookies can cross from the editor to the worker", () => {
  // Without `Access-Control-Allow-Credentials` the browser silently drops the
  // cookie.
  for (const path of ["/stacks", "/configs", "/api/auth/get-session"]) {
    it(`${path} tells the browser it may hold the session cookie`, async () => {
      const response = await SELF.fetch(`${BASE}${path}`, {
        headers: { origin: WEB_ORIGIN },
      })

      expect(response.headers.get("access-control-allow-origin")).toBe(
        WEB_ORIGIN
      )
      expect(response.headers.get("access-control-allow-credentials")).toBe(
        "true"
      )
    })
  }
})

describe("the GitHub token never leaves the worker", () => {
  // The account row holds a GitHub token; it must never reach the browser.
  // The positive half proves the body is this person's session.
  it("is absent from the session a browser can read", async () => {
    const { cookie, githubAccessToken, email } = await seedSession(env)

    const response = await SELF.fetch(`${BASE}/api/auth/get-session`, {
      headers: { origin: WEB_ORIGIN, cookie },
    })
    const body = await response.text()

    expect(body).toContain(email)
    expect(body).not.toContain(githubAccessToken)
    expect(body).not.toMatch(/accessToken/i)
  })
})

describe("the write rate limit on POST /configs", () => {
  // Each case brings its own `cf-connecting-ip`; the pool shares state across a
  // file, so a shared key would make these order-dependent. `caller` is every
  // other header, which is the caller's to choose.
  const post = (
    ip: string,
    caller: Record<string, string> = { origin: WEB_ORIGIN }
  ) =>
    SELF.fetch(`${BASE}/configs`, {
      method: "POST",
      headers: {
        ...caller,
        "content-type": "application/json",
        "cf-connecting-ip": ip,
      },
      // Not a valid payload: the limit runs before the body is parsed.
      body: JSON.stringify({ v: SEED_VERSION }),
    })

  // One write per key, however the worker spells its keys.
  const allowOneWritePerKey = () => {
    const spent = new Set<string>()
    vi.spyOn(env.CONFIG_WRITES, "limit").mockImplementation(({ key }) => {
      const success = !spent.has(key)
      spent.add(key)
      return Promise.resolve({ success })
    })
  }

  // Stubbed: the binding's own window is the wall clock's minute, which a
  // burst cannot be held inside.
  it("lets a write through while the limiter allows it, and refuses one it turns down", async () => {
    vi.spyOn(env.CONFIG_WRITES, "limit")
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false })
    const ip = "203.0.113.10"

    expect((await post(ip)).status).not.toBe(429)
    expect((await post(ip)).status).toBe(429)
  })

  it("limits each address apart, so one refused address leaves another let through", async () => {
    allowOneWritePerKey()
    const refusedAddress = "203.0.113.20"

    expect((await post(refusedAddress)).status).not.toBe(429)
    expect((await post(refusedAddress)).status).toBe(429)
    expect((await post("203.0.113.21")).status).not.toBe(429)
  })

  // The limit is per address. A key that also read the cookie or the user
  // agent would let any caller past it by changing a header.
  it("counts two callers at one address together, whatever else their requests carry", async () => {
    allowOneWritePerKey()
    const { cookie } = await seedSession(env)
    const signedInEditor = {
      origin: WEB_ORIGIN,
      cookie,
      "user-agent": "Mozilla/5.0",
    }
    const cli = { "user-agent": "agents-inc-cli" }
    const sharedAddress = "203.0.113.22"

    expect((await post(sharedAddress, signedInEditor)).status).not.toBe(429)
    expect((await post(sharedAddress, cli)).status).toBe(429)
    expect((await post("203.0.113.23", cli)).status).not.toBe(429)
  })

  // `retry-after` must also be exposed to a cross-origin reader. Pinned against
  // the api-mocks mirror.
  it("tells the refused caller when to try again, in a header a browser may read", async () => {
    vi.spyOn(env.CONFIG_WRITES, "limit").mockResolvedValueOnce({
      success: false,
    })

    const refused = await post("203.0.113.30")

    expect(refused.status).toBe(429)
    expect(await refused.text()).toBe(RATE_LIMITED_BODY)
    expect(refused.headers.get("retry-after")).toBe(
      String(CONFIG_WRITE_WINDOW_SECONDS)
    )
    expect(refused.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN)
    expect(refused.headers.get("access-control-expose-headers")).toBe(
      WORKER_EXPOSED_HEADERS
    )
  })

  // Spied rather than spent: the limiter's window is the wall clock's minute.
  it("spends no allowance on a read, and one on a write", async () => {
    const ip = "203.0.113.40"
    const limit = vi.spyOn(env.CONFIG_WRITES, "limit")

    await SELF.fetch(`${BASE}/configs`, {
      headers: { origin: WEB_ORIGIN, "cf-connecting-ip": ip },
    })
    expect(limit).not.toHaveBeenCalled()

    await post(ip)
    expect(limit).toHaveBeenCalledOnce()
  })
})

const call = (cookie: string, path: string, init: RequestInit = {}) =>
  SELF.fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      origin: WEB_ORIGIN,
      "content-type": "application/json",
      cookie,
    },
  })

const save = (cookie: string, name: string) =>
  call(cookie, "/stacks", {
    method: "POST",
    body: JSON.stringify({ name, configId: "abcd1234" }),
  })

const listNames = async (cookie: string) => {
  const response = await call(cookie, "/stacks")
  const rows = await response.json<{ name: string }[]>()
  return rows.map((row) => row.name)
}

// `updatedAt` has millisecond resolution; waiting avoids a tie.
const tick = async () => {
  const started = Date.now()
  while (Date.now() === started) {
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

describe("a person's own stacks", () => {
  it("starts empty and holds what was saved", async () => {
    const { cookie } = await seedSession(env)

    expect(await listNames(cookie)).toEqual([])

    const saved = await save(cookie, "my stack")
    expect(saved.status).toBe(201)

    expect(await listNames(cookie)).toEqual(["my stack"])
  })

  // Per route, since the projection is applied per route.
  it("never puts the owner column on the wire", async () => {
    const { cookie, userId } = await seedSession(env)

    const saved = await save(cookie, "my stack")
    const { id } = await saved.clone().json<{ id: string }>()
    const renamed = await call(cookie, `/stacks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "my stack, renamed" }),
    })
    const listed = await call(cookie, "/stacks")

    for (const response of [saved, renamed, listed]) {
      // The id, not the key name, catches the owner under any spelling.
      expect(await response.text()).not.toContain(userId)
    }
  })

  it("lists newest first", async () => {
    const { cookie } = await seedSession(env)

    await save(cookie, "older")
    await tick()
    await save(cookie, "newer")

    expect(await listNames(cookie)).toEqual(["newer", "older"])
  })

  it("renames a stack", async () => {
    const { cookie } = await seedSession(env)

    const saved = await save(cookie, "first name")
    const { id } = await saved.json<{ id: string }>()

    const renamed = await call(cookie, `/stacks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "second name" }),
    })

    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ id, name: "second name" })
    expect(await listNames(cookie)).toEqual(["second name"])
  })

  it("deletes a stack, and says the same about an id that never existed", async () => {
    const { cookie } = await seedSession(env)

    const saved = await save(cookie, "going")
    const { id } = await saved.json<{ id: string }>()

    expect(
      (await call(cookie, `/stacks/${id}`, { method: "DELETE" })).status
    ).toBe(204)
    expect(await listNames(cookie)).toEqual([])

    expect(
      (await call(cookie, "/stacks/never-existed", { method: "DELETE" })).status
    ).toBe(204)
  })

  it("saves a name without the spaces around it", async () => {
    const { cookie } = await seedSession(env)

    await save(cookie, "  padded  ")

    expect(await listNames(cookie)).toEqual(["padded"])
  })

  // The refusal beside the case above: nothing is left once trimmed.
  it("refuses a name that is only spaces", async () => {
    const { cookie } = await seedSession(env)

    const saved = await save(cookie, "   ")

    expect(saved.status).toBe(400)
    expect(await listNames(cookie)).toEqual([])
  })
})

describe("one person's stacks are nobody else's", () => {
  it("hides them from another person's list", async () => {
    const mine = await seedSession(env)
    const theirs = await seedSession(env)

    await save(mine.cookie, "mine")

    expect(await listNames(theirs.cookie)).toEqual([])
  })

  it("answers 404 rather than 403 when somebody else renames one", async () => {
    const mine = await seedSession(env)
    const theirs = await seedSession(env)

    const saved = await save(mine.cookie, "mine")
    const { id } = await saved.json<{ id: string }>()

    const attempt = await call(theirs.cookie, `/stacks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "theirs now" }),
    })

    // Don't confirm another person's stack exists.
    expect(attempt.status).toBe(404)
    expect(await listNames(mine.cookie)).toEqual(["mine"])
  })

  // Against the api-mocks constant, so its mirror of this body cannot drift.
  it("says only that it found nothing when somebody else renames one", async () => {
    const mine = await seedSession(env)
    const theirs = await seedSession(env)
    const saved = await save(mine.cookie, "mine")
    const { id } = await saved.json<{ id: string }>()

    const attempt = await call(theirs.cookie, `/stacks/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: "theirs now" }),
    })

    expect(await attempt.json()).toStrictEqual(NO_STACK_BODY)
  })

  it("leaves the row where it is when somebody else deletes it", async () => {
    const mine = await seedSession(env)
    const theirs = await seedSession(env)

    const saved = await save(mine.cookie, "mine")
    const { id } = await saved.json<{ id: string }>()

    expect(
      (await call(theirs.cookie, `/stacks/${id}`, { method: "DELETE" })).status
    ).toBe(204)
    expect(await listNames(mine.cookie)).toEqual(["mine"])
  })
})
