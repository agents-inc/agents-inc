import { env } from "cloudflare:test"
import {
  COMPOSED_PROPOSAL,
  STACK_NAME_TAKEN_BODY,
  UNAUTHORIZED_BODY,
} from "@workspace/api-mocks/fixtures"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { HttpResponse, http } from "msw"
import { describe, expect, it, vi } from "vitest"

import { upstreamMock } from "../vitest.setup"
import { createAuth } from "./auth"
import { savedStacks } from "./db/app.schema"
import { seedSession } from "./db/seed-session"
import { app } from "./index"

import type { SeededSession } from "./db/seed-session"

// The first leg of a GitHub sign-in: Better Auth builds the authorize URL and
// sets a state cookie, and GitHub is not called. Through `app.request` so a
// case can hand the worker production's bindings.

const BASE = "https://api.test"
const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"

const SIGN_IN_LIMIT = 5

// What `wrangler.jsonc` sets for production.
const PRODUCTION: Env = {
  ...env,
  WEB_ORIGIN: "https://agentsinc.sh",
  AUTH_BASE_URL: "https://api.agentsinc.sh",
}

// An editor on https in front of a worker addressed over plain http.
const HTTPS_EDITOR_HTTP_WORKER: Env = {
  ...env,
  WEB_ORIGIN: "https://agentsinc.sh",
  AUTH_BASE_URL: "http://localhost:8787",
}

// Worthless, and not the pool's: the process environment carries that one.
const ANOTHER_SECRET = "another-fake-secret-another-fake-secret-32"

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"

/**
 * Better Auth limits sign-ins per `x-forwarded-for`, in D1, which outlives a
 * test. A random documentation-range address per case, so nothing spent it.
 */
const freshAddress = () => {
  const subnet = Array.from(
    crypto.getRandomValues(new Uint16Array(2)),
    (part) => part.toString(16)
  ).join(":")
  return `2001:db8:${subnet}::1`
}

type SignIn = { from: string; returnTo: string; address: string }

const signIn = ({ from, returnTo, address }: SignIn, bindings: Env = env) =>
  app.request(
    `${BASE}/api/auth/sign-in/social`,
    {
      method: "POST",
      headers: {
        origin: from,
        "content-type": "application/json",
        "x-forwarded-for": address,
      },
      body: JSON.stringify({ provider: "github", callbackURL: returnTo }),
    },
    bindings
  )

const fromTheEditor = (bindings: Env = env): SignIn => ({
  from: bindings.WEB_ORIGIN,
  returnTo: `${bindings.WEB_ORIGIN}/configure`,
  address: freshAddress(),
})

const cookiesOf = (response: Response) => {
  const cookies = response.headers.get("set-cookie")
  if (cookies === null) throw new Error("the sign-in set no cookie")
  return cookies
}

describe("signing in with GitHub", () => {
  it("sends the editor to GitHub with this worker's app and callback", async () => {
    const response = await signIn(fromTheEditor())

    expect(response.status).toBe(200)
    const { url } = await response.json<{ url: string }>()
    const authorize = new URL(url)
    expect(`${authorize.origin}${authorize.pathname}`).toBe(
      GITHUB_AUTHORIZE_URL
    )
    expect(authorize.searchParams.get("client_id")).toBe(env.GITHUB_CLIENT_ID)
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `${env.AUTH_BASE_URL}/api/auth/callback/github`
    )
  })

  // The refusal beside the case above: only the editor may be returned to.
  it("refuses to send a person back anywhere but the editor", async () => {
    const response = await signIn({
      ...fromTheEditor(),
      returnTo: "https://evil.example/configure",
    })

    expect(response.status).toBe(403)
  })

  it(`lets ${String(SIGN_IN_LIMIT)} sign-ins a minute through from one address, then refuses`, async () => {
    const attempt = fromTheEditor()
    const statuses: number[] = []

    for (let count = 0; count <= SIGN_IN_LIMIT; count++) {
      statuses.push((await signIn(attempt)).status)
    }

    expect(statuses).toStrictEqual([200, 200, 200, 200, 200, 429])
  })
})

