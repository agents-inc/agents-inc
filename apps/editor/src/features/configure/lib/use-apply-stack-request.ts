import { useNavigate } from "@tanstack/react-router"

import { fetchSharedConfig } from "@/lib/api/configs"
import { useConfigStore } from "@/stores/config-store"
import { useSavedStackStore } from "@/stores/saved-stack-store"
import { useUiStore } from "@/stores/ui-store"
import {
  STAYS_PARKED,
  droppedNotice,
  parkedNotice,
  seatCatalog,
} from "./seat-catalog"
import { adoptSeedPayload, unknownPayloadIds } from "./seed"

import type { StackRequest } from "@/stores/ui-store"
import type { SeedPayload } from "@workspace/matrix"

// Generic: the grid knows which cell was clicked and this does not.
const A_STACK = "This stack"

const localSaveById = (saveId: string) =>
  useSavedStackStore.getState().saves.find((save) => save.id === saveId)

// What applying a `StackRequest` means, for both the grid and the confirm.
export const useApplyStackRequest = () => {
  const applyStack = useConfigStore((state) => state.applyStack)
  const applySavedStack = useConfigStore((state) => state.applySavedStack)
  const navigate = useNavigate({ from: "/" })

  // Clearing releases the `selected` filter: its toggle is drawn only while
  // something is selected, so it would strand an empty column.
  const releaseSelectedOnly = () =>
    void navigate({
      search: (prev) => ({ ...prev, sel: false }),
      resetScroll: false,
      replace: true,
    })

  // A saved payload names its marketplace as a share link's does, so it gets
  // the same welcome (EDITOR-59): seat that catalogue first, park when it will
  // not load, and name what it could not place.
  const adopt = async (payload: SeedPayload) => {
    const { sayCatalogue, parkCatalogue } = useUiStore.getState()

    const apply = () => {
      const config = adoptSeedPayload(payload)
      applySavedStack(config)
      sayCatalogue(droppedNotice(unknownPayloadIds(payload, config)))
    }

    const unseated = await seatCatalog(payload.marketplace)
    if (!unseated) return apply()

    // These ids belong to the payload's marketplace, so seating the public
    // catalogue instead would prune them all.
    parkCatalogue(
      { ...unseated, onSeated: apply, onPublic: STAYS_PARKED },
      parkedNotice(A_STACK, unseated.marketplace)
    )
  }

  return (request: StackRequest) => {
    if (request.kind === "stack") {
      if (request.stackId === null) releaseSelectedOnly()
      return applyStack(request.stackId)
    }

    // A failed fetch leaves the selection alone.
    if (request.kind === "remote")
      return void fetchSharedConfig(request.configId).then((result) => {
        if (result.ok) void adopt(result.payload)
      })

    const saved = localSaveById(request.saveId)
    if (saved) void adopt(saved.payload)
  }
}
