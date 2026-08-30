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

// What a stack is called in the sentence that says its catalogue would not
// load. Generic for the reason `stack-switch-dialog.tsx` is generic in its own
// question: the grid knows which cell was clicked and this does not, and a
// second lookup that can disagree with the cell the person just pressed is
// worse than the bare word.
const A_STACK = "This stack"

// What applying a `StackRequest` means, in one place. The grid applies
// directly when there is nothing to lose and the dialog applies once the
// switch is confirmed — two routes to the same dispatch, not two dispatches.
// The saved snapshot is why that matters: its payload becoming a selection
// through `fromSeedPayload` is a fact about the stored format rather than
// about either component, and this is the single site where the baseline
// `isStackCustom` measures edits against could later be repointed at that
// payload.
//
// An empty slot applies nothing. The grid offers the saved cell only while a
// snapshot exists, so a request that outlives one has nothing to restore.
export const useApplyStackRequest = () => {
  const applyStack = useConfigStore((state) => state.applyStack)
  const applySavedStack = useConfigStore((state) => state.applySavedStack)
  const saved = useSavedStackStore((state) => state.saved)

  // SAME PAYLOAD, SAME WELCOME, and that is EDITOR-59. A saved stack holds the
  // payload a share link holds — the local slot outright, an account's stack
  // behind a KV id — so it names the marketplace its ids were minted against
  // for the same reason, and owes the same three answers `openShared` gives:
  // seat that catalogue before reading a single id, park behind the marketplace
  // dialog when it will not load, and name whatever the seated catalogue could
  // not place. Without the first of them a stack saved under a marketplace was
  // pruned to nothing on every other machine, in silence.
  const adopt = async (payload: SeedPayload) => {
    const { sayCatalogue, parkCatalogue } = useUiStore.getState()

    // What the seated catalogue could not place, in the same words the
    // share-link door has used since EDITOR-16 — and nothing at all when it
    // placed everything, which is what `droppedNotice` answers `null` for.
    const apply = () => {
      const config = adoptSeedPayload(payload)
      applySavedStack(config)
      sayCatalogue(droppedNotice(unknownPayloadIds(payload, config)))
    }

    const unseated = await seatCatalog(payload.marketplace)
    if (!unseated) return apply()

    // `STAYS_PARKED` for the reason an arriving link's import does: these ids
    // belong to the marketplace the PAYLOAD names, so clearing the field for
    // the public catalogue would prune every one of them rather than re-point
    // anything.
    parkCatalogue(
      { ...unseated, onSeated: apply, onPublic: STAYS_PARKED },
      parkedNotice(A_STACK, unseated.marketplace)
    )
  }

  return (request: StackRequest) => {
    if (request.kind === "stack") return applyStack(request.stackId)

    // An account's stack is a POINTER, so applying it is a fetch — the same
    // one a share link makes, against the same route, returning the same
    // payload. A failed fetch changes nothing on screen rather than clearing
    // the selection: the id resolving to nothing is not a reason to discard
    // what the person is looking at.
    if (request.kind === "remote")
      return void fetchSharedConfig(request.configId).then((result) => {
        if (result.ok) void adopt(result.payload)
      })

    if (saved) void adopt(saved)
  }
}
