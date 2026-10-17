import {
  canonicalMarketplaceRef,
  fetchCatalog,
  type CatalogFailure,
} from "@/lib/api/catalog"
import { activeMarketplace, useCatalogStore } from "@/stores/catalog-store"
import { tokenFor } from "@/stores/marketplace-store"

// Shared by opening an address and applying a saved stack, which carry the
// same payload and must seat in the same order.

export type Unseated = { marketplace: string; failure: CatalogFailure }

// Each caller answers; only it knows whether the public catalogue finishes
// what is parked.
export type RecoveryEndings = {
  onSeated: () => void
  onPublic: () => void
}

export type MarketplaceRecovery = Unseated & RecoveryEndings

// For ids a payload names: the public catalogue would prune them all, so
// clearing the field leaves them parked.
export const STAYS_PARKED = () => undefined

// Both seats are idempotent: re-seating refetches and drops this session's
// external skills.

// Writes nothing to the stored slot: a link may change the tab, not the choice.
// The token is keyed by marketplace, so a link cannot make this browser send
// its PAT to a repository it was not issued for.
const seatMarketplace = async (
  marketplace: string
): Promise<CatalogFailure | null> => {
  if (marketplace === activeMarketplace()) return null

  const result = await fetchCatalog(
    marketplace,
    tokenFor(marketplace) || undefined
  )
  if (!result.ok) return result

  useCatalogStore.getState().load(result.matrix, marketplace)
  return null
}

// Not paired with a `choosePublic()`: a link may drop what is seated, never a
// stored token.
const seatPublicCatalog = () => {
  if (activeMarketplace() === null) return

  useCatalogStore.getState().reset()
}

// None names the public catalogue, which cannot fail but must still be seated.
export const seatCatalog = async (
  marketplace: string | undefined
): Promise<Unseated | null> => {
  if (!marketplace) {
    seatPublicCatalog()
    return null
  }

  // Older payloads name the marketplace as typed; canonical, the token lookup
  // finds the entry this browser holds.
  const named = canonicalMarketplaceRef(marketplace)
  const failure = await seatMarketplace(named)
  return failure ? { marketplace: named, failure } : null
}

const catalogueName = () => activeMarketplace() ?? "the public catalogue"

export const parkedNotice = (what: string, marketplace: string) =>
  `${what}'s skills come from ${marketplace}, which could not be loaded — nothing from it was applied. Load it from Marketplace to finish.`

export const droppedNotice = (unknownIds: string[]) =>
  unknownIds.length === 0
    ? null
    : `Not in ${catalogueName()}, so not applied: ${unknownIds.join(", ")}.`
