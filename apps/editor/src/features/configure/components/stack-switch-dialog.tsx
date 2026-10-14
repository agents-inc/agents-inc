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
import { useUiStore, type StackRequest } from "@/stores/ui-store"

import { SCRATCH_NAME } from "./stack-grid"

const targetNameOf = (request: StackRequest) => {
  if (request.kind === "saved") return request.name
  // The grid knows an account stack's name and this dialog does not.
  if (request.kind === "remote") return "your saved stack"
  if (request.stackId === null) return SCRATCH_NAME

  return (
    activeStacks().find((stack) => stack.id === request.stackId)?.name ??
    "this stack"
  )
}

// Reached only when the selection holds work that exists nowhere else, since
// `StackGrid` applies directly otherwise.
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
