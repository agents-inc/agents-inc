import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { z } from "@hono/zod-openapi"
import { betterAuth } from "better-auth"
import { withCloudflare } from "better-auth-cloudflare"
import { drizzle } from "drizzle-orm/d1"

import { schema } from "./db/schema"

import type { Context } from "hono"

type WorkerEnv = { Bindings: Env }

import type { BetterAuthOptions } from "better-auth"

type CloudflareKv = NonNullable<Parameters<typeof withCloudflare>[0]["kv"]>

const AUTH_BASE_PATH = "/api/auth"

// Location detection off. `cf` must be present (even empty) on both paths or
// the adapter throws.
const DECLINE_LOCATION = {
  cf: {},
  autoDetectIpAddress: false,
  geolocationTracking: false,
} as const

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

      advanced: {
        // Same registrable domain, so the cookie is same-site and needs only the
        // parent domain. `secure` follows the scheme: a secure cookie is dropped
        // over plain http.
        crossSubDomainCookies: env?.WEB_ORIGIN.startsWith("https://")
          ? { enabled: true, domain: ".agentsinc.sh" }
          : { enabled: false },
        defaultCookieAttributes: {
          sameSite: "lax",
          secure: env?.WEB_ORIGIN.startsWith("https://") ?? false,
        },
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

// Costs a database round trip; call once per request.
const sessionOf = async (c: Context<WorkerEnv>) =>
  createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  })

type SignedIn = NonNullable<Awaited<ReturnType<typeof sessionOf>>>

// A wrapper rather than middleware, so a handler can only read a session by
// being wrapped in what produced it.
export const authenticated =
  <C extends Context<WorkerEnv>, R>(
    handle: (c: C, session: SignedIn) => Promise<R>
  ) =>
  async (c: C) => {
    const session = await sessionOf(c)
    if (!session) return c.json({ error: "unauthorized" as const }, 401)

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
