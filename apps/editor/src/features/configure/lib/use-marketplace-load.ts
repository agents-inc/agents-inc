import { activeMarketplace } from "@/stores/catalog-store"
import {
  isSharedConfigurationOpen,
  readSavedConfig,
  savedConfigurationOnScreen,
  useConfigStore,
} from "@/stores/config-store"
import { useMarketplaceStore } from "@/stores/marketplace-store"
import { useUiStore } from "@/stores/ui-store"
import {
  landingOf,
  loadCost,
  stackElsewhere,
  type Leaving,
} from "./marketplace-switch"
import { droppedNotice } from "./seat-catalog"
import { useLeaveTheLink } from "./use-catalog-first"

import type { MarketplaceRecovery } from "./seat-catalog"
import type { PersistedConfig } from "@/stores/persisted-schema"
import type { Matrix } from "@workspace/matrix/matrix-schema"

// What a load does to the configuration, the same from the Marketplace dialog,
// the saved-marketplace switcher and a saved stack built on another
// marketplace.

/** A catalogue read and not yet seated. `""` is the public one. */
export type LoadTarget = { marketplace: string; matrix: Matrix }

type Selection = Pick<PersistedConfig, "stackId" | "skills" | "agents">

const PUBLIC_NAME = "the public catalogue"

// What a load or a stack can land on without reading a saved configuration: a
// shared one's catalogue, or the marketplace whose saved one was read. `null`
// until one was, as while the stored marketplace waits on a load, since writes
// stay off until a read.
const marketplaceOnScreen = () =>
  isSharedConfigurationOpen()
    ? (activeMarketplace() ?? "")
    : savedConfigurationOnScreen()

/** Whether a stack built on `marketplace` opens that marketplace's own saved configuration. */
export const opensItsOwnConfiguration = (marketplace: string) =>
  marketplace !== marketplaceOnScreen()

const nameOf = (marketplace: string) => marketplace || PUBLIC_NAME

// What becomes of the configuration on screen when another marketplace opens.
// This browser's own belongs to the marketplace it chose, read yet or not.
const leavingNow = (): Leaving => {
  if (isSharedConfigurationOpen()) return { kind: "link" }

  const chosen = useMarketplaceStore.getState().current
  const kind = savedConfigurationOnScreen() === chosen ? "own" : "unread"
  return { kind, name: nameOf(chosen) }
}

/** What applying a stack built on `marketplace` costs, said before it happens. */
export const stackElsewhereCost = (marketplace: string) =>
  stackElsewhere(nameOf(marketplace), leavingNow())

/**
 * Opens the seated marketplace's own saved configuration, leaving whatever was
 * on screen where it was saved, and a link's address with it.
 */
export const useOpenOwnConfiguration = () => {
  const leaveTheLink = useLeaveTheLink()

  return async () => {
    const { sayCatalogue } = useUiStore.getState()
    sayCatalogue(null)
    sayCatalogue(droppedNotice(await readSavedConfig()))
    leaveTheLink()
  }
}

export const useMarketplaceLoad = (recovery: MarketplaceRecovery | null) => {
  const pruneToCatalog = useConfigStore((state) => state.pruneToCatalog)
  const openOwn = useOpenOwnConfiguration()

  // Asked before a seat, which moves what is on screen.
  const landingFor = (marketplace: string) =>
    landingOf(marketplace, {
      standing: marketplaceOnScreen(),
      parked: recovery?.marketplace,
    })

  const costOf = (target: LoadTarget, name: string, selection: Selection) =>
    loadCost({
      name,
      catalogue: target.matrix,
      landing: landingFor(target.marketplace),
      selection,
      leaving: leavingNow(),
    })

  /** `seat` puts the catalogue on screen, and the landing says what follows it. */
  const land = (marketplace: string, seat: () => void) => {
    const landing = landingFor(marketplace)
    seat()

    switch (landing) {
      case "reread":
        return pruneToCatalog()
      case "recovery":
        return recovery?.onSeated()
      case "another":
        return void openOwn()
      default: {
        const _exhaustive: never = landing
        return _exhaustive
      }
    }
  }

  return { costOf, land }
}
