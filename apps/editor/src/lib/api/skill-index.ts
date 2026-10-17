import {
  SKILL_INDEX_FRESHNESS_HEADER,
  skillIndexFreshnessSchema,
  skillIndexSchema,
  type SkillIndex,
  type SkillIndexFreshness,
} from "@workspace/matrix/skill-index"

import { reportIssue } from "@/lib/observability/report"

import { api } from "./client"

// The whole index arrives in one response and the dialog filters it in the
// browser.

// `unknown` when the header never arrived, which the wire type cannot express.
export type IndexFreshness = SkillIndexFreshness | "unknown"

export type SkillIndexResult =
  | { ok: true; index: SkillIndex; freshness: IndexFreshness }
  | { ok: false; error: string }

// A missing header is `unknown`, not `stale`: a proxy can strip it, and `stale`
// would caveat a complete list.
const freshnessOf = (response: Response): IndexFreshness => {
  const declared = skillIndexFreshnessSchema.safeParse(
    response.headers.get(SKILL_INDEX_FRESHNESS_HEADER)
  )
  return declared.success ? declared.data : "unknown"
}

// Revalidated: the response types describe the worker this was built against.
export const fetchSkillIndex = async (): Promise<SkillIndexResult> => {
  try {
    const response = await api.skills.$get()

    // A stale index is a 200, so this is a real outage.
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

// `9100` → `9.1k`, `23000` → `23k`, so the result row stays one line.
export const formatStars = (stars: number) => {
  if (stars < 1000) return String(stars)
  const thousands = stars / 1000
  return thousands < 10
    ? `${thousands.toFixed(1).replace(/\.0$/, "")}k`
    : `${Math.round(thousands)}k`
}
