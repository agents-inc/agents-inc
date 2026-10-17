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

// Nothing may resolve an id before the catalogue it was minted against is
// seated. `/` opens this browser's own config under its stored marketplace;
// `/?fromId=<id>` opens a shared config that governs itself.

export type { MarketplaceRecovery } from "./seat-catalog"

const refusedNotice = (error: string) =>
  `${error} — showing your own configuration instead.`

// Said for as long as a shared address is open.
const SHARED_NOTICE =
  "A shared configuration, not your own. Yours is untouched under Editor, and nothing changed here is saved."

const A_LINK = "This link"

// Not silent: a failed restore renders an empty grid, which reads as lost work.
const restoreParkedNotice = (marketplace: string) =>
  `Your configuration is saved against ${marketplace}, which could not be loaded — nothing has been read from it yet. Load it from Marketplace to restore it.`

const sentences = (parts: (string | null)[]) =>
  parts.filter((part) => part !== null).join(" ")

// Appended, not substituted: the earlier sentence still explains the opening.
const withDropped = (said: string | null, dropped: string[]) => {
  const also = droppedNotice(dropped)
  if (also === null) return said

  return sentences([said, also])
}

const restoreSavedCatalog = () =>
  seatCatalog(useMarketplaceStore.getState().current)

export const useCatalogFirst = (fromId: string): void => {
  // Keyed on the address, with no cancellation: under StrictMode a `stale` flag
  // would discard the one opening the ref permits, and nothing would load.
  const opened = useRef<string | null>(null)

  useEffect(() => {
    if (opened.current === fromId) return
    opened.current = fromId

    const { sayCatalogue, parkCatalogue } = useUiStore.getState()

    // The screen stays mounted across addresses, so the last one's notice and
    // recovery (whose endings close over its payload) are cleared here.
    sayCatalogue(null)

    const park = (
      unseated: Unseated,
      waiting: string,
      endings: RecoveryEndings
    ) => parkCatalogue({ ...unseated, ...endings }, waiting)

    // Read from the store: two steps of one opening write the sentences.
    const alsoSay = (dropped: string[]) =>
      sayCatalogue(withDropped(useUiStore.getState().catalogueNotice, dropped))

    const finishRestore = async () => {
      const dropped = await readSavedConfig()
      // Replaced: the standing notice described a restore not yet done.
      sayCatalogue(droppedNotice(dropped))
    }

    const openOwn = async () => {
      const unseated = await restoreSavedCatalog()
      if (unseated) {
        // Both endings restore: the slot names the marketplace, so once cleared
        // the public catalogue is the one the config is saved against.
        const restore = () => void finishRestore()
        park(unseated, restoreParkedNotice(unseated.marketplace), {
          onSeated: restore,
          onPublic: restore,
        })
        return
      }

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
        // An id that names nothing opens the visitor's own editor.
        sayCatalogue(refusedNotice(result.error))
        await openOwn()
        return
      }

      // The address governs now, so edits are not written to this browser.
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

    if (fromId) void openShared(fromId)
    else void openOwn()
  }, [fromId])
}
