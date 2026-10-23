import { Lattice, LatticeCell } from "@workspace/ui/components/lattice"
import { useEffect, useMemo } from "react"

import {
  displayNameOf,
  isStackCustom,
  type ConfigSelection,
} from "@/features/configure/lib/derive"
import {
  holdsAnything,
  replaceableSkillCount,
} from "@/features/configure/lib/held-global"
import { useLocalSavesOnGrid } from "@/features/configure/lib/save-stack"
import { matchesSavedStack } from "@/features/configure/lib/seed"
import { useApplyStackRequest } from "@/features/configure/lib/use-apply-stack-request"
import { useLatticeColumns } from "@/features/configure/lib/use-lattice-columns"
import { expandActiveStack, useCatalogStore } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import { useHeldGlobalStore } from "@/stores/held-global-store"
import {
  useAccountStore,
  type AdoptionRefusal,
  type Unadopted,
} from "@/stores/account-store"
import type { SavedStack } from "@/stores/saved-stack-store"
import { useUiStore, type StackRequest } from "@/stores/ui-store"

import type { RemoteStack } from "@/lib/api/stacks"
import type { SeedPayload } from "@workspace/matrix"

export const SCRATCH_NAME = "Start from scratch"
export const CLEARED_SCRATCH_NAME = "Clear and start from scratch"

type StackCell = {
  key: string
  name: string
  members: string
  request: StackRequest
}

const MEMBER_LIMIT = 5

const membersLine = (skillIds: readonly string[]) => {
  const names = skillIds
    .map(displayNameOf)
    .slice(0, MEMBER_LIMIT)
    .map((name) => name.toLowerCase())

  return skillIds.length > MEMBER_LIMIT
    ? `${names.join(" · ")} · +${skillIds.length - MEMBER_LIMIT}`
    : names.join(" · ")
}

const SCRATCH_AT_REST = {
  name: SCRATCH_NAME,
  members: "no stack · pick every skill yourself",
} as const satisfies Pick<StackCell, "name" | "members">

// "and every sub-agent" because the roster empties with the selection, but for
// what a project's link holds.
const clearedScratchWords = (removedCount: number, keepsGlobal: boolean) => ({
  name: CLEARED_SCRATCH_NAME,
  members: `removes ${removedCount} ${
    removedCount === 1 ? "skill" : "skills"
  } and every sub-agent${keepsGlobal ? " not installed globally" : ""}`,
})

// The first cell is the reset, and once there is something to clear both its
// lines say what the press costs.
const scratchCell = (
  removedCount: number,
  keepsGlobal: boolean
): StackCell => ({
  key: "scratch",
  request: { kind: "stack", stackId: null },
  ...(removedCount === 0
    ? SCRATCH_AT_REST
    : clearedScratchWords(removedCount, keepsGlobal)),
})

const toCatalogueCells = (
  stacks: readonly { id: string; name: string }[]
): StackCell[] =>
  stacks.map((stack) => ({
    key: stack.id,
    name: stack.name,
    members: membersLine(expandActiveStack(stack.id)?.skillIds ?? []),
    request: { kind: "stack", stackId: stack.id },
  }))

const localCell = ({ id, name, payload }: SavedStack): StackCell => ({
  key: `saved:${id}`,
  name,
  members: membersLine(Object.keys(payload.skills)),
  request: { kind: "saved", saveId: id, name },
})

// No members line: the payload is behind a fetch per cell.
const accountCells = (
  stacks: readonly { id: string; name: string; configId: string }[]
): StackCell[] =>
  stacks.map((saved) => ({
    key: saved.id,
    name: saved.name,
    members: "saved to your account",
    request: { kind: "remote", configId: saved.configId },
  }))

// `unwritable` never comes back on its own, so its words name the fix.
const WHY_NOT_ADOPTED = {
  unwritable:
    "a project-scoped skill is assigned to a sub-agent resting at global scope. Apply it, then fix the marked rows under assign skills",
  "out-of-date":
    "this page is out of date. Reload, and it will be carried over",
  refused: "your account would not take it. It will be carried over next time",
  unreachable:
    "your account could not be reached. It will be carried over next time",
  "signed-out":
    "your session lapsed. Sign in again, and it will be carried over",
} as const satisfies Record<AdoptionRefusal, string>

const countedStacks = (count: number) =>
  count === 1 ? "1 stack is" : `${count} stacks are`

