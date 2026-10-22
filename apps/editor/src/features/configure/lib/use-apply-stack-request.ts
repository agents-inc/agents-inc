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

export const useApplyStackRequest = () => {
  const applyStack = useConfigStore((state) => state.applyStack)
  const applySavedStack = useConfigStore((state) => state.applySavedStack)
  const navigate = useNavigate({ from: "/" })

  // The `selected` toggle hides once nothing is selected, stranding an empty
  // column, so clearing releases it.
  const releaseSelectedOnly = () =>
    void navigate({
      search: (prev) => ({ ...prev, sel: false }),
      resetScroll: false,
      replace: true,
    })

  // Same welcome as a share link: seat its catalogue, park if it won't load.
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

  const adoptRemote = async (configId: string) => {
    const result = await fetchSharedConfig(configId)
    if (result.ok) await adopt(result.payload)
  }

  return (request: StackRequest) => {
    if (request.kind === "stack") {
      if (request.stackId === null) releaseSelectedOnly()
      return applyStack(request.stackId)
    }

    if (request.kind === "remote") return void adoptRemote(request.configId)

    const saved = localSaveById(request.saveId)
    if (saved) void adopt(saved.payload)
  }
}
