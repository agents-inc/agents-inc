import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

import { authFetch } from "./client"

// The worker's auth surface, called directly rather than through
// `better-auth`'s own React client.
//
// THAT IS A BUDGET DECISION, NOT A PREFERENCE. `scripts/first-paint-budget.ts`
// fails the build past a fixed first-paint weight, and the whole of what this
// app needs from Better Auth is three plain HTTP calls — who am I, take me to
// GitHub, sign me out. Pulling a client library into the bundle to make three
// fetches would spend the budget on a wrapper. If this grows past organisations
// or two-factor, take the library and the weight together.
//
// `authFetch` rather than `api` because these paths are the one part of the
// worker `AppType` does not describe — Better Auth serves them all from a
// single `app.on` mount — so there is nothing for `hc` to type. It is the same
// base URL and the same session policy either way; see `client.ts`.

// Only what is drawn. Better Auth returns much more, and a schema that named it
// would be a second copy of somebody else's contract to keep in step — this one
// fails only if the two fields the rail renders stop arriving.
const sessionSchema = z
  .object({ user: z.object({ id: z.string(), name: z.string() }) })
  .nullable()

export type Session = z.infer<typeof sessionSchema>

/**
 * Who is signed in, or `null`.
 *
 * A network failure is `null` too, deliberately: signed-out is the state this
 * app is fully usable in, so an unreachable worker degrades to the experience
 * every visitor has anyway rather than to an error nobody can act on.
 */
export const readSession = async (): Promise<Session> => {
  try {
    const response = await authFetch("get-session")
    if (!response.ok) return null

    const parsed = sessionSchema.safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const redirectSchema = z.object({ url: z.string().url() })

/**
 * Why a click on Sign in or Sign out did not do what it says, and nothing
 * about how to say so.
 *
 * The same shape `ShareResult` uses in `api/configs.ts`, for the same reason:
 * these are different situations for the person at the keyboard, and the words
 * belong to whatever is doing the telling. What matters here is that they come
 * back as a VALUE — every caller is a `void`-ed click handler, so a client that
 * throws puts the failure somewhere only a console shows it.
 *
 * - `too-many` — the auth routes are rate limited, and sign-in has a tighter
 *   rule than the rest; `apps/server/src/auth.ts` carries the windows. Waiting
 *   is the whole fix.
 * - `refused` — the worker answered and would not start the flow.
 * - `unreachable` — the request never got an answer at all.
 */
export type AuthRefusal = "too-many" | "refused" | "unreachable"

export type AuthResult = { ok: true } | { ok: false; refusal: AuthRefusal }

const TOO_MANY = 429

const refusalOf = (status: number): AuthRefusal =>
  status === TOO_MANY ? "too-many" : "refused"

/**
 * Leaves for GitHub, and does not come back — the worker's callback returns the
 * browser to `callbackURL` with the cookie set. `{ ok: true }` is therefore a
 * navigation already under way rather than a page that stayed.
 *
 * The URL is asked for rather than constructed: it carries state Better Auth
 * mints per attempt, and building it here would mean reimplementing the half of
 * OAuth that exists to stop somebody else's request being replayed as yours.
 */
export const signIn = async (): Promise<AuthResult> => {
  try {
    const response = await authFetch("sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "github",
        callbackURL: window.location.href,
      }),
    })

    // The body of a refusal is never read, which is what keeps a rate
    // limiter's plain-text "Too many requests" — or a gateway's HTML — from
    // being parsed as JSON and thrown at nobody.
    if (!response.ok) {
      reportIssue("Sign-in refused", { status: response.status })
      return { ok: false, refusal: refusalOf(response.status) }
    }

    const parsed = redirectSchema.safeParse(await response.json())
    if (!parsed.success) {
      reportIssue("Sign-in returned no redirect")
      return { ok: false, refusal: "refused" }
    }

    window.location.assign(parsed.data.url)
    return { ok: true }
  } catch {
    reportIssue("Sign-in could not reach the worker")
    return { ok: false, refusal: "unreachable" }
  }
}

export const signOut = async (): Promise<AuthResult> => {
  try {
    const response = await authFetch("sign-out", { method: "POST" })
    if (!response.ok) {
      reportIssue("Sign-out refused", { status: response.status })
      return { ok: false, refusal: refusalOf(response.status) }
    }

    return { ok: true }
  } catch {
    reportIssue("Sign-out could not reach the worker")
    return { ok: false, refusal: "unreachable" }
  }
}