const countByRefusal = (unadopted: Unadopted) =>
  Object.values(unadopted).reduce(
    (counts, why) => counts.set(why, (counts.get(why) ?? 0) + 1),
    new Map<AdoptionRefusal, number>()
  )

const unadoptedNotice = (unadopted: Unadopted) =>
  [...countByRefusal(unadopted)]
    .map(
      ([why, count]) =>
        `${countedStacks(count)} still saved in this browser, not in your account: ${WHY_NOT_ADOPTED[why]}.`
    )
    .join(" ")

// The saves the selection on screen is, recognised by matching it whole.
const appliedSaveIdsOf = (
  config: ConfigSelection,
  saves: readonly SavedStack[]
) =>
  new Set(
    saves
      .filter((save) => matchesSavedStack(config, save.payload))
      .map((save) => save.id)
  )

// An account's stacks the selection is, by the config id each points at.
const appliedConfigIdsOf = (
  config: ConfigSelection,
  stacks: readonly RemoteStack[],
  payloads: Readonly<Record<string, SeedPayload>>
) =>
  new Set(
    stacks
      .map((stack) => stack.configId)
      .filter((configId) =>
        matchesSavedStack(config, payloads[configId] ?? null)
      )
  )

// A stack's own expansion and a save already on the grid are nothing to lose,
// so only work that exists nowhere else stands behind the confirm.
export function StackGrid() {
  const stackId = useConfigStore((state) => state.stackId)
  const skills = useConfigStore((state) => state.skills)
  const agents = useConfigStore((state) => state.agents)
  const localSaves = useLocalSavesOnGrid()
  const held = useHeldGlobalStore((state) => state.held)
  const accountStacks = useAccountStore((state) => state.stacks)
  const accountPayloads = useAccountStore((state) => state.payloads)
  const readAccountPayloads = useAccountStore((state) => state.readPayloads)
  const unadopted = useAccountStore((state) => state.unadopted)
  const stacks = useCatalogStore((state) => state.stacks)
  const requestStack = useUiStore((state) => state.requestStack)
  const applyStackRequest = useApplyStackRequest()
  const columns = useLatticeColumns()

  const edited = useMemo(
    () => isStackCustom({ stackId, skills, agents }),
    [stackId, skills, agents]
  )

  useEffect(() => {
    void readAccountPayloads()
  }, [accountStacks, readAccountPayloads])

  const appliedSaveIds = useMemo(
    () => appliedSaveIdsOf({ stackId, skills, agents }, localSaves),
    [stackId, skills, agents, localSaves]
  )
  const appliedConfigIds = useMemo(
    () =>
      appliedConfigIdsOf(
        { stackId, skills, agents },
        accountStacks,
        accountPayloads
      ),
    [stackId, skills, agents, accountStacks, accountPayloads]
  )
  const onASave = appliedSaveIds.size > 0 || appliedConfigIds.size > 0

  const unsaved = edited && !onASave

  const catalogueCells = useMemo(() => toCatalogueCells(stacks), [stacks])

  const cells = useMemo(
    () => [
      scratchCell(
        replaceableSkillCount(held, { skills, agents }),
        holdsAnything(held)
      ),
      ...localSaves.map(localCell),
      ...accountCells(accountStacks),
      ...catalogueCells,
    ],
    [held, skills, agents, localSaves, accountStacks, catalogueCells]
  )

  // A save is recognised only by the selection being it, and that wins over
  // the `stackId` underneath. An account's is matched once its payload is read.
  const isApplied = (request: StackRequest): boolean => {
    switch (request.kind) {
      case "stack":
        return !onASave && request.stackId === stackId
      case "saved":
        return appliedSaveIds.has(request.saveId)
      case "remote":
        return appliedConfigIds.has(request.configId)
      default: {
        const _exhaustive: never = request
        return _exhaustive
      }
    }
  }

  const choose = (request: StackRequest) => {
    if (isApplied(request)) return
    if (unsaved) requestStack(request)
    else applyStackRequest(request)
  }

  const hasRefusals = Object.keys(unadopted).length > 0

  return (
    <>
      {/* Not dismissible: hiding it would hide the saves it explains. */}
      {hasRefusals && (
        <p
          data-slot="adoption-notice"
          role="alert"
          className="pt-4 font-mono text-11 text-muted-foreground italic"
        >
          {unadoptedNotice(unadopted)}
        </p>
      )}
      <Lattice columns={columns} role="group" aria-label="Stacks">
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
