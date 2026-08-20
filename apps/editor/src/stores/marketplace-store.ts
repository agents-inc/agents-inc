import { create } from "zustand"
import { persist } from "zustand/middleware"
import { z } from "zod"

import { canonicalMarketplaceRef } from "@/lib/api/catalog"
import { reportIssue } from "@/lib/observability/report"

// The marketplaces this browser has loaded, the token each one needed, and
// which of them it is currently on. All of it survives a reload, because
// retyping a repository — and re-pasting a PAT — on every visit is the whole
// difference between a feature and a demo.
//
// THERE ARE THREE NOTIONS OF "MARKETPLACE" IN THIS APP, and this file owns the
// second and third of them:
//
//   SEATED — the catalogue loaded in this tab. `catalog-store` owns it, and
//   `activeMarketplace()` is how anything asks. A shared address seats one
//   without this file ever hearing about it (EDITOR-37).
//   CHOSEN — `current` below: which catalogue this browser said is its own.
//   `""` is the public catalogue, which is also what a browser that has never
//   opened the dialog holds.
//   SAVED — `saved` below: every marketplace a load has succeeded against,
//   against the token that reached it. Its KEYS are what the switcher lists.
//
// Keyed by marketplace, and that is EDITOR-39. One `{ marketplace, token }`
// slot made "which marketplace is mine" and "which token do I have" the same
// fact, so saving a second marketplace wrote over the first — and a GitHub PAT
// is shown once and cannot be recovered. Keyed, that loss is not guarded
// against, it is unrepresentable.
//
// The two are still not equal partners, but the asymmetry is now structural
// rather than stated:
//
//   the marketplace IDENTIFIES — it is what says which repository, and it is
//   what a seed payload carries so `--from` installs from the right one, so it
//   is the KEY;
//   the token only AUTHORIZES — it says we may read, never what to read, so it
//   is the VALUE, and it cannot exist without the repository it is for.
//
// A token is therefore only ever spent on the repository it is filed under.
// That was a convention when there was one of each and is a lookup now, which
// is what stops a shared link — a marketplace somebody else chose — from
// presenting this browser's credential to a repository it was never issued for.
//
// It lives in localStorage and nowhere else. Never on our worker — that is the
// point of fetching browser-direct — and never in a `VITE_` variable, which
// bakes into the bundle and would ship one org's token to every visitor.

const STORAGE_KEY = "agents-inc:marketplace:v1"

// The SHAPE's version, which the `v1` in the key above is not: that names the
// slot and stays put, exactly as `config-store` sits on `agents-inc:config:v1`
// at its eighth version.
//
// v2 is the KEY's form rather than the shape around it. The key used to be
// whatever spelling of a repository the dialog's field happened to take, and it
// is the canonical ref now — so a slot written before it holds entries under
// names nothing looks up any more. The rewrite itself is
// `readSavedMarketplaces`'s, which every slot passes through; the bump is what
// makes persist write the result straight back, so an old key does not sit in
// storage with its copy of the PAT until the next time something is saved.
const PERSIST_VERSION = 2

// Every string is plain and empty means absent, which is also what an untouched
// dialog holds — so "never set" and "cleared" need no third state.
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

// Two spellings of one repository meeting in one entry, which is what a key
// nobody normalised left behind. The CREDENTIAL is what survives the collapse:
// `""` says none is held, so it can never be what replaces one that is — a PAT
// is shown once and cannot be read back from anywhere. Past that the later
// entry wins, which is all a map has ever meant.
const keepingTheCredential = (held: string | undefined, incoming: string) =>
  incoming === "" ? (held ?? "") : incoming

// Every token filed under the repository it authorizes, named the one way that
// repository is named.
//
// Two rules in one pass over the same entries, because they are one question
// asked of each. A token filed under NO marketplace names nothing — there is no
// repository for the credential to be a credential for — and goes, without its
// neighbours; that is the single slot's own rule said per ENTRY, since dropping
// the others with it would be the very loss this shape exists to make
// impossible.
//
// And a key in ANY spelling of a repository becomes the canonical one. That is
// the same rule reaching one step further: an entry under a name nothing looks
// up any more holds a credential for nothing just as surely as an unkeyed one
// does, and a browser that named one repository both ways is holding two
// entries and two copies of one PAT. Read here rather than migrated, because
// every slot reaches the store through this — the keyed shape and the single
// one the migration hands over alike.
const filedUnderAMarketplace = (saved: Record<string, string>) =>
  Object.entries(saved).reduce<Record<string, string>>(
    (filed, [marketplace, token]) => {
      if (marketplace === "") return filed

      const key = canonicalMarketplaceRef(marketplace)
      return { ...filed, [key]: keepingTheCredential(filed[key], token) }
    },
    {}
  )

// A choice this browser cannot have made: nothing was ever loaded from it, so
// there is nothing filed for it and no reason to believe it resolves. The
// public catalogue is what the app opens on when it has no choice to restore —
// and the tokens are untouched, because which catalogue to show has never been
// a statement about credentials.
const choiceAmong = (current: string, saved: Record<string, string>) =>
  current in saved ? current : ""

