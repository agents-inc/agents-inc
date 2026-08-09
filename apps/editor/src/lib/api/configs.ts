import { seedPayloadSchema, type SeedPayload } from "@workspace/matrix"
import { hc } from "hono/client"
import { z } from "zod"

import { env } from "@/env"
import { reportIssue } from "@/lib/observability/report"

import type { AppType } from "server"

// The config-sharing worker (apps/server). Dev talks to `wrangler dev` on its
// default port; a deployment points VITE_API_URL at the real thing. There is
// no fallback on purpose — see `env.schema.ts`.
const API_URL = env.VITE_API_URL

// The worker's own route types, read straight off the app it exports, so the
// two calls below cannot drift from what it serves: a renamed path or a
// changed body shape fails this file rather than a share link. `AppType` is a
// type and nothing else — `import type` erases before the bundler sees it, so
// no worker code is reachable from here.
const api = hc<AppType>(API_URL)

// Kept even though `api` types the response, because those types describe the
// worker this was *built* against. What answers at runtime is whatever is
// deployed, and this is the seam where that assumption stops being free.
const createdSchema = z.object({ id: z.string().min(1) })

export type ShareResult =
  { ok: true; id: string } | { ok: false; error: string }

export type SharedConfigResult =
  { ok: true; payload: SeedPayload } | { ok: false; error: string }

export const createSharedConfig = async (
  payload: SeedPayload
): Promise<ShareResult> => {
  try {
    const response = await api.configs.$post({ json: payload })
    if (!response.ok) {
      // Every one of these is a bug or an outage — the payload was built from
      // the contract's own schema, so the worker should never refuse it. 413
      // in particular means a real config outgrew the size cap.
      reportIssue("Share POST rejected", { status: response.status })
      return { ok: false, error: `sharing failed (${response.status})` }
    }

    const parsed = createdSchema.safeParse(await response.json())
    if (!parsed.success) {
      reportIssue("Share POST returned an unreadable body")
      return { ok: false, error: "sharing failed (unreadable response)" }
    }

    return { ok: true, id: parsed.data.id }
  } catch {
    reportIssue("Share POST could not reach the worker")
    return { ok: false, error: "sharing service unreachable" }
  }
}

// The response is revalidated against the contract even though the worker
// validated it on the way in — this client has no reason to trust a URL
// someone typed by hand any further than it trusts localStorage.
export const fetchSharedConfig = async (
  id: string
): Promise<SharedConfigResult> => {
  try {
    // Encoded here rather than by the client: hc splices a param into the path
    // verbatim, so keeping a pasted id to one path segment — rather than
    // letting a stray `/` or `#` in it rewrite the request — is still this
    // module's job, exactly as it was when the URL was a template string.
    const response = await api.configs[":id"].$get({
      param: { id: encodeURIComponent(id) },
    })
    // A 404 is an ordinary dead link — someone mistyped or the id never
    // existed. Reporting it would bury the real failures below in noise.
    if (response.status === 404) {
      return { ok: false, error: "this share link points to nothing" }
    }
    if (!response.ok) {
      reportIssue("Share GET failed", { status: response.status })
      return {
        ok: false,
        error: `loading the shared config failed (${response.status})`,
      }
    }

    const parsed = seedPayloadSchema.safeParse(await response.json())
    if (!parsed.success) {
      // Stored payloads were validated on the way in, so a stored config that
      // no longer parses means the contract moved underneath them.
      reportIssue("Stored config no longer matches the seed contract")
      return { ok: false, error: "this share link holds an unreadable config" }
    }

    return { ok: true, payload: parsed.data }
  } catch {
    reportIssue("Share GET could not reach the worker")
    return { ok: false, error: "sharing service unreachable" }
  }
}
