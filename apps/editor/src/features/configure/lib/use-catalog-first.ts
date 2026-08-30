import { useEffect, useRef } from "react"

import { fetchSharedConfig } from "@/lib/api/configs"
import {
  detachSavedConfig,
  readSavedConfig,
  useConfigStore,
} from "@/stores/config-store"
import { useMarketplaceStore } from "@/stores/marketplace-store"
import { useUiStore } from "@/stores/ui-store"
import {
  STAYS_PARKED,
  droppedNotice,
  parkedNotice,
  seatCatalog,
  type RecoveryEndings,
  type Unseated,
} from "./seat-catalog"
import { adoptSeedPayload, unknownPayloadIds } from "./seed"

import type { SeedPayload } from "@workspace/matrix"

// The app's opening, in the one order it can be done in.
//
// Nothing may resolve an id before the catalogue those ids were minted against
// is seated. The app resolves ids in exactly two places while it opens — the
// configuration this browser saved, and the one a `?fromId=` link addresses —
// and both used to run against whatever catalogue happened to be loaded, which
// for the first paint is always the vendored public one. So a selection made on
// a marketplace pruned as unknown on the way back in, by reload and by link
// alike. One bug, two doors; it is sequenced here once rather than shimmed at
// each door, because two orderings that have to agree eventually will not.
//
// The seating itself is `seat-catalog.ts` and no longer lives here, because
// this hook is not the only thing that seats a catalogue: applying a saved
// stack fetches the same payload from the same route and owes the same
// sequence (EDITOR-59). What stays here is what is genuinely about an ADDRESS.
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

// Where the two dialogs that can resolve a parked recovery still reach for its
// shape. Re-exported rather than moved through them, because the seating is no
// longer this module's and the components are no longer this lane's.
export type { MarketplaceRecovery } from "./seat-catalog"

// Everything an opening can have to say, each named for the state it describes
// rather than built inline where it happens.

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

// What a payload arriving at an address is called in the sentence that says its
// catalogue would not load.
const A_LINK = "This link"

// The same refusal on the other door, and the reason EDITOR-30's "a failed
// restore is silent" was overturned: since hydration waits on the catalogue, a
// failed restore renders the whole configuration as empty, which reads as lost
// work. It is not — nothing has been read, so nothing has been pruned — and
// saying so is the difference between an explanation and a bare grid.
const restoreParkedNotice = (marketplace: string) =>
  `Your configuration is saved against ${marketplace}, which could not be loaded — nothing has been read from it yet. Load it from Marketplace to restore it.`

// One line, however many things an opening has to say.
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

// The catalogue this browser last chose, seated before anything reads what was
// saved against it. One of however many it has saved — the choice is the field
// that says which, and the switcher is the other way to move it.
const restoreSavedCatalog = () =>
  seatCatalog(useMarketplaceStore.getState().current)

export const useCatalogFirst = (fromId: string): void => {
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

    const { sayCatalogue, parkCatalogue } = useUiStore.getState()

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
    sayCatalogue(null)

    const park = (
      unseated: Unseated,
      waiting: string,
      endings: RecoveryEndings
    ) => parkCatalogue({ ...unseated, ...endings }, waiting)

    // Read back from the store rather than closed over, because the two
    // sentences are written by two different steps of one opening.
    const alsoSay = (dropped: string[]) =>
      sayCatalogue(withDropped(useUiStore.getState().catalogueNotice, dropped))

    const finishRestore = async () => {
      const dropped = await readSavedConfig()
      // Replaced rather than added to: the notice standing here describes a
      // restore that had not happened, and this one has. What takes its place
      // is what the restore cost — and `droppedNotice` answers `null` for a
      // restore that cost nothing, which is the clear this always did.
      sayCatalogue(droppedNotice(dropped))
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
      alsoSay(await readSavedConfig())
    }

    const applyShared = (payload: SeedPayload) => {
      const config = adoptSeedPayload(payload)
      useConfigStore.getState().importConfig(config)
      sayCatalogue(
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
        sayCatalogue(refusedNotice(result.error))
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
          sentences([
            SHARED_NOTICE,
            parkedNotice(A_LINK, unseated.marketplace),
          ]),
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
}
