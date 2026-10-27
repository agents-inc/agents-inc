import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useEffect, useRef } from "react"

import { fetchSharedConfig } from "@/lib/api/configs"
import {
  detachSavedConfig,
  readSavedConfig,
  useConfigStore,
} from "@/stores/config-store"
import { useHeldGlobalStore } from "@/stores/held-global-store"
import { useMarketplaceStore } from "@/stores/marketplace-store"
import { useUiStore } from "@/stores/ui-store"
import {
  droppedNotice,
  parkedNotice,
  seatCatalog,
  type RecoveryEndings,
  type Unseated,
} from "./seat-catalog"
import { heldGlobalOf } from "./held-global"
import { adoptSeedPayload, recogniseStack, unknownPayloadIds } from "./seed"

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

const route = getRouteApi("/")

// A load leaving a link opens this browser's own configuration first and names
// what it could not place, so the bare address's opening is already done. Taken
// by the next opening whatever its address: a leave from a closure whose
// address had already moved on navigates nowhere, and must not skip a link.
let leftByALoad = false

const takeLeftByALoad = () => {
  const left = leftByALoad
  leftByALoad = false
  return left
}

/**
 * Takes a link off the address once this browser's own configuration is open,
 * so a reload does not reopen the link, keeping what that opening said.
 */
export const useLeaveTheLink = () => {
  const fromId = route.useSearch({ select: (search) => search.fromId })
  const navigate = useNavigate({ from: "/" })

  return () => {
    if (!fromId) return

    leftByALoad = true
    void navigate({ search: (prev) => ({ ...prev, fromId: "" }) })
  }
}

export const useCatalogFirst = (fromId: string): void => {
  // Keyed on the address, with no cancellation: under StrictMode a `stale` flag
  // would discard the one opening the ref permits, and nothing would load.
  const opened = useRef<string | null>(null)

  useEffect(() => {
    if (opened.current === fromId) return
    opened.current = fromId

    const left = takeLeftByALoad()
    if (left && !fromId) return

    // The screen stays mounted across addresses, so the last one's notice,
    // recovery (whose endings close over its payload) and held entries are
    // cleared here.
    say(null)
    useHeldGlobalStore.getState().release()

    if (fromId) void openShared(fromId)
    else void openOwn()
  }, [fromId])
}

const openShared = async (id: string) => {
  const result = await fetchSharedConfig(id)
  if (!result.ok) {
    // An id that names nothing opens the visitor's own editor.
    say(refusedNotice(result.error))
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
      sentences([SHARED_NOTICE, parkedNotice(A_LINK, unseated.marketplace)]),
      { onSeated: () => applyShared(payload) }
    )
    return
  }

  applyShared(payload)
}

// What was dropped is read off the adoption, before a recognised stack
// replaces it with that stack's own records.
const applyShared = (payload: SeedPayload) => {
  const adopted = adoptSeedPayload(payload)
  const opened = recogniseStack(payload, adopted)
  useConfigStore.getState().importConfig(opened)
  useHeldGlobalStore.getState().hold(heldGlobalOf(payload, opened))
  say(
    sentences([
      SHARED_NOTICE,
      droppedNotice(unknownPayloadIds(payload, adopted)),
    ])
  )
}

const openOwn = async () => {
  const unseated = await restoreSavedCatalog()
  if (unseated) {
    // Only its own marketplace restores it: any other opens that one's own,
    // and this one stays saved with its marketplace.
    park(unseated, restoreParkedNotice(unseated.marketplace), {
      onSeated: () => void finishRestore(),
    })
    return
  }

  alsoSay(await readSavedConfig())
}

const finishRestore = async () => {
  const dropped = await readSavedConfig()
  // Replaced: the standing notice described a restore not yet done.
  say(droppedNotice(dropped))
}

const say = (notice: string | null) =>
  useUiStore.getState().sayCatalogue(notice)

const park = (unseated: Unseated, waiting: string, endings: RecoveryEndings) =>
  useUiStore.getState().parkCatalogue({ ...unseated, ...endings }, waiting)

// Read from the store: two steps of one opening write the sentences.
const alsoSay = (dropped: string[]) =>
  say(withDropped(useUiStore.getState().catalogueNotice, dropped))
