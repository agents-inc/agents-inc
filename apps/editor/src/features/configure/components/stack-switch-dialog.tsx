import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@workspace/ui/components/alert-dialog"

import {
  holdsAnything,
  replaceableSkillCount,
} from "@/features/configure/lib/held-global"
import {
  stackSwitchCost,
  useApplyStackRequest,
  type StackSwitchCost,
} from "@/features/configure/lib/use-apply-stack-request"
import { useAccountStore } from "@/stores/account-store"
import { activeStacks } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import { useHeldGlobalStore } from "@/stores/held-global-store"
import { useUiStore, type StackRequest } from "@/stores/ui-store"

import { SCRATCH_NAME } from "./stack-grid"

const catalogueStackName = (stackId: string | null) => {
  if (stackId === null) return SCRATCH_NAME

  return (
    activeStacks().find((stack) => stack.id === stackId)?.name ?? "this stack"
  )
}

const targetNameOf = (request: StackRequest): string => {
  switch (request.kind) {
    case "stack":
      return catalogueStackName(request.stackId)
    case "saved":
      return request.name
    // The grid knows an account stack's name and this dialog does not.
    case "remote":
      return "your saved stack"
    default: {
      const _exhaustive: never = request
      return _exhaustive
    }
  }
}

const discarding = (skillCount: number) =>
  `Switching replaces your current setup, discarding ${skillCount} selected ${skillCount === 1 ? "skill" : "skills"}, their options and their sub-agent assignments.`

// True whatever the payload names: built on the marketplace on screen, the
// stack replaces the setup that would otherwise stay saved.
const builtOnUnread = (
  <>
    This stack is built on{" "}
    <span
      data-slot="stack-marketplace-loading"
      className="font-mono text-muted-foreground"
    >
      loading…
    </span>
  </>
)

const consequenceOf = (cost: StackSwitchCost, skillCount: number) => {
  switch (cost.kind) {
    case "unread":
      return builtOnUnread
    case "failed":
      return "Couldn't load this stack."
    case "replaces":
      return discarding(skillCount)
    case "elsewhere":
      return cost.consequence
    default: {
      const _exhaustive: never = cost
      return _exhaustive
    }
  }
}

// Only when the selection holds work that exists nowhere else.
export function StackSwitchDialog() {
  const pending = useUiStore((state) => state.pendingStack)
  const dismiss = useUiStore((state) => state.dismissStackRequest)
  const applyStackRequest = useApplyStackRequest()
  const held = useHeldGlobalStore((state) => state.held)
  const skillCount = useConfigStore((state) =>
    replaceableSkillCount(held, state)
  )
  // Subscribed, so a read answering while the question is open is said.
  const payloads = useAccountStore((state) => state.payloads)
  const failedReads = useAccountStore((state) => state.failedReads)
  const readAccountPayloads = useAccountStore((state) => state.readPayloads)

  const open = pending !== null
  const targetName = pending ? targetNameOf(pending) : ""
  const cost = pending
    ? stackSwitchCost(pending, { payloads, failedReads })
    : null
  const consequence = cost ? consequenceOf(cost, skillCount) : ""
  const failed = cost?.kind === "failed"

  const confirm = () => {
    if (pending) applyStackRequest(pending)
    dismiss()
  }

  const retry = () => void readAccountPayloads()

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && dismiss()}>
      <AlertDialogContent>
        <AlertDialogHeader title={`Switch to ${targetName}?`} />
        <AlertDialogDescription>
          You have changes that do not come from a stack.{" "}
          {/* Polite, so the sentence that replaces the loading is read out. */}
          <span aria-live="polite">{consequence}</span>
          {holdsAnything(held) && " What is installed globally stays."}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my setup</AlertDialogCancel>
          {/* One button, so focus stays on it as Retry gives way to a Switch
              that waits for the load and never does what the question has
              not said. */}
          <AlertDialogAction
            focusableWhenDisabled
            disabled={cost?.kind === "unread"}
            onClick={failed ? retry : confirm}
          >
            {failed ? "Retry" : "Switch"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
