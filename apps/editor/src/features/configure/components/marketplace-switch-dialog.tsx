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

// Moving between the marketplaces this browser has saved.
//
// Ruled (owner 2026-08-17): switching opens a dialog carrying a description of
// what the switch does, and the switch happens only on the CTA. No
// per-marketplace configuration and no refusal — the visitor is told what they
// are about to lose and chooses. This is not an initial user journey, so it
// does not earn a more elaborate mechanism than being told.
//
// The description names WHICH skills go rather than warning that something may,
// and fetching first is what buys that. A catalogue has to be read before it
// can be seated in any case, so reading it to describe the switch costs the
// visitor nothing they were not about to spend: the CTA seats the matrix
// already in hand, and cancelling is the only way the fetch is wasted.
//
// Reading is not switching. Nothing here is seated, stored or pruned until the
// CTA, which is what makes cancelling free.

// What the target catalogue had to say. The dialog cannot describe a switch it
// could not read, so a refusal is an answer rather than an error state bolted
// on: it names why and offers no CTA, because there is nothing to confirm.
type TargetState =
  | { status: "reading" }
  | { status: "read"; matrix: Matrix }
  | { status: "refused"; error: string }

const READING: TargetState = { status: "reading" }

/**
 * The target catalogue, read once for the marketplace being asked about.
 *
 * There is no reset to "reading" here and there is deliberately no dependency
 * to need one: the component is KEYED on the marketplace, so asking about a
 * second one is a fresh mount whose initial state already says so. React's own
 * way of resetting state, and the reason there is no cascading render to reset
 * it in.
 *
 * The cleanup drops a late answer rather than cancelling the fetch. The bytes
 * are on their way either way, and what must not happen is an answer about a
 * marketplace nobody is asking about any more appearing under one that is.
 */
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

/**
 * The confirmation, and the only thing in the app that performs a switch.
 *
 * It takes the recovery for the same reason the marketplace dialog does: a
 * catalogue parked waiting to be seated is finished by ANY load that seats one,
 * rather than being second-guessed here. The ids the new catalogue cannot place
 * are then named on screen, which is the answer catalogue drift already gets.
 */
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
        {/* Keyed on the target, so asking about a second marketplace reads it
            fresh rather than describing it with the first one's answer. */}
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
  // The map itself, with the keys taken in render. A selector returning
  // `Object.keys(...)` is a new array every time it is called, which is a
  // snapshot that never compares equal and an update loop rather than a
  // subscription.
  const skills = useConfigStore((state) => state.skills)

  const confirm = () => {
    if (target.status !== "read") return

    choose(marketplace)
    load(target.matrix, marketplace)
    // The skills the description just named, actually dropped. Hidden from the
    // grid is not dropped: they would still be in the install list and in any
    // link shared from here, under ids nothing on screen could explain.
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

// Each state said in its own words, rather than one sentence with holes in it.
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
