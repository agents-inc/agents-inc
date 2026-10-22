import {
  TREE_WIDTH_DEFAULT_PX,
  clampTreeWidth,
} from "@workspace/ui/components/dialog"
import { create } from "zustand"
import { persist } from "zustand/middleware"

import {
  persistedUiSchema,
  type RosterGroupBy,
  type ThemePreference,
} from "./persisted-schema"

import type { MarketplaceRecovery } from "@/features/configure/lib/seat-catalog"
import type { Provider } from "@workspace/compile"

// How long the roster tints agents a selection just reached.
const FLASH_MS = 2600

// What a confirmed switch would replace the selection with. `null` inside a
// stack request is "Start from scratch". A local save travels as its id, and
// an account's as the KV id its payload is behind.
export type StackRequest =
  | { kind: "stack"; stackId: string | null }
  | { kind: "saved"; saveId: string; name: string }
  | { kind: "remote"; configId: string }

type UiState = {
  // Which skill's ••• options panel is showing.
  openPanelSkillId: string | null
  // Switch awaiting confirmation because applying it would discard edits.
  pendingStack: StackRequest | null
  // Which saved marketplace a switch has been asked for, awaiting the
  // confirmation that names what it costs.
  pendingMarketplace: string | null
  dialog: "none" | "install" | "add" | "marketplace" | "output" | "save"
  // Which added skill's contents are on show. Its own field rather than a
  // `dialog` value because it opens over the install dialog, which has to stay
  // open underneath.
  previewSkillId: string | null
  // The output preview's open row, as a path; here because the dialog unmounts
  // on close.
  outputSelection: string | null
  // Both survive a close, like `outputSelection`. The width is in design
  // pixels.
  outputFullscreen: boolean
  outputTreeWidth: number
  // Group key → that roster accordion is shut. Domain mode keys it by the bare
  // domain id and scope mode by `scope:<scope>`, so one record serves both.
  rosterCollapsed: Record<string, boolean>
  rosterGroupBy: RosterGroupBy
  // One fold per step title. The skills fold is not persisted, so a reload or
  // a `?domain=` link always lands on the grid.
  providerCollapsed: boolean
  stackCollapsed: boolean
  agentsCollapsed: boolean
  skillsCollapsed: boolean
  // `system` follows the machine.
  theme: ThemePreference
  // What the last catalogue seat had to say, and what is parked behind the
  // marketplace dialog.
  catalogueNotice: string | null
  marketplaceRecovery: MarketplaceRecovery | null
  // Agents currently pulsing in the roster because a selection reached them.
  flashedAgentIds: string[]
  // Not in `config-store`: it never enters the payload. Transient, so a reload
  // lands on Claude.
  provider: Provider

  openPanel: (skillId: string | null) => void
  togglePanel: (skillId: string) => void
  requestStack: (request: StackRequest) => void
  dismissStackRequest: () => void
  requestMarketplace: (marketplace: string) => void
  dismissMarketplaceRequest: () => void
  setDialog: (dialog: UiState["dialog"]) => void
  previewSkill: (skillId: string | null) => void
  selectOutputNode: (path: string) => void
  toggleOutputFullscreen: () => void
  exitOutputFullscreen: () => void
  setOutputTreeWidth: (width: number) => void
  toggleRosterDomain: (groupKey: string) => void
  setRosterGroupBy: (groupBy: RosterGroupBy) => void
  toggleProviderCollapsed: () => void
  toggleStackCollapsed: () => void
  toggleAgentsCollapsed: () => void
  toggleSkillsCollapsed: () => void
  setTheme: (theme: ThemePreference) => void
  sayCatalogue: (notice: string | null) => void
  parkCatalogue: (recovery: MarketplaceRecovery, waiting: string) => void
  flashAgents: (agentIds: string[]) => void
  clearFlash: () => void
  setProvider: (provider: Provider) => void
}

