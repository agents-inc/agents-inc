import { retryAfterSeconds } from "@workspace/api"
import {
  installableSeedPayloadSchema,
  seedPayloadSchema,
  type SeedPayload,
} from "@workspace/matrix"
import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

import { api } from "./client"

// The response types describe the worker this was built against, not the one
// deployed.
const createdSchema = z.object({ id: z.string().min(1) })

/**
 * Why a share did not produce a link; the words belong to whoever renders it.
 * `out-of-date`: a stale bundle, fixed by a reload. `unwritable`: decided here,
 * before the POST.
 */
export type ShareRefusal =
  "out-of-date" | "refused" | "unreachable" | "unwritable"

/** A `refused`, plus the window for a surface that says when to try again. */
export type RateLimited = {
  ok: false
  refusal: "refused"
  retryAfterSeconds: number
}

export type ShareResult =
  { ok: true; id: string } | { ok: false; refusal: ShareRefusal } | RateLimited

export const isRateLimited = (result: ShareResult): result is RateLimited =>
  "retryAfterSeconds" in result

// Its own code because the fix is a hard reload.
const OUT_OF_DATE = 409

const TOO_MANY = 429

// A 429 naming no window is not this worker's limiter.
const rateLimitOf = (response: {
  status: number
  headers: Headers
}): RateLimited | null => {
  if (response.status !== TOO_MANY) return null

  const seconds = retryAfterSeconds(response)
  return seconds === null
    ? null
    : { ok: false, refusal: "refused", retryAfterSeconds: seconds }
}

export type SharedConfigResult =
  { ok: true; payload: SeedPayload } | { ok: false; error: string }

/**
 * Asks the write contract itself, which `POST /configs` gates on, so a new rule
 * is enforced here too. Path first: the message names the sub-agent and only
 * the path names the skill.
 */
const writeContractProblems = (payload: SeedPayload): string[] => {
  const checked = installableSeedPayloadSchema.safeParse(payload)
  if (checked.success) return []

  return checked.error.issues.map(sentenceOf)
}

const sentenceOf = ({ path, message }: z.core.$ZodIssue): string => {
  const named = path.join(".")
  return named === "" ? message : `${named}: ${message}`
}

export const createSharedConfig = async (
  payload: SeedPayload
): Promise<ShareResult> => {
  // Before the request, so the visitor sees which skill and sub-agent to fix.
  const problems = writeContractProblems(payload)
  if (problems.length > 0) {
    reportIssue("Share POST refused a configuration nobody could install", {
      problems,
    })
    return { ok: false, refusal: "unwritable" }
  }

  try {
    const response = await api.configs.$post({ json: payload })

    // Its own metric: tabs a deploy left behind, not a bug.
    if (response.status === OUT_OF_DATE) {
      reportIssue("Share POST refused a stale page", { status: OUT_OF_DATE })
      return { ok: false, refusal: "out-of-date" }
    }

    // Its own metric: says whether the limit is sized right.
    const limited = rateLimitOf(response)
    if (limited) {
      reportIssue("Share POST hit the rate limit", {
        retryAfterSeconds: limited.retryAfterSeconds,
      })
      return limited
    }

    if (!response.ok) {
      // The payload passed the worker's own schema, so any refusal is a bug or
      // an outage.
      reportIssue("Share POST rejected", { status: response.status })
      return { ok: false, refusal: "refused" }
    }

    const parsed = createdSchema.safeParse(await response.json())
    if (!parsed.success) {
      reportIssue("Share POST returned an unreadable body")
      return { ok: false, refusal: "refused" }
    }

    return { ok: true, id: parsed.data.id }
  } catch {
    reportIssue("Share POST could not reach the worker")
    return { ok: false, refusal: "unreachable" }
  }
}

// Revalidated: the id came from a URL someone may have typed.
export const fetchSharedConfig = async (
  id: string
): Promise<SharedConfigResult> => {
  try {
    // Encoded here: hc splices a param into the path verbatim.
    const response = await api.configs[":id"].$get({
      param: { id: encodeURIComponent(id) },
    })
    // A dead link is ordinary, so not reported.
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
