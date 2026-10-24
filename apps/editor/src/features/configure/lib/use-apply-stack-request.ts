import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

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

/** `failed`: an account's stack whose read failed, so nothing changed. */
type StackLoad = "loaded" | "failed"

// Through the account's store, as the question's Retry reads, so the grid
// recognises the stack once it applies.
const readAccountStack = async (configId: string) => {
  const account = useAccountStore.getState()
  if (!Object.hasOwn(account.payloads, configId)) await account.readPayloads()

  return useAccountStore.getState().payloads[configId]
}

const useApplyStack = () => {
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
  const adoptRemote = async (configId: string): Promise<StackLoad> => {
    const payload = await readAccountStack(configId)
    if (!payload) return "failed"

    await adopt(payload)
    return "loaded"
  }

  const applyCatalogueStack = (stackId: string | null) => {
    if (stackId === null) releaseSelectedOnly()
    applyStack(stackId)
  }

  const adoptLocalSave = (saveId: string) => {
    const saved = localSaveById(saveId)
    if (saved) void adopt(saved.payload)
  }

  return async (request: StackRequest): Promise<StackLoad> => {
    switch (request.kind) {
      case "stack":
        applyCatalogueStack(request.stackId)
        return "loaded"
      case "saved":
        adoptLocalSave(request.saveId)
        return "loaded"
      case "remote":
        return adoptRemote(request.configId)
      default: {
        const _exhaustive: never = request
        return _exhaustive
      }
    }
  }
}

// The question's door: it says a failed load itself.
export const useApplyStackRequest = () => {
  const apply = useApplyStack()
  return (request: StackRequest): void => void apply(request)
}

/** An account's stack applied at once whose load failed; `reading` while it is tried again. */
type UnloadedStack = { request: StackRequest; reading: boolean }

const readingAgain = (last: UnloadedStack | null) =>
  last && { ...last, reading: true }

/**
 * The grid's door. Over unsaved work the question asks first and says its own
 * load's outcome; with nothing at stake the stack applies at once, so a load
 * that fails is held here until a stack applies.
 */
export const useChooseStack = (unsaved: boolean) => {
  const apply = useApplyStack()
  const requestStack = useUiStore((state) => state.requestStack)
  const [unloaded, setUnloaded] = useState<UnloadedStack | null>(null)

  const applyAtOnce = async (request: StackRequest) => {
    setUnloaded(readingAgain)
    const load = await apply(request)
    setUnloaded(load === "failed" ? { request, reading: false } : null)
  }

  // The question speaks for this choice, so the last one's message goes.
  const ask = (request: StackRequest) => {
    setUnloaded(null)
    requestStack(request)
  }

  const choose = (request: StackRequest) => {
    if (unsaved) ask(request)
    else void applyAtOnce(request)
  }

  return { unloaded, choose }
}
