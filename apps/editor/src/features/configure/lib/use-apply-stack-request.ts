import { useConfigStore } from "@/stores/config-store"
import { useSavedStackStore } from "@/stores/saved-stack-store"
import { adoptSeedPayload } from "./seed"

import type { StackRequest } from "@/stores/ui-store"

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

  return (request: StackRequest) => {
    if (request.kind === "stack") applyStack(request.stackId)
    else if (saved) applySavedStack(adoptSeedPayload(saved))
  }
}