// Asserted on the state cookie; Better Auth gives every cookie it sets these
// same attributes.
describe("the cookies it sets", () => {
  // A `Secure` cookie is dropped over plain http, and localhost has no parent
  // domain to share with.
  it("keeps them to this host, and off https, while the editor runs on plain http", async () => {
    const cookies = cookiesOf(await signIn(fromTheEditor()))

    expect(cookies).toContain("SameSite=Lax")
    expect(cookies).not.toContain("Domain=")
    expect(cookies).not.toContain("Secure")
  })

  // The editor and the worker share the registrable domain.
  it("shares them with the editor's domain, over https only, in production", async () => {
    const cookies = cookiesOf(
      await signIn(fromTheEditor(PRODUCTION), PRODUCTION)
    )

    expect(cookies).toContain("Domain=.agentsinc.sh")
    expect(cookies).toContain("; Secure")
    expect(cookies).toContain("SameSite=Lax")
  })

  // `Secure` follows the editor's scheme, not the worker's own address.
  it("marks them Secure while the editor runs on https, though the worker is addressed over http", async () => {
    const cookies = cookiesOf(
      await signIn(
        fromTheEditor(HTTPS_EDITOR_HTTP_WORKER),
        HTTPS_EDITOR_HTTP_WORKER
      )
    )

    expect(cookies).toContain("; Secure")
  })
})

// A session is signed with the secret in the bindings each request hands the
// worker, which need not be the one the process environment carries.
describe("the secret it signs sessions with", () => {
  const ANOTHER_SECRETS_BINDINGS: Env = {
    ...env,
    BETTER_AUTH_SECRET: ANOTHER_SECRET,
  }

  const savedStacksWith = (cookie: string, bindings: Env) =>
    app.request(
      `${BASE}/stacks`,
      { headers: { cookie, origin: bindings.WEB_ORIGIN } },
      bindings
    )

  it("reads a session signed with the secret its bindings carry", async () => {
    const { cookie } = await seedSession(ANOTHER_SECRETS_BINDINGS)

    const response = await savedStacksWith(cookie, ANOTHER_SECRETS_BINDINGS)

    expect(response.status).toBe(200)
  })

  it("refuses a session signed with any other secret", async () => {
    const { cookie } = await seedSession(ANOTHER_SECRETS_BINDINGS)

    const response = await savedStacksWith(cookie, env)

    expect(response.status).toBe(401)
  })
})

