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

import { switchConsequence } from "@/features/configure/lib/marketplace-switch"
import { fetchCatalog } from "@/lib/api/catalog"
import { useCatalogStore } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import { tokenFor, useMarketplaceStore } from "@/stores/marketplace-store"
import { useUiStore } from "@/stores/ui-store"

import type { MarketplaceRecovery } from "@/features/configure/lib/use-catalog-first"
import type { Matrix } from "@workspace/matrix/matrix-schema"

// The target is fetched first so the dialog can name which skills go; nothing
// is seated, stored or pruned until the CTA.

type TargetState =
  | { status: "reading" }
  | { status: "read"; matrix: Matrix }
  | { status: "refused"; error: string }

const READING: TargetState = { status: "reading" }

// No reset to "reading": the caller keys on the marketplace. The cleanup drops
// a late answer about a marketplace no longer asked about.
const useTargetCatalog = (marketplace: string) => {
  const [state, setState] = useState<TargetState>(READING)

  useEffect(() => {
    let asked = true

    void fetchCatalog(marketplace, tokenFor(marketplace) || undefined).then(
      (result) => {
        if (!asked) return

        setState(
          result.ok
            ? { status: "read", matrix: result.matrix }
            : { status: "refused", error: result.error }
        )
      }
    )

    return () => {
      asked = false
    }
  }, [marketplace])

  return state
}

// Any load that seats a catalogue finishes a parked recovery.
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
  const pruneToCatalog = useConfigStore((state) => state.pruneToCatalog)
  // The map, not `Object.keys`: a fresh array per call would loop updates.
  const skills = useConfigStore((state) => state.skills)

  const confirm = () => {
    if (target.status !== "read") return

    choose(marketplace)
    load(target.matrix, marketplace)
    // Actually drop what the description named, not just hide it.
    pruneToCatalog()
    recovery?.onSeated()
    onDone()
  }

  return (
    <>
      <AlertDialogDescription>
        {descriptionFor(target, marketplace, Object.keys(skills))}
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
  selectedIds: string[]
) => {
  if (target.status === "reading") return `Reading ${marketplace}…`
  if (target.status === "refused") {
    return `${target.error} Nothing has changed — load it from Marketplace to try a token.`
  }

  return switchConsequence(marketplace, target.matrix, selectedIds)
}
