import type { ShareRefusal } from "@/lib/api/configs"

// Every event the app can emit. No field may carry text the user typed.
export type AnalyticsEvent =
  | { name: "stack_applied"; stackId: string | null }
  | {
      name: "skill_toggled"
      skillId: string
      domainId: string
      selected: boolean
    }
  // A click on a dimmed cell.
  | { name: "skill_blocked"; skillId: string; reason: string }
  | { name: "skill_configured"; skillId: string; field: string; value: string }
  | { name: "assignment_cycled"; skillId: string; agentId: string }
  | { name: "agent_pinned"; agentId: string; on: boolean }
  | { name: "agent_configured"; agentId: string; field: string; value: string }
  | { name: "skill_searched"; resultCount: number }
  | { name: "skill_added"; fullName: string }
  | { name: "install_opened"; skillCount: number; agentCount: number }
  | { name: "share_result"; outcome: ShareRefusal | "copied" | "copy-refused" }
  | { name: "config_imported"; skillCount: number }
