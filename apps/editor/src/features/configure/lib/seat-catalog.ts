import {
  canonicalMarketplaceRef,
  fetchCatalog,
  type CatalogFailure,
} from "@/lib/api/catalog"
import { activeMarketplace, useCatalogStore } from "@/stores/catalog-store"
import { tokenFor } from "@/stores/marketplace-store"

// Seating the catalogue a set of ids was minted against, and the sentences that
// say what the seating cost.
//
// Its own module because there are two doors rather than one, and both carry
// the same payload. Opening an address does this (`use-catalog-first.ts`) and
// applying a saved stack does it (`use-apply-stack-request.ts`) — the same
// `GET /configs/:id` against the same route, answering with a payload that
// names its marketplace for exactly this reason. While the seating lived
// inside the opening it was reachable from one door only, so a stack saved
// under a marketplace was read against whatever catalogue happened to be
// seated and arrived empty on every other machine, in silence (EDITOR-59).
// Two orderings that have to agree eventually will not.

/**
 * A catalogue that would not load, and the marketplace it belongs to.
 *
 * One value because the two only ever travel together, from the seating that
 * produced them to the dialog that has to show both.
 */
export type Unseated = { marketplace: string; failure: CatalogFailure }

/**
 * The two ways a parked recovery can end, answered by whichever caller parked
 * it — because they are not the same question asked twice.
 *
 * The dialog offers exactly these two outcomes: name a marketplace that loads,
 * or clear the field, which is how the public catalogue is asked for by name.
 * Whether the second one FINISHES what is parked depends on where the waiting
 * ids get their marketplace from, and only the caller knows that.
 */
export type RecoveryEndings = {
  /** Seated at last: finish what was parked on it. */
  onSeated: () => void
  /** The marketplace given up on instead, and the public catalogue taken. */
  onPublic: () => void
}

/**
 * A catalogue this browser could not reach, and whatever was waiting on it.
 *
 * The marketplace is SHOWN rather than asked for — the browser already knows
 * which one, whether from the link, from a payload or from its own slot — and
 * the failure travels with it so the dialog opens with the answer already in
 * it: a token field and a retry for the refusals a credential can change, the
 * precise validation error and no retry for a catalogue that will not parse
 * however it is authorized.
 */
export type MarketplaceRecovery = Unseated & RecoveryEndings

/**
 * The ending for anything parked on a marketplace its own PAYLOAD names.
 *
 * Clearing the field does not re-point it. Those ids belong to the marketplace
 * the payload names, and this browser's slot says nothing about that — so
 * continuing against the public catalogue would prune every one of them, which
 * is exactly the silent partial import the recovery exists to prevent. It stays
 * parked, and its notice stays on screen saying so.
 */
export const STAYS_PARKED = () => undefined

// The two seats, and both are idempotent: seating what is already seated does
// nothing at all. That is load-bearing twice over — a 400 KB catalogue must not
// be fetched again to arrive where it already is, and re-seating drops the
// external skills added this session, which a payload that did not name them
// has no business taking away.

// Fetch and seat, and nothing written down.
//
// Which catalogue is loaded is a fact about this tab; which one this browser
// CHOSE is a fact about its slot, and only the dialog and the switcher put
// anything in that one. An address a visitor was sent may change what is on
// screen and may not change what they had. It is the rule `seatPublicCatalog`
// already states, said for the named case too.
//
// The token comes from the marketplace being seated rather than from whatever
// this browser last chose, which is the one call site EDITOR-39's keyed slot
// makes SIMPLER. It also closes a leak the single slot could not: a shared
// address picks the marketplace, so `whatever token I hold` meant anyone who
// could send a URL could have this browser present its PAT to a repository it
// was never issued for. Keyed, a marketplace this browser holds nothing for is
// read with no `Authorization` header at all.
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

// The vendored one. Deliberately not paired with a `choosePublic()`: a
// marketplace can be named again from the dialog in a second, and a token
// cannot be recovered at all, so an arriving link may drop what is seated and
// may not drop what is stored.
const seatPublicCatalog = () => {
  if (activeMarketplace() === null) return

  useCatalogStore.getState().reset()
}

/**
 * The catalogue a set of ids was minted against, seated before anything
 * resolves them.
 *
 * Naming none means the vendored public one — every payload minted before a
 * marketplace could be loaded at all, and every browser that has never named
 * one — and seating that cannot fail, which is why only the named case comes
 * back with a reason. Seating it is not optional either way: a public payload
 * read against a loaded marketplace prunes exactly as a marketplace payload
 * read against the public catalogue does, and leaving one door to open the
 * other is precisely when the wrong one is still seated.
 */
export const seatCatalog = async (
  marketplace: string | undefined
): Promise<Unseated | null> => {
  if (!marketplace) {
    seatPublicCatalog()
    return null
  }

  // The other door a ref arrives through, and the one that carries the refs
  // already out in the world: an id minted before this was normalised names its
  // marketplace the way the field took it. Canonicalised on the way in, so the
  // token lookup finds the entry this browser really holds and a payload minted
  // from a shared address goes on naming a repository.
  const named = canonicalMarketplaceRef(marketplace)
  const failure = await seatMarketplace(named)
  return failure ? { marketplace: named, failure } : null
}

// Which catalogue is answering, in the words a notice needs it in.
const catalogueName = () => activeMarketplace() ?? "the public catalogue"

/**
 * A payload whose catalogue would not load, so none of it was applied.
 *
 * `what` names the thing that is waiting, because the two doors are two things
 * a reader can go and look at — a link they followed, a stack they clicked —
 * and neither is served by being called the other.
 */
export const parkedNotice = (what: string, marketplace: string) =>
  `${what}'s skills come from ${marketplace}, which could not be loaded — nothing from it was applied. Load it from Marketplace to finish.`

/**
 * The ids the seated catalogue could not place.
 *
 * The ids themselves rather than a count: a name a reader can go and look up is
 * the difference between a warning and a fact. Phrased with no plural to get
 * wrong, since one dropped id is as common as six.
 */
export const droppedNotice = (unknownIds: string[]) =>
  unknownIds.length === 0
    ? null
    : `Not in ${catalogueName()}, so not applied: ${unknownIds.join(", ")}.`
