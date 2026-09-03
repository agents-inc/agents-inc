import {
  installableSeedPayloadSchema,
  seedPayloadSchema,
  type SeedPayload,
} from "@workspace/matrix"
import { z } from "zod"

import { reportIssue } from "@/lib/observability/report"

import { api } from "./client"

// Kept even though `api` types the response, because those types describe the
// worker this was *built* against. What answers at runtime is whatever is
// deployed, and this is the seam where that assumption stops being free.
const createdSchema = z.object({ id: z.string().min(1) })

/**
 * Why a share did not produce a link, and nothing about how to say so.
 *
 * Four members rather than a message, because these are four different
 * situations for the person at the keyboard and only two of them name an
 * action. The words belong to whatever is doing the telling — a button has
 * room for three of them and a dialog has room for a sentence — so composing
 * one here would only be a string nothing renders, which is what was here
 * before.
 *
 * - `out-of-date` — this tab is running a bundle from before the last deploy,
 *   so it mints a seed version the worker no longer serves. It fails on this
 *   click and on every click after it, and a reload is the whole fix.
 * - `refused` — the worker answered and would not take it: an outage, a quota,
 *   or a bug here. Nothing to do but try later.
 * - `unreachable` — the request never got an answer at all.
 * - `unwritable` — the configuration itself cannot be installed by anyone, so
 *   there is no point giving it an address. The one refusal decided HERE rather
 *   than read off a response, and the only one whose fix is on screen already.
 */
export type ShareRefusal =
  "out-of-date" | "refused" | "unreachable" | "unwritable"

export type ShareResult =
  { ok: true; id: string } | { ok: false; refusal: ShareRefusal }

// The status the worker spends on "your payload names a seed version I do not
// serve". Its own code rather than a 400, because a 400 is a bug nobody reading
// it can fix and this one is a hard reload — see `apps/server/src/index.ts`.
const OUT_OF_DATE = 409

export type SharedConfigResult =
  { ok: true; payload: SeedPayload } | { ok: false; error: string }

/**
 * What the WRITE contract objects to in this payload, in its own words.
 *
 * The asymmetry it reads is deliberate and documented on the contract itself:
 * `POST /configs` is gated by `installableSeedPayloadSchema`, while everything
 * that mints a payload here uses the lenient base schema on purpose — a
 * configuration carrying a pair nobody can install has to survive local Save
 * and the preview dialog untouched, because opening one and repairing it in a
 * click is the whole of EDITOR-08.
 *
 * So the stricter half applies at the one moment a payload becomes a WRITE,
 * which is this module and not the mint. Every POST the editor makes crosses
 * this function — Share, the install dialog, a signed-in Save, and the local
 * slot a first sign-in adopts — and gating here is what stops a fifth one
 * arriving unprotected the way the last three did (CLI-851).
 *
 * Asked of the SCHEMA rather than of `unwritableSeedAssignments`, and that is
 * the point rather than a shortcut: this is the same object the worker gates
 * on, so a rule added to the write contract tomorrow is enforced here without
 * anyone remembering to come back. Re-implementing today's one rule is how the
 * editor came to be a write client that could not see what the edge refuses.
 *
 * PATH FIRST, because the message alone names half the pair. The refinement in
 * `@workspace/matrix`'s seed contract raises "a project-scoped skill has nowhere
 * to be written on '<agent>', which rests at global scope" at the path
 * `skills.<id>.assignments.<agent>` — so the SUB-AGENT is in the sentence and the
 * SKILL is only in the path. Mapping the messages alone turns three unwritable
 * skills on one sub-agent into three byte-identical strings naming no skill, and
 * a report nobody can act on is the thing this gate exists to replace. The CLI
 * renders the same issues the same way, in `sentenceOf` in `publish-seed.ts`.
 */
const writeContractProblems = (payload: SeedPayload): string[] => {
  const checked = installableSeedPayloadSchema.safeParse(payload)
  if (checked.success) return []

  return checked.error.issues.map(sentenceOf)
}

/** One issue, path first — see the note above on which half of the pair each carries. */
const sentenceOf = ({ path, message }: z.core.$ZodIssue): string => {
  const named = path.join(".")
  return named === "" ? message : `${named}: ${message}`
}

export const createSharedConfig = async (
  payload: SeedPayload
): Promise<ShareResult> => {
  // Before the request rather than after it. A refusal that costs a round trip
  // is the defect this closes, not a friendlier spelling of it: the worker
  // answers 400, which this client cannot tell from any other bad body, and the
  // app narrates that as "Sharing failed" — a sentence naming neither the
  // problem nor the sub-agent one click would fix it on.
  const problems = writeContractProblems(payload)
  if (problems.length > 0) {
    reportIssue("Share POST refused a configuration nobody could install", {
      problems,
    })
    return { ok: false, refusal: "unwritable" }
  }

  try {
    const response = await api.configs.$post({ json: payload })

    // Reported under its own name, and the split is the point of the metric
    // rather than tidiness: this is not a bug in the worker and not an outage,
    // it is how many open tabs a deploy has left behind — which rises after a
    // release and decays on its own, unlike everything below it.
    if (response.status === OUT_OF_DATE) {
      reportIssue("Share POST refused a stale page", { status: OUT_OF_DATE })
      return { ok: false, refusal: "out-of-date" }
    }

    if (!response.ok) {
      // Every one of these is a bug or an outage — the payload passed the same
      // schema the worker gates this route with, so the worker should never
      // refuse it. That sentence used to name the BASE schema and was the
      // reason nobody looked: a 400 was read as impossible while it was the
      // ordinary answer to an unwritable pair. 413 in particular means a real
      // config outgrew the size cap.
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