/**
 * The untrusted read, kept pure so it can be exercised without a browser — the
 * arrangement `readSavedStack` established.
 *
 * An unreadable slot and an empty one are the same answer ON SCREEN: there is
 * nothing to restore either way, and the app opens on the public catalogue,
 * which is exactly what it does for a visitor who has never opened the dialog.
 *
 * They are not the same answer about the DATA, and that is why they are told
 * apart below. What this slot holds is a PAT, shown once and readable back from
 * nowhere; answering `EMPTY` puts the store in a state the next `set` writes,
 * so the credential is not merely unread but gone. An ABSENT slot arrives as
 * `undefined` and is every first visit — conflating the two would file a
 * warning against every visitor who has never opened the dialog, which is what
 * makes a report worthless and gets it removed again. The same split
 * `config-store`'s `merge` draws, in the same order and for the same reason.
 *
 * THIS is the door every browser at the current version arrives at.
 * `migrateSavedMarketplaces` below is the other one, and zustand opens exactly
 * one of them per load: it calls `migrate` only on a version mismatch and hands
 * the raw state to `merge` otherwise. So reporting only there is silence on
 * precisely the case a shape change shipped without a version bump produces —
 * the deploy on which a silent discard becomes a mass credential loss.
 */
export const readSavedMarketplaces = (
  persisted: unknown
): SavedMarketplaces => {
  if (persisted === undefined) return EMPTY

  const parsed = savedMarketplacesSchema.safeParse(persisted)
  if (!parsed.success) {
    reportIssue("Discarded unreadable saved marketplaces", {
      persistVersion: PERSIST_VERSION,
      // The failing field and why, and nothing past it. A path segment under
      // `saved` is a REPOSITORY THE VISITOR NAMED and the value beside it is
      // their credential, so only the field's own name travels — the same rule
      // the migration keeps by reporting versions alone.
      issues: parsed.error.issues.map(
        (issue) => `${String(issue.path[0] ?? "(root)")}: ${issue.code}`
      ),
    })
    return EMPTY
  }

  const saved = filedUnderAMarketplace(parsed.data.saved)
  // The choice is re-keyed with the entries it names, or a slot written before
  // the ref was normalised would hold a `current` matching none of its own keys
  // — and `choiceAmong` would read that as a marketplace this browser never
  // saved, dropping it to the public catalogue.
  const current = canonicalMarketplaceRef(parsed.data.current)

  return { current: choiceAmong(current, saved), saved }
}

// What the single-slot release wrote: one marketplace, and the one token that
// reached it. `token` is optional because it was added after the field was.
const singleSlotSchema = z.object({
  marketplace: z.string(),
  token: z.string().optional(),
})

/**
 * A browser holding the single slot, carried over rather than dropped.
 *
 * Without this, the deploy that lands the keyed shape reads every existing
 * slot as unparseable and discards it — the marketplace AND the PAT, invisibly,
 * by the same discard path that exists to be safe. That is this row's own
 * defect arriving through the deploy, and a PAT cannot be recovered, so this is
 * the last moment it exists.
 *
 * One entry in, one entry out. A slot naming no marketplace still names
 * nothing and still goes, which is the only judgement left that is whole-slot —
 * because a single slot IS one entry.
 */
export const migrateSavedMarketplaces = (
  persisted: unknown,
  fromVersion: number
): unknown => {
  if (fromVersion === PERSIST_VERSION) return persisted

  // Already keyed, and there is nothing here to reshape: what v2 moved is the
  // FORM of the key, and that rule lives in `readSavedMarketplaces` alone —
  // every slot reaches the store through it, so stating it twice would be two
  // places to disagree. Guarded by SHAPE rather than by version number,
  // because a keyed slot arriving at the single-slot parse below would be read
  // as unreadable and discarded, marketplaces and PATs together.
  if (savedMarketplacesSchema.safeParse(persisted).success) return persisted

  const slot = singleSlotSchema.safeParse(persisted)
  if (!slot.success || !slot.data.marketplace) {
    // Reported for the reason `config-store` reports its own discards:
    // somebody's marketplace becomes empty state and nothing on screen says so.
    // Versions only — a stored marketplace is the user's own.
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
  /**
   * A load that succeeded: file its token under it, and make it the one this
   * browser is on. Both at once, because they are one decision — a token is
   * only ever saved alongside the marketplace it authorizes.
   */
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

      // Deliberately no verb here that forgets a token. Clearing the field is a
      // statement about which catalogue to show, and nothing in the app asks to
      // destroy a credential — so there is no door to reach one through, which
      // is the strongest form the guarantee takes.
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

/**
 * The token to read one marketplace with, and `""` for one this browser holds
 * none for.
 *
 * The keyed lookup that used to be an assumption. A caller always has the
 * marketplace in hand before it asks, so a credential can no longer be picked
 * up by whoever happens to be reading next.
 */
export const tokenFor = (marketplace: string) =>
  useMarketplaceStore.getState().saved[marketplace] ?? ""
