import { useEffect, useRef, useState } from "react"

import {
  canonicalMarketplaceRef,
  fetchCatalog,
  type CatalogFailure,
} from "@/lib/api/catalog"
import { fetchSharedConfig } from "@/lib/api/configs"
import { activeMarketplace, useCatalogStore } from "@/stores/catalog-store"
import {
  detachSavedConfig,
  readSavedConfig,
  useConfigStore,
} from "@/stores/config-store"
import { tokenFor, useMarketplaceStore } from "@/stores/marketplace-store"
import { useUiStore } from "@/stores/ui-store"
import { adoptSeedPayload, unknownPayloadIds } from "./seed"

import type { SeedPayload } from "@workspace/matrix"

// The app's opening, in the one order it can be done in.
//
// Nothing may resolve an id before the catalogue those ids were minted against
// is seated. The app resolves ids in exactly two places — the configuration
// this browser saved, and the one a `?fromId=` link addresses — and both used
// to run against whatever catalogue happened to be loaded, which for the first
// paint is always the vendored public one. So a selection made on a marketplace
// pruned as unknown on the way back in, by reload and by link alike. One bug,
// two doors; it is sequenced here once rather than shimmed at each door,
// because two orderings that have to agree eventually will not.
//
// The two doors are two ADDRESSES (EDITOR-37, owner 2026-08-17). `/` is this
// browser's own editor and the marketplace it stored governs it;
// `/?fromId=<id>` is a shared configuration and governs itself. The id used to
// be stripped the moment it was applied, so a reload had no idea it had ever
// been a shared link and restored this browser's own marketplace and
// configuration over the top. Separating the addresses dissolves that rather
// than trading off inside it: nothing needs clearing, no stored PAT is
// destroyed, and no import-time warning is needed.
//
// Which address is open is the only branch below, and each opening says for
// itself where its writes go.

// A catalogue that would not load, and the marketplace it belongs to. One
// value because the two only ever travel together, from the seating that
// produced them to the dialog that has to show both.
type Unseated = { marketplace: string; failure: CatalogFailure }

/**
 * The two ways a parked recovery can end, answered by whichever opening parked
 * it — because they are not the same question asked twice.
 *
 * The dialog offers exactly these two outcomes: name a marketplace that loads,
 * or clear the field, which is how the public catalogue is asked for by name.
 * Whether the second one FINISHES what is parked depends on where the waiting
 * ids get their marketplace from, and only the opening knows that.
 */
type RecoveryEndings = {
  /** Seated at last: finish what was parked on it. */
  onSeated: () => void
  /** The marketplace given up on instead, and the public catalogue taken. */
  onPublic: () => void
}

/**
 * A catalogue this browser could not reach, and whatever was waiting on it.
 *
 * The marketplace is SHOWN rather than asked for — the browser already knows
 * which one, whether from the link or from its own slot — and the failure
 * travels with it so the dialog opens with the answer already in it: a token
 * field and a retry for the refusals a credential can change, the precise
 * validation error and no retry for a catalogue that will not parse however it
 * is authorized.
 */
export type MarketplaceRecovery = Unseated & RecoveryEndings

// A parked IMPORT is not re-pointed by clearing the field. Its ids belong to
// the marketplace its PAYLOAD names, and this browser's slot says nothing about
// that — so continuing it against the public catalogue would prune every one of
// them, which is exactly the silent partial import the recovery exists to
// prevent. It stays parked, and its notice stays on screen saying so.
const STAYS_PARKED = () => undefined

export type CatalogFirstState = {
  /** What the opening had to say for itself, in one line above the grid. */
  notice: string | null
  recovery: MarketplaceRecovery | null
}

// Everything an opening can have to say, each named for the state it describes
// rather than built inline where it happens.

// Which catalogue is answering, in the words the notice needs it in.
const catalogueName = () => activeMarketplace() ?? "the public catalogue"

/** The link itself did not fetch — a dead id, or a worker that is not there. */
const refusedNotice = (error: string) =>
  `${error} — showing your own configuration instead.`

// Said for as long as a shared address is open, because everything surprising
// about one follows from it: what is on screen is not this browser's, nothing
// changed here is written down, and the way back is a nav item rather than
// something to guess at. The id is a content hash, so an edited state is not
// that id any more — the address names where this view came FROM, and
// re-sharing is what mints an address for what it has become.
const SHARED_NOTICE =
  "A shared configuration, not your own. Yours is untouched under Configure, and nothing changed here is saved."

/** The link fetched and its catalogue did not, so none of it was applied. */
const parkedNotice = (marketplace: string) =>
  `This link's skills come from ${marketplace}, which could not be loaded — nothing from it was applied. Load it from Marketplace to finish.`

// The same refusal on the other door, and the reason EDITOR-30's "a failed
// restore is silent" was overturned: since hydration waits on the catalogue, a
// failed restore renders the whole configuration as empty, which reads as lost
// work. It is not — nothing has been read, so nothing has been pruned — and
// saying so is the difference between an explanation and a bare grid.
const restoreParkedNotice = (marketplace: string) =>
  `Your configuration is saved against ${marketplace}, which could not be loaded — nothing has been read from it yet. Load it from Marketplace to restore it.`

// The ids themselves rather than a count: a name a reader can go and look up is
// the difference between a warning and a fact. Phrased with no plural to get
// wrong, since one dropped id is as common as six.
const droppedNotice = (unknownIds: string[]) =>
  unknownIds.length === 0
    ? null
    : `Not in ${catalogueName()}, so not applied: ${unknownIds.join(", ")}.`

// One line, however many things it has to say.
const sentences = (parts: (string | null)[]) =>
  parts.filter((part) => part !== null).join(" ")

