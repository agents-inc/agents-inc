import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@workspace/ui/components/alert-dialog"
import { useEffect, useState } from "react"

import { losesNothing } from "@/features/configure/lib/marketplace-switch"
import { useMarketplaceLoad } from "@/features/configure/lib/use-marketplace-load"
import { fetchCatalog, type CatalogResult } from "@/lib/api/catalog"
import { useCatalogStore } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import { tokenFor, useMarketplaceStore } from "@/stores/marketplace-store"
import { useUiStore } from "@/stores/ui-store"

import type { MarketplaceRecovery } from "@/features/configure/lib/use-catalog-first"
import type { Matrix } from "@workspace/matrix/matrix-schema"

// The target is fetched first so the dialog can say what the switch costs;
// nothing is seated, stored or cleared until the CTA.

type TargetState =
  | { status: "reading" }
  | { status: "read"; matrix: Matrix }
  | { status: "refused"; error: string }

const READING: TargetState = { status: "reading" }

const toTargetState = (result: CatalogResult): TargetState =>
  result.ok
    ? { status: "read", matrix: result.matrix }
    : { status: "refused", error: result.error }

// No reset to "reading": the caller keys on the marketplace. The cleanup drops
// a late answer about a marketplace no longer asked about.
const useTargetCatalog = (marketplace: string) => {
  const [state, setState] = useState<TargetState>(READING)

  useEffect(() => {
    let asked = true

    void fetchCatalog(marketplace, tokenFor(marketplace) || undefined).then(
      (result) => {
        if (!asked) return
        setState(toTargetState(result))
      }
    )

    return () => {
      asked = false
    }
  }, [marketplace])

  return state
}

// A switch to the marketplace a parked recovery waits on finishes it.
export function MarketplaceSwitchDialog({
  recovery,
}: {
  recovery: MarketplaceRecovery | null
}) {
  const pending = useUiStore((state) => state.pendingMarketplace)
  const dismiss = useUiStore((state) => state.dismissMarketplaceRequest)

  const open = pending !== null

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader title="Switch marketplace" />
        {/* Keyed, so a second marketplace is read fresh. */}
        {pending !== null && (
          <SwitchConfirmation
            key={pending}
            marketplace={pending}
            recovery={recovery}
            onDone={dismiss}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  )
}

function SwitchConfirmation({
  marketplace,
  recovery,
  onDone,
}: {
  marketplace: string
  recovery: MarketplaceRecovery | null
  onDone: () => void
}) {
  const target = useTargetCatalog(marketplace)
  const choose = useMarketplaceStore((state) => state.choose)
  const load = useCatalogStore((state) => state.load)
  const { costOf, land } = useMarketplaceLoad(recovery)
  // Field by field: a fresh object per call would loop updates.
  const stackId = useConfigStore((state) => state.stackId)
  const skills = useConfigStore((state) => state.skills)
  const agents = useConfigStore((state) => state.agents)

  const costOfSwitching = (matrix: Matrix) =>
    costOf({ marketplace, matrix }, marketplace, { stackId, skills, agents }) ??
    losesNothing(marketplace)

  const seat = (matrix: Matrix) => {
    choose(marketplace)
    load(matrix, marketplace)
  }

  // Takes what the description said, not just hides it.
  const confirm = () => {
    if (target.status !== "read") return

    const { matrix } = target
    land(marketplace, () => seat(matrix))
    onDone()
  }

  return (
    <>
      <AlertDialogDescription>
        {descriptionFor(target, marketplace, costOfSwitching)}
      </AlertDialogDescription>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        {target.status === "read" && (
          <AlertDialogAction onClick={confirm}>
            Switch marketplace
          </AlertDialogAction>
        )}
      </AlertDialogFooter>
    </>
  )
}

const descriptionFor = (
  target: TargetState,
  marketplace: string,
  costOfSwitching: (matrix: Matrix) => string
): string => {
  switch (target.status) {
    case "reading":
      return `Reading ${marketplace}…`
    case "read":
      return costOfSwitching(target.matrix)
    case "refused":
      return `${target.error} Nothing has changed — load it from Marketplace to try a token.`
    default: {
      const _exhaustive: never = target
      return _exhaustive
    }
  }
}
