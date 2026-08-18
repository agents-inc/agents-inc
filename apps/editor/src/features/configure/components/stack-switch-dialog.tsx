import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@workspace/ui/components/alert-dialog"

import { useApplyStackRequest } from "@/features/configure/lib/use-apply-stack-request"
import { activeStacks } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import { SAVED_STACK_NAME } from "@/stores/saved-stack-store"
import { useUiStore, type StackRequest } from "@/stores/ui-store"

// The name in the question. The saved snapshot names itself, since no
// catalogue entry describes it.
const targetNameOf = (request: StackRequest) => {
  if (request.kind === "saved") return SAVED_STACK_NAME
  if (request.stackId === null) return "Start from scratch"

  return (
    activeStacks().find((stack) => stack.id === request.stackId)?.name ??
    "this stack"
  )
}

// Applying a stack replaces every selection and assignment wholesale, so it
// needs confirming once the user has something to lose. `StackGrid` applies
// directly unless the configuration has been *edited* away from what the
// current stack produces, so reaching this dialog always means real work is at
// stake — never merely "a stack is currently applied". The saved snapshot
// replaces just as much, so it arrives here by the same route.
export function StackSwitchDialog() {
  const pending = useUiStore((state) => state.pendingStack)
  const dismiss = useUiStore((state) => state.dismissStackRequest)
  const applyStackRequest = useApplyStackRequest()
  const skillCount = useConfigStore((state) => Object.keys(state.skills).length)

  const open = pending !== null
  const targetName = pending ? targetNameOf(pending) : ""

  const confirm = () => {
    if (pending) applyStackRequest(pending)
    dismiss()
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader title={`Switch to ${targetName}?`} />
        <AlertDialogDescription>
          You have changes that do not come from a stack. Switching replaces
          your current setup, discarding {skillCount} selected{" "}
          {skillCount === 1 ? "skill" : "skills"}, their options and their
          sub-agent assignments.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my setup</AlertDialogCancel>
          <AlertDialogAction onClick={confirm}>Switch</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
