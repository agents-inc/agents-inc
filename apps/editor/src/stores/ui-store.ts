import { create } from "zustand"
import { persist } from "zustand/middleware"

import { persistedUiSchema } from "./persisted-schema"

// How long the roster tints agents that a selection just reached — the design
// prototype's `flashMs` default.
const FLASH_MS = 2600

// What a confirmed switch would replace the selection with. `null` inside a
// stack request is "Start from scratch"; the saved snapshot has no catalogue
// id to travel as, so it says only which slot to read.
export type StackRequest =
  { kind: "stack"; stackId: string | null } | { kind: "saved" }

type UiState = {
  // Which skill's ••• options panel is showing. Only one at a time.
  openPanelSkillId: string | null
  // Switch awaiting confirmation because applying it would discard edits.
  pendingStack: StackRequest | null
  dialog: "none" | "install" | "add"
  // Domain id → that roster accordion is shut.
  rosterCollapsed: Record<string, boolean>
  // Agents currently pulsing in the roster because a selection reached them.
  flashedAgentIds: string[]

  openPanel: (skillId: string | null) => void
  togglePanel: (skillId: string) => void
  requestStack: (request: StackRequest) => void
  dismissStackRequest: () => void
  setDialog: (dialog: UiState["dialog"]) => void
  toggleRosterDomain: (domainId: string) => void
  flashAgents: (agentIds: string[]) => void
  clearFlash: () => void
}

// Module-level, not state: the pending timer is an implementation detail of
// the decay, and a re-render must never restart it.
let flashTimer: ReturnType<typeof setTimeout> | undefined

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      openPanelSkillId: null,
      pendingStack: null,
      dialog: "none",
      rosterCollapsed: {},
      flashedAgentIds: [],

      openPanel: (skillId) => set({ openPanelSkillId: skillId }),
      togglePanel: (skillId) =>
        set((state) => ({
          openPanelSkillId: state.openPanelSkillId === skillId ? null : skillId,
        })),

      requestStack: (request) => set({ pendingStack: request }),
      dismissStackRequest: () => set({ pendingStack: null }),
      setDialog: (dialog) => set({ dialog }),

      toggleRosterDomain: (domainId) =>
        set((state) => ({
          rosterCollapsed: {
            ...state.rosterCollapsed,
            [domainId]: !state.rosterCollapsed[domainId],
          },
        })),

      // Each pulse replaces the last: a second selection re-tints its own
      // agents and the whole set decays together. Flashing nobody is how a
      // caller says "that selection is gone" — no decay left to schedule.
      flashAgents: (agentIds) => {
        clearTimeout(flashTimer)
        set({ flashedAgentIds: agentIds })
        if (agentIds.length === 0) return

        flashTimer = setTimeout(() => set({ flashedAgentIds: [] }), FLASH_MS)
      },

      // A pulse narrates a selection; when that selection is gone — deselect,
      // stack switch, import — the pulse must not outlive it.
      clearFlash: () => {
        clearTimeout(flashTimer)
        set({ flashedAgentIds: [] })
      },
    }),
    {
      name: "agents-inc:ui:v1",
      version: 3,
      // Everything else is ephemeral — reloading into an open panel or dialog is never right.
      partialize: ({ rosterCollapsed }) => ({ rosterCollapsed }),
      merge: (persisted, current) => {
        const parsed = persistedUiSchema.safeParse(persisted)
        return parsed.success ? { ...current, ...parsed.data } : current
      },
    }
  )
)
