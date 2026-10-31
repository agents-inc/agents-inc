import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { z } from "@hono/zod-openapi"
import { betterAuth } from "better-auth"
import { withCloudflare } from "better-auth-cloudflare"
import { drizzle } from "drizzle-orm/d1"

import { schema } from "./db/schema"

import type { Context } from "hono"

type WorkerEnv = { Bindings: Env }

import type { BetterAuthOptions } from "better-auth"

type CloudflareOptions = Parameters<typeof withCloudflare>[0]

type CloudflareKv = NonNullable<CloudflareOptions["kv"]>

const AUTH_BASE_PATH = "/api/auth"

const DAY_SECONDS = 24 * 60 * 60

// Seconds. A use more than a day after the last renewal restarts the full
// lifetime. `satisfies` refuses a misspelt key, as for DECLINE_LOCATION.
const SESSION_LIFETIME = {
  expiresIn: 90 * DAY_SECONDS,
  updateAge: DAY_SECONDS,
} as const satisfies NonNullable<BetterAuthOptions["session"]>

// Location detection off. `cf` must be present (even empty) on both paths or
// the adapter throws. Both flags default on, and only a fresh object literal is
// checked for unknown keys, so `satisfies` is what refuses a misspelt one.
const DECLINE_LOCATION = {
  cf: {},
  autoDetectIpAddress: false,
  geolocationTracking: false,
} as const satisfies CloudflareOptions

// Two whole objects, not a conditional spread: `exactOptionalPropertyTypes`
// refuses the `d1?: T | undefined` a spread infers. The env-less branch serves
// `@better-auth/cli generate`, which runs without bindings.
const cloudflareOptionsFor = (env?: Env) =>
  env
    ? {
        d1: {
          // Schema goes to the adapter: the field is typed as a schema-less
          // `drizzle()` client.
          db: drizzle(env.DATABASE),
          options: { usePlural: true, schema },
        },
        // Shares the CONFIGS namespace; key spaces cannot collide. The cast
        // picks wrangler's `KVNamespace` over workers-types' near-identical one.
        kv: env.CONFIGS as CloudflareKv,
        ...DECLINE_LOCATION,
      }
    : { ...DECLINE_LOCATION }

// Built per request because its bindings exist only inside a fetch. Called
// without `env` by `@better-auth/cli generate`.
export const createAuth = (env?: Env) => {
  const servedOverHttps = env?.WEB_ORIGIN.startsWith("https://") ?? false

  const options = {
    basePath: AUTH_BASE_PATH,
    ...(env ? { baseURL: env.AUTH_BASE_URL } : {}),
    // `exactOptionalPropertyTypes`: an explicit `undefined` is not an absent key.
    ...(env ? { secret: env.BETTER_AUTH_SECRET } : {}),
    ...withCloudflare(cloudflareOptionsFor(env), {
      socialProviders: {
        github: {
          clientId: env?.GITHUB_CLIENT_ID ?? "",
          clientSecret: env?.GITHUB_CLIENT_SECRET ?? "",
        },
      },

      trustedOrigins: env ? [env.WEB_ORIGIN] : [],

      session: SESSION_LIFETIME,

      advanced: {
        // Same registrable domain, so the cookie is same-site and needs only the
        // parent domain. `secure` follows the scheme: a secure cookie is dropped
        // over plain http.
        crossSubDomainCookies: servedOverHttps
          ? { enabled: true, domain: ".agentsinc.sh" }
          : { enabled: false },
        defaultCookieAttributes: { sameSite: "lax", secure: servedOverHttps },
      },

      rateLimit: {
        enabled: true,
        // D1, not KV: the KV adapter lacks the `increment` Better Auth requires.
        storage: "database",
        window: 60,
        max: 100,
        customRules: { "/sign-in/social": { window: 60, max: 5 } },
      },
    }),
    ...(env
      ? {}
      : {
          // No handle needed: `generate` issues no query.
          database: drizzleAdapter(
            {},
            {
              provider: "sqlite",
              usePlural: true,
            }
          ),
        }),
  }

  // Required by tsc: the spread carries `database?: X | undefined`, which
  // `exactOptionalPropertyTypes` refuses.
  return betterAuth(options as BetterAuthOptions)
}

// What `@better-auth/cli generate` loads. Never used at the edge.
export const auth = createAuth()

// Costs a database round trip; call once per request. A read renews a session
// due for it, and sets the renewed cookie only on the headers `returnHeaders`
// hands back.
const sessionOf = async (c: Context<WorkerEnv>) =>
  createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  })

type SignedIn = NonNullable<Awaited<ReturnType<typeof sessionOf>>["response"]>

// Set before the handler answers, so every reply it gives carries them.
const passCookiesOn = (c: Context<WorkerEnv>, headers: Headers) => {
  for (const cookie of headers.getSetCookie()) {
    c.header("set-cookie", cookie, { append: true })
  }
}

// A wrapper rather than middleware, so a handler can only read a session by
// being wrapped in what produced it.
export const authenticated =
  <C extends Context<WorkerEnv>, R>(
    handle: (c: C, session: SignedIn) => Promise<R>
  ) =>
  async (c: C) => {
    const { headers, response: session } = await sessionOf(c)
    if (!session) return c.json({ error: "unauthorized" as const }, 401)

    passCookiesOn(c, headers)
    return handle(c, session)
  }

// 401, not 403: the editor answers it with a sign-in control.
export const UNAUTHORIZED = {
  401: {
    content: {
      "application/json": {
        schema: z.object({ error: z.literal("unauthorized") }),
      },
    },
    description: "No session",
  },
}
