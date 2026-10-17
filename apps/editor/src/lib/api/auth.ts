import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

import { authFetch } from "./client"

// Better Auth called directly rather than through its client, to stay under the
// first-paint budget. `authFetch` because `AppType` does not describe these
// routes.

// Only the fields the rail draws.
const sessionSchema = z
  .object({ user: z.object({ id: z.string(), name: z.string() }) })
  .nullable()

export type Session = z.infer<typeof sessionSchema>

/** A network failure is `null` too: signed-out is fully usable. */
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

/** Returned as a value: every caller is a `void`-ed click handler. */
export type AuthRefusal = "too-many" | "refused" | "unreachable"

export type AuthResult = { ok: true } | { ok: false; refusal: AuthRefusal }

const TOO_MANY = 429

const refusalOf = (status: number): AuthRefusal =>
  status === TOO_MANY ? "too-many" : "refused"

/**
 * Navigates away; the worker's callback returns with the cookie set. The URL
 * carries per-attempt OAuth state, so it is asked for.
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

    // Never read the body: a limiter's plain text or a gateway's HTML is not
    // JSON.
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
    // Better Auth answers 415 without `content-type` and 400 without a body.
    const response = await authFetch("sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
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
