import { SELF, env } from "cloudflare:test"
import {
  CONFIG_WRITE_WINDOW_SECONDS,
  NO_STACK_BODY,
  RATE_LIMITED_BODY,
  STACK_NAME_TAKEN_BODY,
  WORKER_EXPOSED_HEADERS,
} from "@workspace/api-mocks/fixtures"
import { SEED_VERSION } from "@workspace/matrix/seed"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { afterEach, describe, expect, it, vi } from "vitest"

import { savedStacks } from "./db/app.schema"
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

const save = (cookie: string, name: string, configId = "abcd1234") =>
  call(cookie, "/stacks", {
    method: "POST",
    body: JSON.stringify({ name, configId }),
  })

const rename = (cookie: string, id: string, name: string) =>
  call(cookie, `/stacks/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  })

const idOf = async (saved: Response) => (await saved.json<{ id: string }>()).id

const listRows = async (cookie: string) => {
  const response = await call(cookie, "/stacks")
  return response.json<{ name: string }[]>()
}

const listNames = async (cookie: string) =>
  (await listRows(cookie)).map((row) => row.name)

// Newest first is decided by `updatedAt`, which two quick writes can share.
const listNamesSorted = async (cookie: string) =>
  (await listNames(cookie)).toSorted()

// A row written past the routes: by a write the worker did not see, or before
// a rule the routes now hold.
const storeDirectly = async (userId: string, name: string) => {
  const now = new Date().toISOString()
  await drizzle(env.DATABASE).insert(savedStacks).values({
    id: crypto.randomUUID(),
    userId,
    name,
    configId: "abcd1234",
    createdAt: now,
    updatedAt: now,
  })
}

const deleteDirectly = async (id: string) => {
  await drizzle(env.DATABASE).delete(savedStacks).where(eq(savedStacks.id, id))
}

// Half of a surrogate pair, which `JSON.stringify` sends as its own escape.
const HALF_A_PAIR = "x\ud800y"
// The store keeps the half's three bytes and hands each back as U+FFFD.
const HALF_A_PAIR_READ_BACK = "x���y"

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

  it("refuses a name holding half of a surrogate pair, to a save and a rename", async () => {
    const { cookie } = await seedSession(env)
    const id = await idOf(await save(cookie, "whole"))

    const saved = await save(cookie, HALF_A_PAIR)
    const renamed = await rename(cookie, id, HALF_A_PAIR)

    expect(saved.status).toBe(400)
    expect(renamed.status).toBe(400)
    expect(await listNames(cookie)).toStrictEqual(["whole"])
  })

  // The control beside it: a whole pair is one character.
  it("saves and renames to a name whose surrogate pair is whole", async () => {
    const { cookie } = await seedSession(env)
    const saved = await save(cookie, "rocket \u{1F680}")
    expect(saved.status).toBe(201)

    const renamed = await rename(cookie, await idOf(saved), "\u{1F680} rocket")

    expect(renamed.status).toBe(200)
    expect(await listNames(cookie)).toStrictEqual(["\u{1F680} rocket"])
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

// Owner ruling, 2026-10-24: the worker refuses a name the account already
// holds, from any caller. Names compare as the editor's Save compares them,
// trimmed and in any case (`sameName` in apps/editor's save-name.ts).
describe("a name the account already holds", () => {
  it("is refused a second save, with a 409 saying the name is taken", async () => {
    const { cookie } = await seedSession(env)
    await save(cookie, "mine")

    const again = await save(cookie, "mine")

    expect(again.status).toBe(409)
    expect(await again.json()).toStrictEqual(STACK_NAME_TAKEN_BODY)
    // The editor's dialog reads the refusal from another origin.
    expect(again.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN)
    expect(await listNames(cookie)).toStrictEqual(["mine"])
  })

  it("is refused in any case, and whatever spaces surround it", async () => {
    const { cookie } = await seedSession(env)
    await save(cookie, "Weekend Project")

    const again = await save(cookie, "  weekend PROJECT  ")

    expect(again.status).toBe(409)
    expect(await listNames(cookie)).toStrictEqual(["Weekend Project"])
  })

  // SQLite's `lower()` and `NOCASE` fold ASCII letters only.
  it("is refused in another case beyond ASCII, as the editor's Save refuses it", async () => {
    const { cookie } = await seedSession(env)
    await save(cookie, "Équipe")

    const again = await save(cookie, "équipe")

    expect(again.status).toBe(409)
    expect(await listNames(cookie)).toStrictEqual(["Équipe"])
  })

  // Nothing is ever overwritten: not the config it points at, nor its times.
  it("leaves the stack that holds it exactly as it was", async () => {
    const { cookie } = await seedSession(env)
    const held: unknown = await (await save(cookie, "mine", "first111")).json()

    await save(cookie, "MINE", "second22")

    expect(await listRows(cookie)).toStrictEqual([held])
  })

  // Two tabs, two machines or a double press still leave the account one.
  it("goes to one of two saves sent together, and is refused to the other", async () => {
    const { cookie } = await seedSession(env)

    const answers = await Promise.all([
      save(cookie, "mine"),
      save(cookie, "mine"),
    ])

    expect(
      answers.map((answer) => answer.status).toSorted((a, b) => a - b)
    ).toStrictEqual([201, 409])
    expect(await listNames(cookie)).toStrictEqual(["mine"])
  })

  it("is refused to a rename of another of the account's stacks", async () => {
    const { cookie } = await seedSession(env)
    await save(cookie, "first")
    const second = await idOf(await save(cookie, "second"))

    const renamed = await rename(cookie, second, "FIRST")

    expect(renamed.status).toBe(409)
    expect(await renamed.json()).toStrictEqual(STACK_NAME_TAKEN_BODY)
    expect(await listNamesSorted(cookie)).toStrictEqual(["first", "second"])
  })

  it("moves with a rename, so the stack's new name is held", async () => {
    const { cookie } = await seedSession(env)
    const id = await idOf(await save(cookie, "first"))
    await rename(cookie, id, "second")

    const again = await save(cookie, "Second")

    expect(again.status).toBe(409)
    expect(await listNames(cookie)).toStrictEqual(["second"])
  })

  // The controls below already hold, and must go on holding.
  it("is free again once its stack is renamed away", async () => {
    const { cookie } = await seedSession(env)
    const id = await idOf(await save(cookie, "first"))
    await rename(cookie, id, "second")

    const again = await save(cookie, "first")

    expect(again.status).toBe(201)
    expect(await listNamesSorted(cookie)).toStrictEqual(["first", "second"])
  })

  it("is free again once its stack is deleted", async () => {
    const { cookie } = await seedSession(env)
    const id = await idOf(await save(cookie, "mine"))
    await call(cookie, `/stacks/${id}`, { method: "DELETE" })

    const again = await save(cookie, "mine")

    expect(again.status).toBe(201)
    expect(await listNames(cookie)).toStrictEqual(["mine"])
  })

  it("can be given to its own stack in another case", async () => {
    const { cookie } = await seedSession(env)
    const id = await idOf(await save(cookie, "mine"))

    const renamed = await rename(cookie, id, "MINE")

    expect(renamed.status).toBe(200)
    expect(await listNames(cookie)).toStrictEqual(["MINE"])
  })

  // `sameName` folds case and trims the ends; it does not touch the middle.
  it("is not held by a name that differs inside", async () => {
    const { cookie } = await seedSession(env)
    await save(cookie, "my stack")

    const other = await save(cookie, "my  stack")

    expect(other.status).toBe(201)
    expect(await listNamesSorted(cookie)).toStrictEqual([
      "my  stack",
      "my stack",
    ])
  })

  it("is free to another person to save", async () => {
    const mine = await seedSession(env)
    const theirs = await seedSession(env)
    await save(mine.cookie, "shared")

    const saved = await save(theirs.cookie, "shared")

    expect(saved.status).toBe(201)
    expect(await listNames(mine.cookie)).toStrictEqual(["shared"])
    expect(await listNames(theirs.cookie)).toStrictEqual(["shared"])
  })

  it("is free to another person to rename a stack to", async () => {
    const mine = await seedSession(env)
    const theirs = await seedSession(env)
    await save(mine.cookie, "shared")
    const id = await idOf(await save(theirs.cookie, "theirs"))

    const renamed = await rename(theirs.cookie, id, "shared")

    expect(renamed.status).toBe(200)
    expect(await listNames(theirs.cookie)).toStrictEqual(["shared"])
  })

  // Nothing to rename is the answer before any name is weighed, so another
  // person's id still reads as no id.
  it("leaves another person's stack not found, under a name the caller holds", async () => {
    const mine = await seedSession(env)
    const theirs = await seedSession(env)
    const id = await idOf(await save(mine.cookie, "mine"))
    await save(theirs.cookie, "held")

    const attempt = await rename(theirs.cookie, id, "held")

    expect(attempt.status).toBe(404)
    expect(await attempt.json()).toStrictEqual(NO_STACK_BODY)
    expect(await listNames(mine.cookie)).toStrictEqual(["mine"])
  })
})

// Saved before such names were refused; it never reads back as it was written.
describe("an account holding a name with half of a surrogate pair", () => {
  it("can still save a name it does not hold", async () => {
    const { cookie, userId } = await seedSession(env)
    await storeDirectly(userId, HALF_A_PAIR)

    const saved = await save(cookie, "next")

    expect(saved.status).toBe(201)
    expect(await listNamesSorted(cookie)).toStrictEqual([
      "next",
      HALF_A_PAIR_READ_BACK,
    ])
  })

  it("can still rename another of its stacks", async () => {
    const { cookie, userId } = await seedSession(env)
    const id = await idOf(await save(cookie, "first"))
    await storeDirectly(userId, HALF_A_PAIR)

    const renamed = await rename(cookie, id, "second")

    expect(renamed.status).toBe(200)
    expect(await listNamesSorted(cookie)).toStrictEqual([
      "second",
      HALF_A_PAIR_READ_BACK,
    ])
  })
})

const EXECUTIONS: ReadonlySet<PropertyKey> = new Set([
  "all",
  "first",
  "raw",
  "run",
])

// The statement, and any it binds to, lets `land` finish before it runs.
const landingFirst = (
  statement: D1PreparedStatement,
  land: () => Promise<void>
): D1PreparedStatement =>
  new Proxy(statement, {
    get(target, key): unknown {
      const member: unknown = Reflect.get(target, key)
      if (typeof member !== "function") return member
      if (key === "bind") {
        return (...values: unknown[]) =>
          landingFirst(target.bind(...values), land)
      }
      if (!EXECUTIONS.has(key)) return member.bind(target)

      return async (...args: unknown[]): Promise<unknown> => {
        await land()
        return Reflect.apply(member, target, args)
      }
    },
  })

// The race made certain: `land` runs after the worker's read and before the
// first statement `isTheWrite` matches.
const landBefore = (isTheWrite: RegExp, land: () => Promise<void>) => {
  const prepare = env.DATABASE.prepare.bind(env.DATABASE)
  let armed = true
  let landed = false
  vi.spyOn(env.DATABASE, "prepare").mockImplementation((query) => {
    const statement = prepare(query)
    if (!armed || !isTheWrite.test(query)) return statement
    armed = false

    return landingFirst(statement, async () => {
      await land()
      landed = true
    })
  })

  return { landed: () => landed }
}

const THE_INSERT = /^insert into "saved_stacks"/
const THE_UPDATE = /^update "saved_stacks"/

describe("a write of the account's own landing between the worker's read and its write", () => {
  it("takes the name from a save, which is refused", async () => {
    const { cookie, userId } = await seedSession(env)
    const race = landBefore(THE_INSERT, () => storeDirectly(userId, "ÉQUIPE"))

    const saved = await save(cookie, "équipe")

    expect(race.landed()).toBe(true)
    expect(saved.status).toBe(409)
    expect(await listNames(cookie)).toStrictEqual(["ÉQUIPE"])
  })

  it("leaves a save of another name saved", async () => {
    const { cookie, userId } = await seedSession(env)
    const race = landBefore(THE_INSERT, () => storeDirectly(userId, "other"))

    const saved = await save(cookie, "mine")

    expect(race.landed()).toBe(true)
    expect(saved.status).toBe(201)
    expect(await listNamesSorted(cookie)).toStrictEqual(["mine", "other"])
  })

  it("takes the name from a rename, which is refused", async () => {
    const { cookie, userId } = await seedSession(env)
    const id = await idOf(await save(cookie, "first"))
    const race = landBefore(THE_UPDATE, () => storeDirectly(userId, "Shared"))

    const renamed = await rename(cookie, id, "shared")

    expect(race.landed()).toBe(true)
    expect(renamed.status).toBe(409)
    expect(await listNamesSorted(cookie)).toStrictEqual(["Shared", "first"])
  })

  it("leaves a rename not found when the write deletes its stack", async () => {
    const { cookie } = await seedSession(env)
    const id = await idOf(await save(cookie, "first"))
    const race = landBefore(THE_UPDATE, () => deleteDirectly(id))

    const renamed = await rename(cookie, id, "second")

    expect(race.landed()).toBe(true)
    expect(renamed.status).toBe(404)
    expect(await listNames(cookie)).toStrictEqual([])
  })
})
