import type { ShareRefusal } from "@/lib/api/configs"

// Every event the app can emit, as one discriminated union. Adding a call
// site means adding a member here first, which is what stops event names
// drifting into `skill_toggle` / `skillToggled` / `toggle_skill` — the failure
// that quietly makes a funnel unqueryable months later.
//
// Nothing here may carry free text the user typed. The one field that could
// (the GitHub search box) is reduced to a result count on purpose.
export type AnalyticsEvent =
  // ── The funnel, in order ────────────────────────────────────────────────
  | { name: "stack_applied"; stackId: string | null }
  | {
      name: "skill_toggled"
      skillId: string
      domainId: string
      selected: boolean
    }
  // A click on a dimmed cell. The highest-value event here: it measures
  // whether the 40% dim reads as "unavailable" or as "broken", and it is the
  // only direct evidence for the skills that declare no relationships.
  | { name: "skill_blocked"; skillId: string; reason: string }
  | { name: "skill_configured"; skillId: string; field: string; value: string }
  | { name: "assignment_cycled"; skillId: string; agentId: string }
  | { name: "agent_pinned"; agentId: string; on: boolean }
  | { name: "agent_configured"; agentId: string; field: string; value: string }

  // ── Session skills ──────────────────────────────────────────────────────
  // `resultCount: 0` is a catalog gap someone went looking for.
  | { name: "skill_searched"; resultCount: number }
  | { name: "skill_added"; fullName: string }

  // ── The only two conversions the product has ────────────────────────────
  | { name: "install_opened"; skillCount: number; agentCount: number }
  // The ending rather than a boolean. `ok: false` counted four different
  // things as one number: a browser tab running a bundle from before the last
  // deploy, a store outage, a laptop off the network — and a link that WAS
  // minted and only failed to reach the clipboard, which is not a failed share
  // at all. `reportIssue` has told them apart since the client learned to
  // classify them, so a stale-tab spike after a release was visible in Sentry
  // and invisible here. `ShareRefusal` is shared rather than restated, so a
  // fourth refusal cannot arrive without arriving in the funnel too.
  | { name: "share_result"; outcome: ShareRefusal | "copied" | "copy-refused" }
  | { name: "config_imported"; skillCount: number }

export type AnalyticsEventName = AnalyticsEvent["name"]
