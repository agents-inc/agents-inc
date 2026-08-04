import { seedPayloadSchema, type SeedPayload } from "@workspace/matrix"
import { z } from "zod"

import { env } from "@/env"
import { reportIssue } from "@/lib/observability/report"

// The config-sharing worker (apps/server). Dev talks to `wrangler dev` on its
// default port; a deployment points VITE_API_URL at the real thing. There is
// no fallback on purpose — see `env.schema.ts`.
const API_URL = env.VITE_API_URL

const createdSchema = z.object({ id: z.string().min(1) })

export type ShareResult =
  { ok: true; id: string } | { ok: false; error: string }

export type SharedConfigResult =
  { ok: true; payload: SeedPayload } | { ok: false; error: string }

export const createSharedConfig = async (
  payload: SeedPayload
): Promise<ShareResult> => {
  try {
    const response = await fetch(`${API_URL}/configs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
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
    const response = await fetch(`${API_URL}/configs/${encodeURIComponent(id)}`)
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
