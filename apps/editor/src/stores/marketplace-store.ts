import { create } from "zustand"
import { persist } from "zustand/middleware"
import { z } from "zod"

import { canonicalMarketplaceRef } from "@/lib/api/catalog"
import { reportIssue, reportableIssues } from "@/lib/observability/report"

// Saved marketplaces keyed by ref, each with the token that reached it, and the
// chosen one. Keyed so a token is only ever spent on the repository it is filed
// under. Tokens live in localStorage only: never on our worker, never in a
// `VITE_` variable.

const STORAGE_KEY = "agents-inc:marketplace:v1"

// The shape's version, not the slot's (`v1` in the key).
const PERSIST_VERSION = 2

// Empty means absent, so "never set" and "cleared" need no third state.
const savedMarketplacesSchema = z.object({
  current: z.string(),
  saved: z.record(z.string(), z.string()),
})

export type SavedMarketplaces = {
  /** Which catalogue this browser chose. `""` is the public one. */
  current: string
  /** Marketplace → the token that reached it, `""` for one needing none. */
  saved: Record<string, string>
}

const EMPTY: SavedMarketplaces = { current: "", saved: {} }

// Two spellings of one repository merging: `""` never replaces a held token.
const keepingTheCredential = (held: string | undefined, incoming: string) =>
  incoming === "" ? (held ?? "") : incoming

// Drops tokens filed under no marketplace and canonicalises every key.
const filedUnderAMarketplace = (saved: Record<string, string>) =>
  Object.entries(saved).reduce<Record<string, string>>(
    (filed, [marketplace, token]) => {
      if (marketplace === "") return filed

      const key = canonicalMarketplaceRef(marketplace)
      return { ...filed, [key]: keepingTheCredential(filed[key], token) }
    },
    {}
  )

// A choice with nothing saved for it falls back to the public catalogue; tokens
// untouched.
const choiceAmong = (current: string, saved: Record<string, string>) =>
  current in saved ? current : ""

/**
 * Unreadable and absent slots both open on the public catalogue, but only an
 * unreadable one is reported: it held a PAT that the next write destroys.
 * Absent is every first visit.
 */
export const readSavedMarketplaces = (
  persisted: unknown
): SavedMarketplaces => {
  if (persisted === undefined) return EMPTY

  const parsed = savedMarketplacesSchema.safeParse(persisted)
  if (!parsed.success) {
    reportIssue("Discarded unreadable saved marketplaces", {
      persistVersion: PERSIST_VERSION,
      // Field names only: a path under `saved` is a repository the visitor
      // named.
      issues: reportableIssues(parsed.error),
    })
    return EMPTY
  }

  const saved = filedUnderAMarketplace(parsed.data.saved)
  // Re-keyed with the entries, or `current` would match none of them.
  const current = canonicalMarketplaceRef(parsed.data.current)

  return { current: choiceAmong(current, saved), saved }
}

// The single-slot release's shape; `token` was added after the field.
const singleSlotSchema = z.object({
  marketplace: z.string(),
  token: z.string().optional(),
})

/** Carries a single-slot browser over instead of discarding its PAT. */
export const migrateSavedMarketplaces = (
  persisted: unknown,
  fromVersion: number
): unknown => {
  if (fromVersion === PERSIST_VERSION) return persisted

  // Guarded by shape, not version: a keyed slot would fail the single-slot
  // parse.
  if (savedMarketplacesSchema.safeParse(persisted).success) return persisted

  const slot = singleSlotSchema.safeParse(persisted)
  if (!slot.success || !slot.data.marketplace) {
    // Versions only: a stored marketplace is the user's own.
    reportIssue("Discarded an unreadable marketplace slot", {
      fromVersion,
      persistVersion: PERSIST_VERSION,
    })
    return undefined
  }

  const { marketplace, token } = slot.data
  return { current: marketplace, saved: { [marketplace]: token ?? "" } }
}

type MarketplaceState = SavedMarketplaces & {
  /** Files the token under the marketplace and chooses it, as one decision. */
  remember: (marketplace: string, token: string) => void
  /** Which saved catalogue to show. Never a statement about credentials. */
  choose: (marketplace: string) => void
  /** The public catalogue, which is what an empty marketplace field asks for. */
  choosePublic: () => void
}

export const useMarketplaceStore = create<MarketplaceState>()(
  persist(
    (set) => ({
      ...EMPTY,

      remember: (marketplace, token) =>
        set((state) => ({
          current: marketplace,
          saved: { ...state.saved, [marketplace]: token },
        })),

      // No verb forgets a token: nothing in the app asks to destroy a
      // credential.
      choose: (marketplace) => set({ current: marketplace }),
      choosePublic: () => set({ current: "" }),
    }),
    {
      name: STORAGE_KEY,
      version: PERSIST_VERSION,
      migrate: migrateSavedMarketplaces,
      merge: (persisted, current) => ({
        ...current,
        ...readSavedMarketplaces(persisted),
      }),
    }
  )
)

export const tokenFor = (marketplace: string) =>
  useMarketplaceStore.getState().saved[marketplace] ?? ""
