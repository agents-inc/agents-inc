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
import { useAccountStore, type AdoptionRefusal } from "@/stores/account-store"
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

/**
 * What the grid says when a first sign-in could not take the local snapshot.
 *
 * ONE FRAME AND FIVE TAILS, and the split is the whole design. The frame
 * answers the only question that matters in the moment — the work is still here
 * — and the tail says which ending stopped it, because four of these come back
 * on the next load and one of them never will.
 *
 * `unwritable` is that one, and it is the reason this copy exists at all: a
 * project-scoped skill assigned to a sub-agent resting at global scope is
 * refused by the write contract before the request leaves (CLI-851), so it
 * fails identically on every load forever. Its sentence names the PAIR rather
 * than the failure, and says to apply the snapshot first — the rows carrying
 * the fix are not on screen until it is, which is what makes the roster's own
 * "fix marked rows" wrong here.
 */
const WHY_NOT_ADOPTED = {
  unwritable:
    "a project-scoped skill is assigned to a sub-agent resting at global scope. Apply it, then fix the marked rows under Sub-agents",
  "out-of-date":
    "this page is out of date. Reload, and it will be carried over",
  refused: "your account would not take it. It will be carried over next time",
  unreachable:
    "your account could not be reached. It will be carried over next time",
  "signed-out":
    "your session lapsed. Sign in again, and it will be carried over",
} as const satisfies Record<AdoptionRefusal, string>

const unadoptedNotice = (refusal: AdoptionRefusal) =>
  `Still saved in this browser, not in your account: ${WHY_NOT_ADOPTED[refusal]}.`

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
  const unadopted = useAccountStore((state) => state.unadopted)
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

  // Signed in, the account's stacks. Signed out, the one local slot. Normally
  // never both: two lists of "your saved stacks" that can disagree is worse
  // than either, and the local slot survives untouched under the account's.
  //
  // A slot the account REFUSED is the exception, and it is the whole of
  // EDITOR-67. That snapshot is in neither list, so hiding it is not replacing
  // it — it is losing it, in silence, at the moment somebody signs in.
  //
  // BOTH LISTS AT ONCE IS THEREFORE REACHABLE, and it is the accepted outcome
  // rather than a case the store rules out. This comment used to claim the
  // second, on the store's word that `unadopted` went null the moment the
  // account held anything — and `save` kept that word by clearing it on every
  // save, which is what dropped a refused slot off the grid one Save after
  // EDITOR-67 drew it (EDITOR-73). Every signed-in save is named "Saved stack"
  // anyway, so the guarantee was never worth what it cost. The two cells are
  // told apart by their second line, which is the same reading the E2E pair
  // relies on: the local slot lists the skills it holds, and an account's row
  // can only say it is in the account.
  const keepsLocalSlot = !account || unadopted !== null

  // Straight after scratch, and only while a snapshot exists: it is a starting
  // point rather than a stack the catalogue knows about.
  const cells = useMemo(
    () => [
      scratchCell,
      ...(saved && keepsLocalSlot ? [savedCell(saved)] : []),
      ...accountCells(accountStacks),
      ...catalogueCells,
    ],
    [keepsLocalSlot, accountStacks, saved, catalogueCells]
  )

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
    <>
      {/* Above the grid rather than on the cell, because it is a sentence about
          what did NOT happen to the cell — and the person has to be able to
          read it without hovering anything. `alert` for the reason the
          catalogue notice above it is one: it reports what an arrival cost,
          and this arrival is a sign-in the person just asked for. Located by
          slot in the E2E suite, since `main` already draws an alert.

          DELIBERATELY NOT DISMISSIBLE, ruled with EDITOR-73 when this stopped
          being cleared by an unrelated save and so became a sentence that can
          outlive a reload. A control here has only two honest behaviours and
          both are worse than none: clear the notice and keep the cell, leaving
          a slot with nothing to explain it — which is the confusion EDITOR-67
          closed — or clear both, which is this row's own data loss with the
          user's finger on it. It is already dismissible by the route its own
          words name: repair the snapshot and save it, and the next refresh
          finds nothing to report. A "hide this" button would be labelled
          honestly only as "hide my work". */}
      {unadopted && (
        <p
          data-slot="adoption-notice"
          role="alert"
          className="pt-4 font-mono text-11 text-muted-foreground italic"
        >
          {unadoptedNotice(unadopted)}
        </p>
      )}
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
    </>
  )
}
