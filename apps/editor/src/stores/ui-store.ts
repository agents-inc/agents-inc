import { create } from "zustand"
import { persist } from "zustand/middleware"

import {
  persistedUiSchema,
  type RosterGroupBy,
  type ThemePreference,
} from "./persisted-schema"

import type { MarketplaceRecovery } from "@/features/configure/lib/seat-catalog"

// How long the roster tints agents that a selection just reached — the design
// prototype's `flashMs` default.
const FLASH_MS = 2600

// What a confirmed switch would replace the selection with. `null` inside a
// stack request is "Start from scratch"; the saved snapshot has no catalogue
// id to travel as, so it says only which slot to read.
export type StackRequest =
  | { kind: "stack"; stackId: string | null }
  | { kind: "saved" }
  // An account's saved stack. It carries the KV id rather than the payload,
  // because that is all a saved stack IS — applying one is a fetch, which is
  // exactly what opening a share link already does.
  | { kind: "remote"; configId: string }

type UiState = {
  // Which skill's ••• options panel is showing. Only one at a time.
  openPanelSkillId: string | null
  // Switch awaiting confirmation because applying it would discard edits.
  pendingStack: StackRequest | null
  // Which saved marketplace a switch has been asked for, awaiting the
  // confirmation that names what it costs. Its own field rather than a
  // `StackRequest` variant: seating a different catalogue and applying a stack
  // replace the same selection, but only one of them can be described before it
  // happens, and only that one has a catalogue to fetch first.
  pendingMarketplace: string | null
  dialog: "none" | "install" | "add" | "marketplace" | "output"
  // Which added skill's contents are on show, over whatever else is open.
  //
  // Its own field rather than another `dialog` value, because the install
  // dialog is one of the two ways in: reading what a skill holds is a question
  // asked ABOUT the list of what is going to be written, so that list has to
  // still be there underneath and still be there afterwards.
  previewSkillId: string | null
  // Which row of the output preview's tree is open, as its path.
  //
  // Here rather than inside the dialog, and that is the whole of criterion 8:
  // the dialog unmounts on close, so a component-local selection would start
  // over every time and the fallback would never have a stale selection to
  // resolve. The tree is regenerated from live state on every render — flipping
  // a scope relocates rows constantly — so a path that no longer names a row is
  // the normal case rather than an error, and it resolves to the project root's
  // `config.ts` rather than blanking the pane.
  //
  // Not persisted, like every other transient field here: reloading into a
  // selection is never right.
  outputSelection: string | null
  // Group key → that roster accordion is shut. Domain mode keys it by the bare
  // domain id and scope mode by `scope:<scope>`, so one record serves both.
  rosterCollapsed: Record<string, boolean>
  // How the roster bands its agents. Arrangement, like the record above.
  rosterGroupBy: RosterGroupBy
  // Whether the stack grid under the first hinge is folded away.
  stackCollapsed: boolean
  // Which palette to paint in, and `system` is the default rather than a
  // fallback: a visitor who has never touched the glyph follows their machine,
  // in both directions, for as long as they never touch it.
  theme: ThemePreference
  // What the last act that seated a catalogue had to say for itself, in one
  // line above the grid, and whatever is parked behind the marketplace dialog
  // waiting on a catalogue that would not load.
  //
  // Here rather than in `useCatalogFirst`'s own `useState`, and that is
  // EDITOR-59 rather than tidying. Opening an address is not the only thing
  // that seats a catalogue: applying a saved stack fetches the same payload
  // from the same route and owes the same three answers — seat first, park
  // when it will not load, name what could not be placed. It is not an address
  // change, so nothing keyed per address could ever reach it. One home,
  // whichever door writes it.
  catalogueNotice: string | null
  marketplaceRecovery: MarketplaceRecovery | null
  // Agents currently pulsing in the roster because a selection reached them.
  flashedAgentIds: string[]

  openPanel: (skillId: string | null) => void
  togglePanel: (skillId: string) => void
  requestStack: (request: StackRequest) => void
  dismissStackRequest: () => void
  requestMarketplace: (marketplace: string) => void
  dismissMarketplaceRequest: () => void
  setDialog: (dialog: UiState["dialog"]) => void
  previewSkill: (skillId: string | null) => void
  selectOutputNode: (path: string) => void
  toggleRosterDomain: (groupKey: string) => void
  setRosterGroupBy: (groupBy: RosterGroupBy) => void
  toggleStackCollapsed: () => void
  setTheme: (theme: ThemePreference) => void
  sayCatalogue: (notice: string | null) => void
  parkCatalogue: (recovery: MarketplaceRecovery, waiting: string) => void
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
      pendingMarketplace: null,
      dialog: "none",
      previewSkillId: null,
      outputSelection: null,
      rosterCollapsed: {},
      rosterGroupBy: "domain",
      stackCollapsed: false,
      theme: "system",
      catalogueNotice: null,
      marketplaceRecovery: null,
      flashedAgentIds: [],

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

      toggleRosterDomain: (groupKey) =>
        set((state) => ({
          rosterCollapsed: {
            ...state.rosterCollapsed,
            [groupKey]: !state.rosterCollapsed[groupKey],
          },
        })),

      // The banding changes; the collapsed record does NOT. The two modes key
      // it in disjoint spaces, so switching cannot collapse a band the other
      // mode's visitor never shut — which is why there is no reset here.
      setRosterGroupBy: (rosterGroupBy) => set({ rosterGroupBy }),
      toggleStackCollapsed: () =>
        set((state) => ({ stackCollapsed: !state.stackCollapsed })),

      // Set rather than toggled, because the toggle is not a property of the
      // stored value: the glyph flips whatever is ON SCREEN, and what is on
      // screen while the preference is `system` is the machine's answer. Only
      // the rail can see that, so only the rail can name the other one.
      setTheme: (theme) => set({ theme }),

      // An outcome ENDS whatever was parked, which is why the two fields move
      // together. A line saying what the seated catalogue cost is the answer
      // the recovery was waiting for, and a recovery left standing beside it
      // would go on offering to finish an import that has already finished.
      sayCatalogue: (catalogueNotice) =>
        set({ catalogueNotice, marketplaceRecovery: null }),

      // One `set` rather than three, because these are one state: the line
      // above the grid, the thing waiting behind it, and the dialog that can
      // resolve it. A render between any two of them is a dialog with nothing
      // in it or a sentence with nothing behind it.
      //
      // The dialog stays the single owner of whether it is open, so the
      // request arrives here the same way the floating button's does.
      // Cancelling therefore closes it without discarding anything: the notice
      // says what is still waiting, and re-opening it from the button offers
      // the same pre-filled form and the same way to finish.
      parkCatalogue: (marketplaceRecovery, waiting) =>
        set({
          marketplaceRecovery,
          catalogueNotice: waiting,
          dialog: "marketplace",
        }),

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
      // NOT bumped when a field is added. There is no `migrate` here, so a bump
      // is not a migration — it is an unreported discard of every visitor's
      // arrangement at once. New persisted keys are `.catch()`-ed instead.
      version: 3,
      // All four are ARRANGEMENT — how the screen is laid out and what it is
      // painted in. Everything else is transient: reloading into an open panel,
      // an open dialog, a pending confirmation or a decaying flash is never
      // right.
      partialize: ({
        rosterCollapsed,
        rosterGroupBy,
        stackCollapsed,
        theme,
      }) => ({
        rosterCollapsed,
        rosterGroupBy,
        stackCollapsed,
        theme,
      }),
      merge: (persisted, current) => {
        const parsed = persistedUiSchema.safeParse(persisted)
        return parsed.success ? { ...current, ...parsed.data } : current
      },
    }
  )
)
