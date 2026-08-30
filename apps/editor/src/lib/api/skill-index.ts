import {
  SKILL_INDEX_FRESHNESS_HEADER,
  skillIndexFreshnessSchema,
  skillIndexSchema,
  type SkillIndex,
  type SkillIndexFreshness,
} from "@workspace/matrix/skill-index"

import { reportIssue } from "@/lib/observability/report"

import { api } from "./client"

// The federated skill index — the add-skills dialog's search surface, and the
// app's only other call to the worker. The whole index arrives in one response
// and the dialog filters it in the browser, which is what removes the per-
// keystroke request and the rate limit the old GitHub search had to design
// around.
//
// THE SHARED CLIENT, not its own. This file argued for a second `hc` call on
// the grounds that two are cheaper than a module every api file reaches
// through — which was true about lines of code and wrong about what a client
// carries. The shared one states `credentials: "include"` once; a second call
// silently omitted it, so `GET /skills` went out as `same-origin` while every
// other worker call carried the session. Nothing depended on that today, and
// nothing warned either.

// What the caller learns about the list it just received. `fresh` and `stale`
// are the worker's own two words; `unknown` is a third answer the wire type
// cannot express, for the case where the header never reached us — see
// `freshnessOf`.
export type IndexFreshness = SkillIndexFreshness | "unknown"

export type SkillIndexResult =
  | { ok: true; index: SkillIndex; freshness: IndexFreshness }
  | { ok: false; error: string }

// Whether the list is everything — the half of the answer a body cannot carry.
//
// A header that did not arrive is `unknown` and not `stale`, and the
// difference is the whole reason this function exists. Both mean "ask again
// later", but only one of them is a statement the caller may repeat to a user:
// folding them together would put a permanent "still filling" caveat on a
// complete list.
//
// Not arriving is the defensive case now and was the ordinary one until the
// worker named this header in `Access-Control-Expose-Headers` — without that a
// custom response header is invisible to a cross-origin caller, so every
// browser read landed here and the fresh/stale distinction was unreachable in
// production. The worker names it now, and this branch stays anyway: exposure
// is the worker's to withdraw, and anything between it and the browser can
// strip a response header without either end being told.
const freshnessOf = (response: Response): IndexFreshness => {
  const declared = skillIndexFreshnessSchema.safeParse(
    response.headers.get(SKILL_INDEX_FRESHNESS_HEADER)
  )
  return declared.success ? declared.data : "unknown"
}

// Revalidated against the contract even though `api` types the response, for
// the reason `configs.ts` gives: those types describe the worker this was
// *built* against, and what answers at runtime is whatever is deployed.
export const fetchSkillIndex = async (): Promise<SkillIndexResult> => {
  try {
    const response = await api.skills.$get()

    // The route's only refusal, and it means what it says: nothing cached at
    // all AND an upstream that will not answer. A stale index is a 200, so
    // reaching here is genuinely an outage rather than a degraded answer.
    if (!response.ok) {
      reportIssue("Skill index GET failed", { status: response.status })
      return {
        ok: false,
        error: `loading the skill index failed (${response.status})`,
      }
    }

    const parsed = skillIndexSchema.safeParse(await response.json())
    if (!parsed.success) {
      reportIssue("Skill index returned an unreadable body")
      return { ok: false, error: "the skill index is unreadable" }
    }

    return { ok: true, index: parsed.data, freshness: freshnessOf(response) }
  } catch {
    reportIssue("Skill index GET could not reach the worker")
    return { ok: false, error: "the skill index is unreachable" }
  }
}

// `9100` → `9.1k`, `23000` → `23k`. Lives here rather than in the dialog
// because the design's result row is a single line — a repository with 268868
// stars written in full wraps it — and string arithmetic with those boundaries
// is cheaper to pin down in a unit test than by reading pixels in a browser.
export const formatStars = (stars: number) => {
  if (stars < 1000) return String(stars)
  const thousands = stars / 1000
  return thousands < 10
    ? `${thousands.toFixed(1).replace(/\.0$/, "")}k`
    : `${Math.round(thousands)}k`
}
