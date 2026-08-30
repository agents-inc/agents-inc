import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { z } from "@hono/zod-openapi"
import { betterAuth } from "better-auth"
import { withCloudflare } from "better-auth-cloudflare"
import { drizzle } from "drizzle-orm/d1"

import { schema } from "./db/schema"

import type { Context } from "hono"

type WorkerEnv = { Bindings: Env }

import type { BetterAuthOptions } from "better-auth"

/** The KV handle as `better-auth-cloudflare` spells it. See its use below. */
type CloudflareKv = NonNullable<Parameters<typeof withCloudflare>[0]["kv"]>

const AUTH_BASE_PATH = "/api/auth"

// Geolocation and IP detection OFF, and `cf` present but empty.
//
// Both halves are needed and the second is not obvious: the adapter throws
// `Cloudflare context is required for geolocation or IP detection features`
// when `cf` is absent, whether or not either feature is enabled — so leaving it
// out is not how you decline them, these two flags are. The whole suite failed
// to boot on exactly that, and then failed again identically because this lived
// on the `env` path only, while the `auth` export at the foot of this file
// calls in with no bindings at import time. Whatever declines geolocation has
// to be on both paths.
//
// Off deliberately rather than by default: nothing in this product needs to
// know where a person is or what address they came from, and the cheapest way
// not to hold data about somebody is never to collect it.
const DECLINE_LOCATION = {
  cf: {},
  autoDetectIpAddress: false,
  geolocationTracking: false,
} as const

/**
 * TWO WHOLE OBJECTS RATHER THAN ONE WITH A CONDITIONAL SPREAD, and it is a
 * type-level requirement rather than taste. `exactOptionalPropertyTypes` is on,
 * and a spread of `env ? { d1 } : {}` infers `d1?: T | undefined` — a key that
 * may be present holding undefined, which is exactly what that setting refuses
 * to hand to an optional parameter. Branching produces `{ d1: T, kv: K }` or an
 * object with no `d1` key at all, and both of those it accepts. The earlier
 * version needed a cast to compile; this one needs nothing.
 *
 * The env-less branch is not dead code: `@better-auth/cli generate` imports
 * this module in plain Node, where there are no bindings at all.
 */
const cloudflareOptionsFor = (env?: Env) =>
  env
    ? {
        d1: {
          // The schema goes to the ADAPTER rather than to drizzle, and that is
          // a real constraint rather than a preference: the library types this
          // field as `ReturnType<typeof drizzle>` with no generic, so a client
          // built as `drizzle(db, { schema })` is a `DrizzleD1Database<typeof
          // schema>` and does not fit — its own README shows the form that does
          // not compile. `options` is where Better Auth's adapter reads the
          // schema from anyway, and a schema-less client still serves
          // `select().from(table)`; only the relational `db.query` API needs
          // the generic, and nothing here uses it.
          db: drizzle(env.DATABASE),
          options: { usePlural: true, schema },
        },
        // Sessions and rate-limit counters, in the namespace that already
        // holds the payloads and the skill index. Safe because the key spaces
        // cannot collide: a config id is 8 base64url characters, the index key
        // is `skill-index:v1`, and Better Auth prefixes its own.
        // TWO COPIES OF ONE INTERFACE, from two sources that do not know about
        // each other. `wrangler types` writes the Workers runtime types into
        // worker-configuration.d.ts, so `env.CONFIGS` is that file's
        // `KVNamespace`; `better-auth-cloudflare` peers on the
        // `@cloudflare/workers-types` package and its `kv?` is that package's.
        // They are the same API and structurally near-identical, and `tsc`
        // still refuses them — the overloads of `get` differ in one optional
        // parameter. Nothing is being widened or silenced here: it is one
        // handle, and the assertion says only which of two spellings of its
        // type is meant.
        kv: env.CONFIGS as CloudflareKv,
        ...DECLINE_LOCATION,
      }
    : { ...DECLINE_LOCATION }

/**
 * The auth instance, built per request because its inputs are per request.
 *
 * `betterAuth()` is called with bindings that only exist inside a fetch — the
 * D1 handle, the KV handle, the secret — so there is no module-level instance
 * to share, and building one here is cheap next to the database round trip
 * every call makes anyway.
 *
 * THE `env`-LESS BRANCH IS NOT DEAD CODE. `@better-auth/cli generate` imports
 * this module in plain Node to read the configuration and emit the schema, and
 * in that process there are no bindings at all. Without a shape to fall back
 * to, the generator throws before it can read anything, and the schema this
 * whole database depends on cannot be produced.
 */
