import { useNavigate } from "@tanstack/react-router"

import { fetchSharedConfig } from "@/lib/api/configs"
import { useAccountStore } from "@/stores/account-store"
import { useConfigStore } from "@/stores/config-store"
import { tokenFor, useMarketplaceStore } from "@/stores/marketplace-store"
import { useSavedStackStore } from "@/stores/saved-stack-store"
import { useUiStore } from "@/stores/ui-store"
import {
  droppedNotice,
  marketplaceOf,
  parkedNotice,
  seatCatalog,
} from "./seat-catalog"
import { adoptSeedPayload, unknownPayloadIds } from "./seed"
import {
  opensItsOwnConfiguration,
  stackElsewhereCost,
  useOpenOwnConfiguration,
} from "./use-marketplace-load"

import type { AccountReads } from "@/stores/account-store"
import type { StackRequest } from "@/stores/ui-store"
import type { SeedPayload } from "@workspace/matrix"

// Generic: the grid knows which cell was clicked and this does not.
const A_STACK = "This stack"

const localSaveById = (saveId: string) =>
  useSavedStackStore.getState().saves.find((save) => save.id === saveId)

/**
 * What applying a stack does to the configuration on screen, said before it
 * happens. `unread`: an account's stack whose payload, and so its marketplace,
 * has not arrived. `failed`: its read failed, so what it does is unknown.
 * `replaces`: it replaces what is on screen. `elsewhere`: built on another
 * marketplace, it opens that one's own.
 */
export type StackSwitchCost =
  | { kind: "unread" }
  | { kind: "failed" }
  | { kind: "replaces" }
  | { kind: "elsewhere"; consequence: string }

const costOfPayload = (payload: SeedPayload): StackSwitchCost => {
  const marketplace = marketplaceOf(payload.marketplace)

  return opensItsOwnConfiguration(marketplace)
    ? { kind: "elsewhere", consequence: stackElsewhereCost(marketplace) }
    : { kind: "replaces" }
}

// A payload that arrived is the answer, whatever an earlier read said.
const costOfAccountStack = (
  configId: string,
  { payloads, failedReads }: AccountReads
): StackSwitchCost => {
  const payload = payloads[configId]
  if (payload) return costOfPayload(payload)

  return failedReads.includes(configId)
    ? { kind: "failed" }
    : { kind: "unread" }
}

export const stackSwitchCost = (
  request: StackRequest,
  account: AccountReads
): StackSwitchCost => {
  switch (request.kind) {
    case "stack":
      return { kind: "replaces" }
    case "saved": {
      const saved = localSaveById(request.saveId)
      return saved ? costOfPayload(saved.payload) : { kind: "replaces" }
    }
    case "remote":
      return costOfAccountStack(request.configId, account)
    default: {
      const _exhaustive: never = request
      return _exhaustive
    }
  }
}

// As a load chooses it, so a reload opens it again. The token is the one this
// browser already files under it.
const chooseMarketplace = (marketplace: string) => {
  const { remember, choosePublic } = useMarketplaceStore.getState()
  if (marketplace === "") choosePublic()
  else remember(marketplace, tokenFor(marketplace))
}

export const useApplyStackRequest = () => {
  const applyStack = useConfigStore((state) => state.applyStack)
  const applySavedStack = useConfigStore((state) => state.applySavedStack)
  const navigate = useNavigate({ from: "/" })
  const openOwn = useOpenOwnConfiguration()

  // The `selected` toggle hides once nothing is selected, stranding an empty
  // column, so clearing releases it.
  const releaseSelectedOnly = () =>
    void navigate({
      search: (prev) => ({ ...prev, sel: false }),
      resetScroll: false,
      replace: true,
    })

  // Same welcome as a share link: seat its catalogue, park if it won't load.
  // Built on another marketplace, it is that marketplace's load, then the
  // stack.
  const adopt = async (payload: SeedPayload) => {
    const { sayCatalogue, parkCatalogue } = useUiStore.getState()
    const marketplace = marketplaceOf(payload.marketplace)
    // Asked before the seat, which moves what is on screen.
    const another = opensItsOwnConfiguration(marketplace)

    const apply = async () => {
      if (another) {
        chooseMarketplace(marketplace)
        await openOwn()
      }

      const config = adoptSeedPayload(payload)
      applySavedStack(config)
      sayCatalogue(droppedNotice(unknownPayloadIds(payload, config)))
    }

    const unseated = await seatCatalog(payload.marketplace)
    if (!unseated) return apply()

    // These ids belong to the payload's marketplace, so only that one
    // finishes it.
    parkCatalogue(
      { ...unseated, onSeated: () => void apply() },
      parkedNotice(A_STACK, unseated.marketplace)
    )
  }

  // The payload the question described, so Switch applies what it said. The
  // grid applies at once when nothing is at stake, which can be before the read.
  const adoptRemote = async (configId: string) => {
    const read = useAccountStore.getState().payloads[configId]
    if (read) return adopt(read)

    const result = await fetchSharedConfig(configId)
    if (result.ok) await adopt(result.payload)
  }

  const applyCatalogueStack = (stackId: string | null) => {
    if (stackId === null) releaseSelectedOnly()
    applyStack(stackId)
  }

  const adoptLocalSave = (saveId: string) => {
    const saved = localSaveById(saveId)
    if (saved) void adopt(saved.payload)
  }

  return (request: StackRequest): void => {
    switch (request.kind) {
      case "stack":
        return applyCatalogueStack(request.stackId)
      case "saved":
        return adoptLocalSave(request.saveId)
      case "remote":
        return void adoptRemote(request.configId)
      default: {
        const _exhaustive: never = request
        return _exhaustive
      }
    }
  }
}