// Module-level, not state: the pending timer is an implementation detail of
// the decay, and a re-render must never restart it.
let flashTimer: ReturnType<typeof setTimeout> | undefined

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      openPanelSkillId: null,
      pendingStack: null,
      pendingMarketplace: null,
      dialog: "none",
      previewSkillId: null,
      outputSelection: null,
      outputFullscreen: false,
      outputTreeWidth: TREE_WIDTH_DEFAULT_PX,
      rosterCollapsed: {},
      rosterGroupBy: "domain",
      providerCollapsed: false,
      stackCollapsed: false,
      agentsCollapsed: false,
      skillsCollapsed: false,
      theme: "system",
      catalogueNotice: null,
      marketplaceRecovery: null,
      flashedAgentIds: [],
      provider: "claude",

      openPanel: (skillId) => set({ openPanelSkillId: skillId }),
      togglePanel: (skillId) =>
        set((state) => ({
          openPanelSkillId: state.openPanelSkillId === skillId ? null : skillId,
        })),

      requestStack: (request) => set({ pendingStack: request }),
      dismissStackRequest: () => set({ pendingStack: null }),
      requestMarketplace: (marketplace) =>
        set({ pendingMarketplace: marketplace }),
      dismissMarketplaceRequest: () => set({ pendingMarketplace: null }),
      setDialog: (dialog) => set({ dialog }),
      previewSkill: (skillId) => set({ previewSkillId: skillId }),
      selectOutputNode: (outputSelection) => set({ outputSelection }),

      toggleOutputFullscreen: () =>
        set((state) => ({ outputFullscreen: !state.outputFullscreen })),
      // Not the toggle: `esc` has to leave fullscreen without asking which
      // state it is in.
      exitOutputFullscreen: () => set({ outputFullscreen: false }),
      // Clamped here so every caller is held to the bound.
      setOutputTreeWidth: (width) =>
        set({ outputTreeWidth: clampTreeWidth(width) }),

      toggleRosterDomain: (groupKey) =>
        set((state) => ({
          rosterCollapsed: {
            ...state.rosterCollapsed,
            [groupKey]: !state.rosterCollapsed[groupKey],
          },
        })),

      // No reset of `rosterCollapsed`: the two modes key it in disjoint spaces.
      setRosterGroupBy: (rosterGroupBy) => set({ rosterGroupBy }),
      toggleProviderCollapsed: () =>
        set((state) => ({ providerCollapsed: !state.providerCollapsed })),
      toggleStackCollapsed: () =>
        set((state) => ({ stackCollapsed: !state.stackCollapsed })),
      toggleAgentsCollapsed: () =>
        set((state) => ({ agentsCollapsed: !state.agentsCollapsed })),
      toggleSkillsCollapsed: () =>
        set((state) => ({ skillsCollapsed: !state.skillsCollapsed })),

      // Set rather than toggled: under `system`, what is on screen is the
      // machine's answer, which only the rail can see.
      setTheme: (theme) => set({ theme }),

      // An outcome ends whatever was parked, so the recovery clears with it.
      sayCatalogue: (catalogueNotice) =>
        set({ catalogueNotice, marketplaceRecovery: null }),

      // One `set`: a render between any two of these would show half a state.
      parkCatalogue: (marketplaceRecovery, waiting) =>
        set({
          marketplaceRecovery,
          catalogueNotice: waiting,
          dialog: "marketplace",
        }),

      // Each pulse replaces the last. An empty list schedules no decay.
      flashAgents: (agentIds) => {
        clearTimeout(flashTimer)
        set({ flashedAgentIds: agentIds })
        if (agentIds.length === 0) return

        flashTimer = setTimeout(() => set({ flashedAgentIds: [] }), FLASH_MS)
      },

      // Writes the provider only. What a switch to Codex does to remembered
      // skills is `config-store`'s, called by the press that switches.
      setProvider: (provider) => set({ provider }),

      // For when the selection a pulse narrates is gone.
      clearFlash: () => {
        clearTimeout(flashTimer)
        set({ flashedAgentIds: [] })
      },
    }),
    {
      name: "agents-inc:ui:v1",
      // NOT bumped when a field is added: with no `migrate`, a bump silently
      // discards every visitor's arrangement. New keys are `.catch()`-ed.
      version: 3,
      // Arrangement only. Everything else is transient.
      partialize: ({
        rosterCollapsed,
        rosterGroupBy,
        providerCollapsed,
        stackCollapsed,
        agentsCollapsed,
        theme,
      }) => ({
        rosterCollapsed,
        rosterGroupBy,
        providerCollapsed,
        stackCollapsed,
        agentsCollapsed,
        theme,
      }),
      merge: (persisted, current) => {
        const parsed = persistedUiSchema.safeParse(persisted)
        return parsed.success ? { ...current, ...parsed.data } : current
      },
    }
  )
)
