import { create } from "zustand"

import type { HeldGlobal } from "@/features/configure/lib/held-global"

// Not persisted: the address holds the link, and opening it again holds them
// again.
type HeldGlobalState = {
  held: HeldGlobal | null
  hold: (held: HeldGlobal | null) => void
  release: () => void
}

export const useHeldGlobalStore = create<HeldGlobalState>()((set) => ({
  held: null,
  hold: (held) => set({ held }),
  release: () => set({ held: null }),
}))

export const activeHeldGlobal = () => useHeldGlobalStore.getState().held