// The callback's last leg: GitHub's code redeemed for a token. GitHub is
// mocked, so the request the worker sends is what is asserted.
describe("redeeming GitHub's code", () => {
  it("sends this worker's GitHub app and its secret", async () => {
    const sent: { clientId: string | null; clientSecret: string | null }[] = []
    upstreamMock.use(
      http.post(GITHUB_TOKEN_URL, async ({ request }) => {
        const form = new URLSearchParams(await request.text())
        sent.push({
          clientId: form.get("client_id"),
          clientSecret: form.get("client_secret"),
        })
        return HttpResponse.json({
          access_token: "not-a-real-github-token",
          token_type: "bearer",
          scope: "read:user",
        })
      })
    )
    const { socialProviders } = await createAuth(env).$context
    const github = socialProviders.find((provider) => provider.id === "github")
    if (!github) throw new Error("the worker configures no GitHub provider")

    await github.validateAuthorizationCode({
      code: "a-code-github-issued",
      redirectURI: `${env.AUTH_BASE_URL}/api/auth/callback/github`,
    })

    expect(sent).toStrictEqual([
      {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
    ])
  })
})

// The owner's ruling: a sign-in lasts 90 days, and using it renews it, at
// most once a day. `get-session` is what the editor reads its session from.
describe("how long a sign-in lasts", () => {
  const HOUR_MS = 60 * 60 * 1000
  const DAY_MS = 24 * HOUR_MS
  const LIFETIME_DAYS = 90
  const LIFETIME_MS = LIFETIME_DAYS * DAY_MS

  // Development's cookie name: `env` serves the editor over plain http.
  const SESSION_COOKIE = "better-auth.session_token"

  // Production's: a worker on https prefixes it.
  const PRODUCTION_SESSION_COOKIE = "__Secure-better-auth.session_token"

  // 90 days, in seconds.
  const RENEWED_MAX_AGE = "Max-Age=7776000;"

  type SessionRead = {
    session: { expiresAt: string; createdAt: string; updatedAt: string }
    user: { id: string }
  } | null

  // As the editor asks: its cookie, from its origin.
  const readSession = (cookie: string, bindings: Env = env) =>
    app.request(
      `${BASE}/api/auth/get-session`,
      { headers: { cookie, origin: bindings.WEB_ORIGIN } },
      bindings
    )

  const sessionCookieOf = (response: Response, name = SESSION_COOKIE) => {
    const line = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${name}=`))
    if (line === undefined) throw new Error("no session cookie was set")
    return line
  }

  /** Signed in `ago` milliseconds back, and not used since. */
  const signedInAgo = async (ago: number, bindings: Env = env) => {
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() - ago })
    try {
      return await seedSession(bindings)
    } finally {
      vi.useRealTimers()
    }
  }

  /** Brackets the expiry between two clock readings taken around the write. */
  const expectLifetimeFrom = (
    read: SessionRead,
    { from, to }: { from: number; to: number }
  ) => {
    if (read === null) throw new Error("the worker answered with no session")
    const expiresAt = Date.parse(read.session.expiresAt)
    expect(expiresAt).toBeGreaterThanOrEqual(from + LIFETIME_MS)
    expect(expiresAt).toBeLessThanOrEqual(to + LIFETIME_MS)
  }

  it("holds a new sign-in for 90 days from the moment it was made", async () => {
    const from = Date.now()
    const person = await seedSession(env)
    const to = Date.now()

    const read = await (await readSession(person.cookie)).json<SessionRead>()

    expectLifetimeFrom(read, { from, to })
  })

  // The two sides of 90 days, for someone who has not been back since.
  describe("someone who has not been back since signing in", () => {
    it("is still signed in 89 days later", async () => {
      const person = await signedInAgo(89 * DAY_MS)

      const read = await (await readSession(person.cookie)).json<SessionRead>()

      expect(read?.user.id).toBe(person.userId)
    })

    it("is signed out 91 days later", async () => {
      const person = await signedInAgo(91 * DAY_MS)

      const read = await (await readSession(person.cookie)).json<SessionRead>()

      expect(read).toBeNull()
    })
  })

  // The two sides of the one-day renewal age.
  describe("using a sign-in", () => {
    it("renews it for another 90 days once a day has passed since it was last renewed", async () => {
      const person = await signedInAgo(DAY_MS + HOUR_MS)

      const from = Date.now()
      const response = await readSession(person.cookie)
      const to = Date.now()

      expect(sessionCookieOf(response)).toContain(RENEWED_MAX_AGE)
      const renewed = await response.json<SessionRead>()
      expectLifetimeFrom(renewed, { from, to })
      // Kept by the server, not only answered.
      const readAgain = await (
        await readSession(person.cookie)
      ).json<SessionRead>()
      expect(readAgain?.session.expiresAt).toBe(renewed?.session.expiresAt)
    })

    it("leaves it as it was within a day of its last renewal", async () => {
      const person = await signedInAgo(DAY_MS - HOUR_MS)

      const response = await readSession(person.cookie)

      expect(response.headers.getSetCookie()).toStrictEqual([])
      const read = await response.json<SessionRead>()
      expect(read?.user.id).toBe(person.userId)
      expect(read?.session.updatedAt).toBe(read?.session.createdAt)
    })
  })

  // The owner's ruling, 2026-10-26: every signed-in action renews the sign-in,
  // in the browser as well as in the worker. The worker writes the renewal
  // before the action runs, so the action's own response is the only one that
  // can hand the browser the cookie to match.
  describe("every signed-in action", () => {
    const CONFIG_ID = "abcd1234"
    const STORED_NAME = "Stored before the action"
    const SAVED_NAME = "Saved by the action"
    const RENAMED_NAME = "Renamed by the action"
    const MESSAGES_URL = "https://api.anthropic.com/v1/messages"

    /** Who calls: a cookie, or none, and the id of a stack they hold. */
    type Caller = { cookie?: string; stackId: string }

    const NOBODY: Caller = { stackId: "no-such-stack" }

    // Stored past the routes: a write through them would renew the sign-in
    // before the action under test.
    const callerFor = async (person: SeededSession): Promise<Caller> => {
      const now = new Date().toISOString()
      const stackId = crypto.randomUUID()
      await drizzle(env.DATABASE).insert(savedStacks).values({
        id: stackId,
        userId: person.userId,
        name: STORED_NAME,
        configId: CONFIG_ID,
        createdAt: now,
        updatedAt: now,
      })
      return { cookie: person.cookie, stackId }
    }

    const stacksHeldBy = (person: SeededSession) =>
      drizzle(env.DATABASE)
        .select()
        .from(savedStacks)
        .where(eq(savedStacks.userId, person.userId))

    const sendAs = (caller: Caller, path: string, init: RequestInit = {}) =>
      app.request(
        `${BASE}${path}`,
        {
          ...init,
          headers: {
            origin: env.WEB_ORIGIN,
            "content-type": "application/json",
            ...(caller.cookie === undefined ? {} : { cookie: caller.cookie }),
          },
        },
        env
      )

    // The SDK reads the proposal from the reply's first text block.
    const modelProposing = (proposal: typeof COMPOSED_PROPOSAL) =>
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

    // A stack as the routes answer it: every column but its owner.
    type StackAnswer = Record<
      Exclude<keyof typeof savedStacks.$inferSelect, "userId">,
      unknown
    >

    const aStack = (fields: Partial<StackAnswer>): StackAnswer => ({
      id: expect.any(String),
      name: STORED_NAME,
      configId: CONFIG_ID,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      ...fields,
    })

    type Action = {
      name: string
      perform: (caller: Caller) => Response | Promise<Response>
      // What it answers someone signed in.
      answers: (caller: Caller) => { status: number; body: unknown }
    }

    const ACTIONS: readonly Action[] = [
      {
        name: "listing their stacks",
        perform: (caller) => sendAs(caller, "/stacks"),
        answers: (caller) => ({
          status: 200,
          body: [aStack({ id: caller.stackId })],
        }),
      },
      {
        name: "saving a stack",
        perform: (caller) =>
          sendAs(caller, "/stacks", {
            method: "POST",
            body: JSON.stringify({ name: SAVED_NAME, configId: CONFIG_ID }),
          }),
        answers: () => ({
          status: 201,
          body: aStack({ name: SAVED_NAME }),
        }),
      },
      {
        name: "renaming a stack",
        perform: (caller) =>
          sendAs(caller, `/stacks/${caller.stackId}`, {
            method: "PATCH",
            body: JSON.stringify({ name: RENAMED_NAME }),
          }),
        answers: (caller) => ({
          status: 200,
          body: aStack({ id: caller.stackId, name: RENAMED_NAME }),
        }),
      },
      {
        name: "deleting a stack",
        perform: (caller) =>
          sendAs(caller, `/stacks/${caller.stackId}`, { method: "DELETE" }),
        answers: () => ({ status: 204, body: null }),
      },
      {
        name: "asking the composer",
        // The model is answered by msw; a refused call never reaches it.
        perform: (caller) => {
          upstreamMock.use(
            http.post(MESSAGES_URL, () => modelProposing(COMPOSED_PROPOSAL))
          )
          return sendAs(caller, "/compose", {
            method: "POST",
            body: JSON.stringify({ sentence: "a react app, tested" }),
          })
        },
        answers: () => ({ status: 200, body: COMPOSED_PROPOSAL }),
      },
    ]

    // 204 carries no body.
    const bodyOf = async (response: Response): Promise<unknown> =>
      response.status === 204 ? null : response.json()

    /** `name=value`, as the browser sends a cookie it was set. */
    const cookiePairOf = (setCookie: string) =>
      setCookie.slice(0, setCookie.indexOf(";"))

    for (const action of ACTIONS) {
      describe(action.name, () => {
        it("renews it in the browser as well as the worker once a day has passed since it was last renewed", async () => {
          const person = await signedInAgo(DAY_MS + HOUR_MS)
          const caller = await callerFor(person)

          const from = Date.now()
          const response = await action.perform(caller)
          const to = Date.now()

          const { status, body } = action.answers(caller)
          expect(response.status).toBe(status)
          expect(await bodyOf(response)).toStrictEqual(body)
          // The worker's copy: renewed by this action, not by the read.
          const kept = await (
            await readSession(person.cookie)
          ).json<SessionRead>()
          expectLifetimeFrom(kept, { from, to })
          // The browser's copy: a cookie lasting as long as the worker's.
          const renewed = sessionCookieOf(response)
          expect(renewed).toContain(RENEWED_MAX_AGE)
          const readWithRenewed = await (
            await readSession(cookiePairOf(renewed))
          ).json<SessionRead>()
          expect(readWithRenewed?.user.id).toBe(person.userId)
          expect(readWithRenewed?.session.expiresAt).toBe(
            kept?.session.expiresAt
          )
        })

        it("leaves it as it was within a day of its last renewal", async () => {
          const person = await signedInAgo(DAY_MS - HOUR_MS)
          const caller = await callerFor(person)

          const response = await action.perform(caller)

          const { status, body } = action.answers(caller)
          expect(response.status).toBe(status)
          expect(await bodyOf(response)).toStrictEqual(body)
          expect(response.headers.getSetCookie()).toStrictEqual([])
          const read = await (
            await readSession(person.cookie)
          ).json<SessionRead>()
          expect(read?.session.updatedAt).toBe(read?.session.createdAt)
        })

        it("is refused to a call carrying no session, which is handed no cookie", async () => {
          const response = await action.perform(NOBODY)

          expect(response.status).toBe(401)
          expect(await response.json()).toStrictEqual(UNAUTHORIZED_BODY)
          expect(response.headers.getSetCookie()).toStrictEqual([])
        })

        it("is refused to a sign-in 91 days old, and changes no stack", async () => {
          const person = await signedInAgo(91 * DAY_MS)
          const caller = await callerFor(person)

          const response = await action.perform(caller)

          expect(response.status).toBe(401)
          expect(await response.json()).toStrictEqual(UNAUTHORIZED_BODY)
          expect(await stacksHeldBy(person)).toStrictEqual([
            { ...aStack({ id: caller.stackId }), userId: person.userId },
          ])
        })
      })
    }

    // The worker renews before the action decides, so a refusal carries it too.
    it("renews it in the browser when saving a stack is refused for a name already held", async () => {
      const person = await signedInAgo(DAY_MS + HOUR_MS)
      const caller = await callerFor(person)

      const response = await sendAs(caller, "/stacks", {
        method: "POST",
        body: JSON.stringify({ name: STORED_NAME, configId: CONFIG_ID }),
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toStrictEqual(STACK_NAME_TAKEN_BODY)
      expect(sessionCookieOf(response)).toContain(RENEWED_MAX_AGE)
      expect(await stacksHeldBy(person)).toStrictEqual([
        { ...aStack({ id: caller.stackId }), userId: person.userId },
      ])
    })
  })

  // Opening the editor is the path that already hands the browser its
  // renewal; an action's cookie must carry the same attributes.
  describe("the cookie a renewal sets", () => {
    type Renewer = {
      name: string
      send: (cookie: string, bindings: Env) => Response | Promise<Response>
    }

    const RENEWERS: readonly Renewer[] = [
      { name: "opening the editor", send: readSession },
      {
        name: "listing their stacks",
        send: (cookie, bindings) =>
          app.request(
            `${BASE}/stacks`,
            { headers: { cookie, origin: bindings.WEB_ORIGIN } },
            bindings
          ),
      },
    ]

    for (const renewer of RENEWERS) {
      describe(`on ${renewer.name}`, () => {
        it("keeps it to this host, off https and out of scripts' reach, while the editor runs on plain http", async () => {
          const person = await signedInAgo(DAY_MS + HOUR_MS)

          const cookie = sessionCookieOf(await renewer.send(person.cookie, env))

          expect(cookie).toContain(RENEWED_MAX_AGE)
          expect(cookie).toContain("HttpOnly")
          expect(cookie).toContain("SameSite=Lax")
          expect(cookie).not.toContain("Domain=")
          expect(cookie).not.toContain("Secure")
        })

        it("shares it with the editor's domain, over https only and out of scripts' reach, in production", async () => {
          const person = await signedInAgo(DAY_MS + HOUR_MS, PRODUCTION)

          const cookie = sessionCookieOf(
            await renewer.send(person.cookie, PRODUCTION),
            PRODUCTION_SESSION_COOKIE
          )

          expect(cookie).toContain(RENEWED_MAX_AGE)
          expect(cookie).toContain("Domain=.agentsinc.sh")
          expect(cookie).toContain("; Secure")
          expect(cookie).toContain("HttpOnly")
          expect(cookie).toContain("SameSite=Lax")
        })
      })
    }
  })
})
