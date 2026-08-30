import type { SeedPayload } from "@workspace/matrix"
import { Lattice, LatticeCell } from "@workspace/ui/components/lattice"
import { useMemo } from "react"

import { isStackCustom } from "@/features/configure/lib/derive"
import { matchesSavedStack } from "@/features/configure/lib/seed"
import { useApplyStackRequest } from "@/features/configure/lib/use-apply-stack-request"
import {
  activeSkillById,
  expandActiveStack,
  useCatalogStore,
} from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import {
  SAVED_STACK_NAME,
  useSavedStackStore,
} from "@/stores/saved-stack-store"
import { useAccountStore } from "@/stores/account-store"
import { useUiStore, type StackRequest } from "@/stores/ui-store"

type StackCell = {
  // Its React key alone: the saved snapshot has no catalogue id to borrow.
  key: string
  name: string
  members: string
  // What clicking it would apply, which is the only thing the saved cell does
  // differently from the catalogue cells beside it.
  request: StackRequest
}

const MEMBER_LIMIT = 5

// The cell's second line. The saved snapshot draws it from the ids its payload
// holds, so a snapshot and a stack describe themselves the same way.
const membersLine = (skillIds: readonly string[]) => {
  const names = skillIds
    .map((skillId) => activeSkillById(skillId)?.displayName ?? skillId)
    .slice(0, MEMBER_LIMIT)
    .map((name) => name.toLowerCase())

  return skillIds.length > MEMBER_LIMIT
    ? `${names.join(" · ")} · +${skillIds.length - MEMBER_LIMIT}`
    : names.join(" · ")
}

// The app's own cell rather than any catalogue's, so it survives a marketplace
// swap unchanged — every catalogue can be started from nothing.
const scratchCell: StackCell = {
  key: "scratch",
  name: "Start from scratch",
  members: "no stack · pick every skill yourself",
  request: { kind: "stack", stackId: null },
}

const toCatalogueCells = (
  stacks: readonly { id: string; name: string }[]
): StackCell[] =>
  stacks.map((stack) => ({
    key: stack.id,
    name: stack.name,
    members: membersLine(expandActiveStack(stack.id)?.skillIds ?? []),
    request: { kind: "stack", stackId: stack.id },
  }))

const savedCell = (payload: SeedPayload): StackCell => ({
  key: "saved",
  name: SAVED_STACK_NAME,
  members: membersLine(Object.keys(payload.skills)),
  request: { kind: "saved" },
})

// An account's stacks, which REPLACE the local slot rather than sitting beside
// it — one place a person looks for their own work, not two that disagree. The
// local slot is not deleted, only unshown: signing out is not a reason to lose
// what was saved before signing in.
//
// No members line. The payload is behind an id these cells hold rather than
// carry, so listing what is in one would mean a fetch per cell at first paint,
// for a line of text.
const accountCells = (
  stacks: readonly { id: string; name: string; configId: string }[]
): StackCell[] =>
  stacks.map((saved) => ({
    key: saved.id,
    name: saved.name,
    members: "saved to your account",
    request: { kind: "remote", configId: saved.configId },
  }))

// The test is `isStackCustom`, not "is anything selected": a stack's own
// expansion is not something the user chose, so browsing between stacks has
// nothing to lose. Prompting every time trains people to dismiss it unread.
// The saved snapshot is the second thing that cannot be lost — it is in the
// slot, not merely on screen — so it reads as clean by the same argument.
export function StackGrid() {
  const stackId = useConfigStore((state) => state.stackId)
  const skills = useConfigStore((state) => state.skills)
  const agents = useConfigStore((state) => state.agents)
  const saved = useSavedStackStore((state) => state.saved)
  const account = useAccountStore((state) => state.session)
  const accountStacks = useAccountStore((state) => state.stacks)
  const stacks = useCatalogStore((state) => state.stacks)
  const requestStack = useUiStore((state) => state.requestStack)
  const applyStackRequest = useApplyStackRequest()

  const edited = useMemo(
    () => isStackCustom({ stackId, skills, agents }),
    [stackId, skills, agents]
  )

  // Derived on every selection change rather than stored, so it is right the
  // instant Save is clicked and again after a reload, with no second copy of
  // the truth to keep in step. The serialisation behind it is memoised for the
  // same reason the install command memoises its own: the grid re-renders on
  // every store change, and an empty slot costs nothing either way.
  const savedApplied = useMemo(
    () => matchesSavedStack({ stackId, skills, agents }, saved),
    [stackId, skills, agents, saved]
  )

  // Work that exists nowhere else: an edit that is neither a stack's own
  // expansion nor the snapshot already sitting in the slot.
  const unsaved = edited && !savedApplied

  // Memoised on the stacks rather than computed at module scope: expanding
  // every stack per render would re-run on every keystroke in the filter bar,
  // and a module-level constant would be the vendored catalogue forever.
  const catalogueCells = useMemo(() => toCatalogueCells(stacks), [stacks])

  // Straight after scratch, and only while a snapshot exists: it is a starting
  // point rather than a stack the catalogue knows about.
  // Signed in, the account's stacks. Signed out, the one local slot. Never
  // both: two lists of "your saved stacks" that can disagree is worse than
  // either, and the local slot survives untouched under the account's.
  const cells = useMemo(() => {
    if (account)
      return [scratchCell, ...accountCells(accountStacks), ...catalogueCells]

    return saved
      ? [scratchCell, savedCell(saved), ...catalogueCells]
      : [scratchCell, ...catalogueCells]
  }, [account, accountStacks, saved, catalogueCells])

  // The saved cell is drawn as the current stack by the selection *being* the
  // snapshot, since that is all it can be recognised by. That reading wins over
  // the id underneath: a snapshot restored whole is the stack the user is on,
  // and one taken from scratch would otherwise light up "Start from scratch"
  // over a selection they deliberately named.
  // An account's stack never reads as applied. What it points at is behind a
  // fetch, so answering would mean holding every payload the grid can offer
  // just to draw a border — and `savedApplied` already covers the case that
  // matters, which is the selection currently on screen having come from a
  // snapshot rather than from a catalogue stack.
  const isApplied = (request: StackRequest) => {
    if (request.kind === "saved") return savedApplied
    if (request.kind === "remote") return false

    return !savedApplied && request.stackId === stackId
  }

  // Both kinds replace the whole selection, so both stand behind the same
  // confirm — and behind nothing at all when there is no work to lose.
  const choose = (request: StackRequest) => {
    if (isApplied(request)) return
    if (unsaved) requestStack(request)
    else applyStackRequest(request)
  }

  return (
    <Lattice columns={4} role="group" aria-label="Stacks">
      {cells.map((cell) => (
        <LatticeCell
          key={cell.key}
          selected={isApplied(cell.request)}
          className="px-[0.8125rem] py-[0.6875rem]"
          role="button"
          tabIndex={0}
          // Otherwise the name swallows the member-skill line beneath it.
          aria-label={cell.name}
          aria-pressed={isApplied(cell.request)}
          onClick={() => choose(cell.request)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              choose(cell.request)
            }
          }}
        >
          <span className="text-12 font-semibold text-ink">{cell.name}</span>
          <span
            className={`mt-1 font-mono text-9 font-normal ${
              isApplied(cell.request) ? "text-brand-ink" : "text-subtle"
            }`}
          >
            {cell.members}
          </span>
        </LatticeCell>
      ))}
    </Lattice>
  )
}