export const createAuth = (env?: Env) => {
  const options = {
    basePath: AUTH_BASE_PATH,
    ...(env ? { baseURL: env.AUTH_BASE_URL } : {}),
    // Conditional spreads rather than `?.`: `exactOptionalPropertyTypes` is on,
    // so an explicit `undefined` is not the same as an absent key.
    ...(env ? { secret: env.BETTER_AUTH_SECRET } : {}),
    ...withCloudflare(cloudflareOptionsFor(env), {
      // GitHub only. The audience is developers, the app already reads GitHub
      // for skills and marketplaces, and email/password would mean sending
      // mail — infrastructure this repository does not have.
      socialProviders: {
        github: {
          clientId: env?.GITHUB_CLIENT_ID ?? "",
          clientSecret: env?.GITHUB_CLIENT_SECRET ?? "",
        },
      },

      // The editor is the only browser allowed to hold a session.
      trustedOrigins: env ? [env.WEB_ORIGIN] : [],

      advanced: {
        // `agentsinc.sh` and `api.agentsinc.sh` share a registrable domain, so
        // the cookie is SAME-SITE and needs no `SameSite=None` — the usual
        // expensive part of a split SPA/API is not paid here. What it does need
        // is the parent domain, or a cookie set by the API is invisible to the
        // editor.
        //
        // Local dev is localhost:5173 -> localhost:8787: cookies ignore port,
        // so one host is one jar and no domain is needed. `secure` follows the
        // scheme rather than being hard-coded, because a secure cookie is
        // silently dropped over plain http and the symptom is a sign-in that
        // appears to work and never persists.
        crossSubDomainCookies: env?.WEB_ORIGIN.startsWith("https://")
          ? { enabled: true, domain: ".agentsinc.sh" }
          : { enabled: false },
        defaultCookieAttributes: {
          sameSite: "lax",
          secure: env?.WEB_ORIGIN.startsWith("https://") ?? false,
        },
      },

      // The first rate limiting anywhere in this worker. It covers the auth
      // routes and NOTHING ELSE — `POST /configs` is still unlimited, which is
      // a live gap rather than something this closed.
      rateLimit: {
        enabled: true,
        // D1 rather than the KV secondary storage, which is where Better Auth
        // sends these by default once a secondary store exists. Measured, not
        // preferred: `better-auth-cloudflare` 0.3.1 peers on `better-auth`
        // ^1.5 and its KV adapter implements no `increment`, which 1.7 now
        // requires — the run fails outright with "Secondary-storage rate
        // limiting requires SecondaryStorage.increment". Sessions still live
        // in KV, where reads are cheap and the adapter is fine; only the
        // counters moved. Revisit when the adapter catches up.
        storage: "database",
        window: 60,
        max: 100,
        customRules: { "/sign-in/social": { window: 60, max: 5 } },
      },
    }),
    ...(env
      ? {}
      : {
          // No handle at all, and none is needed: this branch exists only for
          // `@better-auth/cli generate`, which reads the configuration in plain
          // Node to emit the schema and issues no query. The adapter's own
          // examples write `{} as D1Database` here; the assertion is
          // superfluous, as `no-unnecessary-type-assertion` says.
          database: drizzleAdapter(
            {},
            {
              provider: "sqlite",
              usePlural: true,
            }
          ),
        }),
  }

  // TSC AND ESLINT DISAGREE ABOUT THIS ASSERTION, and tsc is the one that
  // fails the build, so it wins. Without it tsc rejects the argument: the
  // spread above carries `database?: X | undefined`, and
  // `exactOptionalPropertyTypes` refuses a may-be-present-holding-undefined
  // key where the target declares a plain optional. With it,
  // `no-unnecessary-type-assertion` reports the opposite. The object is
  // lifted to a `const` purely so the disagreement lands on ONE short line
  // that a directive can cover — asserted inline, the report anchors to both
  // ends of a sixty-line literal and no `-next-line` reaches it.
  // `reportUnusedDisableDirectives` will say so the day this stops being
  // needed, which is the day to delete it.
  return betterAuth(options as BetterAuthOptions)
}

/** What `@better-auth/cli generate` loads. Never used at the edge. */
export const auth = createAuth()

/**
 * Who is asking, or `null`.
 *
 * The auth instance is built per request because its inputs are — see
 * `auth.ts`. Reading the session costs a database round trip, so this is
 * called once per request and threaded, never called twice in a handler.
 */
const sessionOf = async (c: Context<WorkerEnv>) =>
  createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  })

/** A session that exists — what a handler behind `authenticated` is handed. */
type SignedIn = NonNullable<Awaited<ReturnType<typeof sessionOf>>>

/**
 * The 401 gate itself, wrapped around a handler that may then assume a person.
 *
 * A wrapper rather than an `app.use` middleware, and the difference is what the
 * type says. A middleware would put the session in a context variable, which
 * types as present whether or not the route reading it is one the middleware
 * was registered for — so a route added without its `app.use` line compiles and
 * throws at the edge. Here the session arrives as an argument, so a handler can
 * only read one by being wrapped in the thing that produced it.
 *
 * It lives HERE rather than beside the stack routes it first served. Left in
 * `stacks.ts`, `compose.ts` had to import that module — and with it drizzle and
 * the app schema — to get an auth wrapper, which is a dependency on a table it
 * never reads.
 */
export const authenticated =
  <C extends Context<WorkerEnv>, R>(
    handle: (c: C, session: SignedIn) => Promise<R>
  ) =>
  async (c: C) => {
    const session = await sessionOf(c)
    if (!session) return c.json({ error: "unauthorized" as const }, 401)

    return handle(c, session)
  }

/**
 * The 401 every route behind `authenticated` answers with, declared once.
 *
 * Beside the wrapper that produces the body rather than in either module that
 * spreads it. `compose.ts` declared its own `z.string()` version, which told
 * the editor's generated client that `error` was any string — a branch for a
 * body this gate cannot produce — and the two spellings could drift without
 * anything reddening.
 *
 * 401 rather than 403, and the distinction is load-bearing for the editor
 * rather than pedantry: "I do not know who you are" is answered with a sign-in
 * control, and "I know, and no" is answered with an error. A route that
 * conflates them makes the editor guess.
 */
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
