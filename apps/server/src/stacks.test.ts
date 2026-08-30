import { SELF, env } from "cloudflare:test"
import { describe, expect, it } from "vitest"

import { seedSession } from "./db/seed-session"

// SERVER-04, written before any of it exists. These run against the real
// worker in the real runtime with a real D1 binding, like every other test
// here, so what passes is what runs at the edge.
//
// What is deliberately NOT tested here: the OAuth round trip. Nothing in this
// runtime can complete a redirect to github.com, and a test that stubs both
// ends of somebody else's protocol asserts that the stub works. The editor's
// Playwright suite covers the flow a person actually walks.
//
// What IS tested is either side of that gap: a request carrying no session,
// and a request carrying one that `seedSession` wrote — which is how the
// success paths, the owner-strip projection and one person's stacks being
// nobody else's stopped being pinned by `tsc` alone.

const BASE = "https://api.test"
const WEB_ORIGIN = "http://localhost:5173"

// Every route that reads or writes somebody's stacks. Named as data because
// the interesting claim is the same for all four and a per-route copy of it is
// four places for the boundary to be quietly dropped from one.
const GUARDED = [
  { method: "GET", path: "/stacks" },
  { method: "POST", path: "/stacks" },
  { method: "PATCH", path: "/stacks/abc123" },
  { method: "DELETE", path: "/stacks/abc123" },
] as const

describe("the auth handler", () => {
  it("is mounted, and answers a session request from a browser with no cookie", async () => {
    const response = await SELF.fetch(`${BASE}/api/auth/get-session`, {
      headers: { origin: WEB_ORIGIN },
    })

    // Not 404 is the claim — a mounted handler that says "nobody is signed in"
    // rather than a route that does not exist. The distinction matters because
    // both would fail an authenticated request, and only one of them is a
    // missing mount.
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

      // 401 rather than 403: the caller has not been identified, which is a
      // different answer from identified-and-not-allowed, and the editor draws
      // a sign-in control for one and an error for the other.
      expect(response.status).toBe(401)
    })
  }
})

describe("cookies can cross from the editor to the worker", () => {
  // The failure this catches is the quiet one. Without
  // `Access-Control-Allow-Credentials` the browser accepts the response and
  // silently drops the cookie, so sign-in appears to work and the very next
  // request is anonymous again — with nothing in any log, on either side,
  // saying why. `hono/cors` does not send the header unless asked.
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
  // The obligation the owner's keep-the-token ruling carries. The token is
  // held so the worker can read GitHub as the person; a browser reading it out
  // of a session would turn a first-party credential into one every script on
  // the page can spend.
  //
  // It is seeded on the account row deliberately — the assertion is about a
  // session belonging to somebody who HAS a GitHub token, and a person without
  // one proves nothing. Both halves are asserted for the same reason: the
  // negative alone would pass against an empty body, and the positive says the
  // body really is this person's session.
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
  // The gap this closes was named in `todo/editor.md` and in EDITOR-54 and had
  // been open the whole time: `POST /configs` is an unauthenticated public
  // write into KV, and CORS — the only thing in front of it — is a browser
  // convention `curl` ignores.
  //
  // Keyed per address, which is what lets these run beside the other tests in
  // this file: each case brings its own `cf-connecting-ip`, so nothing here
  // spends anybody else's allowance. The pool shares state across a file (its
  // `isolatedStorage` is gone), so a shared key would make these tests
  // order-dependent — the exact defect the fixture-level guard in the editor's
  // suite exists to prevent, in a different shape.
  const LIMIT = 20

  const post = (ip: string) =>
    SELF.fetch(`${BASE}/configs`, {
      method: "POST",
      headers: {
        origin: WEB_ORIGIN,
        "content-type": "application/json",
        "cf-connecting-ip": ip,
      },
      // Deliberately not a valid payload: the limit is checked BEFORE the body
      // is parsed, so a refusal costs nothing to produce and a flood of
      // rubbish is turned away as cheaply as a flood of valid shares. What
      // matters below is only that the status changes from "not 429" to 429.
      body: JSON.stringify({ v: 5 }),
    })

  it(`lets ${LIMIT} writes through from one address and refuses the next`, async () => {
    const ip = "203.0.113.10"

    for (let attempt = 0; attempt < LIMIT; attempt++) {
      expect((await post(ip)).status).not.toBe(429)
    }

    expect((await post(ip)).status).toBe(429)
  })

  it("holds the allowance per address rather than for everybody at once", async () => {
    const spender = "203.0.113.20"
    for (let attempt = 0; attempt <= LIMIT; attempt++) await post(spender)

    // The claim that makes this a rate limit rather than a kill switch: one
    // client exhausting its allowance must not lock everyone else out.
    expect((await post("203.0.113.21")).status).not.toBe(429)
  })
})

// The authenticated half, which until SERVER-05 was pinned by `tsc` alone.
// `seedSession` writes the rows a real sign-in would have written and signs the
// cookie better-auth would have set — see the note at the head of that file for
// what it reproduces by hand and why the rest goes through the library.
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

// `updatedAt` is minted inside the worker at millisecond resolution, so two
// writes in the same millisecond would tie and the order under test would be
// whatever the sort happened to leave. Waiting for the clock to move is what
// makes "newest first" a claim about the sort rather than about timing.
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

  // Every shape a stack goes out in, because the projection is written once
  // and applied per route — a route that stops applying it is the failure, and
  // only a per-route assertion sees it.
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
      // The id rather than the key name: a projection dropped from one route
      // would put the owner back under whatever the column is called, and the
      // id is what the key would carry under any spelling of it.
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

    // The caller's question is "make this not exist", and the answer does not
    // depend on whether it did.
    expect(
      (await call(cookie, "/stacks/never-existed", { method: "DELETE" })).status
    ).toBe(204)
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

    // 404 because telling a stranger that a stack exists but is not theirs is
    // telling them it exists.
    expect(attempt.status).toBe(404)
    expect(await listNames(mine.cookie)).toEqual(["mine"])
  })

  it("leaves the row where it is when somebody else deletes it", async () => {
    const mine = await seedSession(env)
    const theirs = await seedSession(env)

    const saved = await save(mine.cookie, "mine")
    const { id } = await saved.json<{ id: string }>()

    // 204 tells them nothing, and the row is still there.
    expect(
      (await call(theirs.cookie, `/stacks/${id}`, { method: "DELETE" })).status
    ).toBe(204)
    expect(await listNames(mine.cookie)).toEqual(["mine"])
  })
})
