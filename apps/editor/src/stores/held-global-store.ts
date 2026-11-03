import { create } from "zustand"

import type {
  HeldGlobal,
  MintedFrom,
} from "@/features/configure/lib/held-global"

// Not persisted: the address holds the link, and opening it again holds them
// again.
type HeldGlobalState = {
  held: HeldGlobal | null
  mintedFrom: MintedFrom | null
  hold: (held: HeldGlobal | null) => void
  setMintedFrom: (mintedFrom: MintedFrom | null) => void
  release: () => void
}

export const useHeldGlobalStore = create<HeldGlobalState>()((set) => ({
  held: null,
  mintedFrom: null,
  hold: (held) => set({ held }),
  setMintedFrom: (mintedFrom) => set({ mintedFrom }),
  release: () => set({ held: null, mintedFrom: null }),
}))

export const activeHeldGlobal = () => useHeldGlobalStore.getState().held