// Whatever the opening already said, and then what the restore cost.
//
// Added rather than substituted: a link that would not fetch explains why this
// browser's own configuration is on screen, and that configuration then
// explains what its catalogue could not place. Two facts about one opening, and
// the second arriving must not delete the first — which is the same silence
// this row is about, wearing the other coat.
const withDropped = (said: string | null, dropped: string[]) => {
  const also = droppedNotice(dropped)
  if (also === null) return said

  return sentences([said, also])
}

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
 * read against the public catalogue does, and leaving one address to open the
 * other is precisely when the wrong one is still seated.
 */
const seatCatalog = async (
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

// The catalogue this browser last chose, seated before anything reads what was
// saved against it. One of however many it has saved — the choice is the field
// that says which, and the switcher is the other way to move it.
const restoreSavedCatalog = () =>
  seatCatalog(useMarketplaceStore.getState().current)

export const useCatalogFirst = (fromId: string): CatalogFirstState => {
  const [notice, setNotice] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<MarketplaceRecovery | null>(null)
  // The address this hook has opened, rather than a count of openings — and
  // deliberately no cancellation beside it. Those two do not compose:
  // StrictMode mounts, unmounts and remounts, so a `stale` flag set by the
  // first cleanup would discard the one opening the ref permitted and nothing
  // would ever load. Keyed on the address because one opening per mount is not
  // enough of a guard once there are two: moving between them is a real
  // navigation on a screen the router keeps mounted, and the new address has to
  // be opened. The answers are applied whenever they arrive, and a store `set`
  // after unmount is a no-op rather than a leak.
  const opened = useRef<string | null>(null)

  useEffect(() => {
    if (opened.current === fromId) return
    opened.current = fromId

    // Whatever the last address had to say describes the last address. Moving
    // between the two is a real navigation on a screen the router keeps
    // mounted, so nothing clears on the way out unless it is cleared here.
    //
    // The shared notice most of all: it says what is on screen is not this
    // browser's and that their own is safe under Configure. Left standing over
    // their own grid it is the app vouching for a swap — which is precisely
    // what EDITOR-42 was (EDITOR-43). A recovery goes with it for the same
    // reason and one more: its endings close over the payload the LAST address
    // was applying, so a load from the visitor's own address would finish
    // somebody else's import into it.
    setNotice(null)
    setRecovery(null)

    // One dialog, whichever opening is waiting on it. The dialog stays the
    // single owner of whether it is open, so the request arrives the same way
    // the floating button's does. Cancelling therefore closes it without
    // discarding anything: the notice says what is still waiting, and
    // re-opening it from the button offers the same pre-filled form and the
    // same way to finish.
    const park = (
      unseated: Unseated,
      waiting: string,
      endings: RecoveryEndings
    ) => {
      setRecovery({ ...unseated, ...endings })
      useUiStore.getState().setDialog("marketplace")
      setNotice(waiting)
    }

    const finishRestore = async () => {
      const dropped = await readSavedConfig()
      setRecovery(null)
      // Replaced rather than added to: the notice standing here describes a
      // restore that had not happened, and this one has. What takes its place
      // is what the restore cost — and `droppedNotice` answers `null` for a
      // restore that cost nothing, which is the clear this always did.
      setNotice(droppedNotice(dropped))
    }

    const openOwn = async () => {
      const unseated = await restoreSavedCatalog()
      if (unseated) {
        // Prompted for exactly as a first load is (EDITOR-36). The saved picks
        // are not deleted by the refusal and are not read against the wrong
        // catalogue either: reading them is what waits on the token.
        //
        // Both endings are the same answer, and that IS EDITOR-38's sibling. A
        // saved configuration takes its marketplace from the SLOT rather than
        // from a payload, and clearing the field is how the slot comes to name
        // none — so by then the public catalogue really is the catalogue this
        // configuration is saved against, and reading it against one is what the
        // recovery was waiting to do. Leaving it parked instead left a notice
        // standing over an empty grid, naming a marketplace that was no longer
        // stored for anything.
        const restore = () => void finishRestore()
        park(unseated, restoreParkedNotice(unseated.marketplace), {
          onSeated: restore,
          onPublic: restore,
        })
        return
      }

      // The ordinary path, and it prunes too: a saved id the SEATED catalogue
      // cannot place is dropped here exactly as one the public catalogue cannot
      // place is dropped through the recovery above. Nothing parked, nobody
      // asked, and a silent prune is a silent prune wherever it happens.
      const dropped = await readSavedConfig()
      setNotice((said) => withDropped(said, dropped))
    }

    const applyShared = (payload: SeedPayload) => {
      const config = adoptSeedPayload(payload)
      useConfigStore.getState().importConfig(config)
      setRecovery(null)
      setNotice(
        sentences([
          SHARED_NOTICE,
          droppedNotice(unknownPayloadIds(payload, config)),
        ])
      )
    }

    const openShared = async (id: string) => {
      const result = await fetchSharedConfig(id)
      if (!result.ok) {
        // An id that names nothing has no state to govern, so this address is
        // the visitor's own editor and it opens as one.
        setNotice(refusedNotice(result.error))
        await openOwn()
        return
      }

      // From here the address governs, so this browser's slot is held open
      // rather than written to — including for whatever the visitor changes
      // while they are looking at it.
      detachSavedConfig()

      const { payload } = result
      const unseated = await seatCatalog(payload.marketplace)
      if (unseated) {
        park(
          unseated,
          sentences([SHARED_NOTICE, parkedNotice(unseated.marketplace)]),
          { onSeated: () => applyShared(payload), onPublic: STAYS_PARKED }
        )
        return
      }

      applyShared(payload)
    }

    // The whole of the sequencing, once each opening is named: which address
    // is open.
    if (fromId) void openShared(fromId)
    else void openOwn()
  }, [fromId])

  return { notice, recovery }
}
