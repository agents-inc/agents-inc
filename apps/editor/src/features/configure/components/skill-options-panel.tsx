import type { SubAgent } from "@workspace/matrix"
import { Glyph } from "@workspace/ui/components/glyph"
import {
  MatrixGrid,
  matrixCellVariants,
  type MatrixRow,
} from "@workspace/ui/components/matrix-grid"
import {
  FieldLabel,
  Segmented,
  SegmentedItem,
} from "@workspace/ui/components/segmented"
import { cn } from "@workspace/ui/lib/utils"
import { useRef, useState } from "react"

import {
  ROLE_COLUMNS,
  matrixGroups,
  metaAgents,
  type MatrixGroup,
  type RoleColumn,
} from "@/features/configure/lib/agent-placement"
import { patchForPress, pressRefusal } from "@/features/configure/lib/provider"
import { usePanelRoom } from "@/features/configure/lib/use-panel-room"
import { isEjectOnly, useConfigStore } from "@/stores/config-store"
import {
  SKILL_INSTALL_MODES,
  SKILL_SCOPES,
  type LoadState,
  type SkillEntry,
  type SkillOptions,
} from "@/stores/persisted-schema"
import { useUiStore } from "@/stores/ui-store"
import { InfoTip } from "./info-tip"

const SCOPE_TIP =
  "Determines where the skill is installed to. Project-level skills inherit global, but not vice versa."

const loadWord = (state: LoadState | null) =>
  state === "preloaded" ? "pre" : (state ?? "")

// A switched-off row reads as unassigned here: the matrix answers "where does
// this install", and cycling an off cell starts it over at lazy.
const liveLoad = (entry: SkillEntry, agentId: string): LoadState | null => {
  const assignment = entry.assignments[agentId]
  return assignment?.enabled ? assignment.load : null
}

// A refused value takes the unavailable ink and no hover. A refused value that
// is also chosen is an error the skill cell draws.
const REFUSED_SEGMENT =
  "cursor-not-allowed text-unavailable hover:border-divider"

function PlacementSegment({
  value,
  active,
  disabled,
  refusal,
  onPick,
}: {
  value: string
  active: boolean
  disabled?: boolean
  refusal: string | undefined
  onPick: () => void
}) {
  const refused = refusal !== undefined

  return (
    <SegmentedItem
      active={active}
      disabled={disabled}
      // Not `disabled`, which would suppress the `title` carrying the reason.
      aria-disabled={refused || undefined}
      title={refusal}
      className={refused && !active ? REFUSED_SEGMENT : undefined}
      onClick={onPick}
    >
      {value}
    </SegmentedItem>
  )
}

// An agent row the grid cannot place: the same cell, labelled and full width.
function LabelledAgentCell({
  agent,
  state,
  onCycle,
}: {
  agent: SubAgent
  state: LoadState | null
  onCycle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onCycle}
      // The ring is restated: the matrix variants also dress an inert gap.
      className={cn(
        matrixCellVariants({ state: state ?? "empty" }),
        "justify-between px-[0.3125rem] outline-none focus-visible:ring-1 focus-visible:ring-ring"
      )}
    >
      <span className="truncate">{agent.id}</span>
      <span>{loadWord(state)}</span>
    </button>
  )
}

// The `•••` popover: right of its cell, flipped left in the last column.
export function SkillOptionsPanel({
  skillId,
  sourceUrl,
  entry,
  flip,
}: {
  skillId: string
  sourceUrl: string
  entry: SkillEntry
  flip: boolean
}) {
  const setSkillOption = useConfigStore((state) => state.setSkillOption)
  const cycleAssignment = useConfigStore((state) => state.cycleAssignment)
  const provider = useUiStore((state) => state.provider)
  const [metaOpen, setMetaOpen] = useState(false)

  const panelRef = useRef<HTMLDivElement>(null)
  usePanelRoom(panelRef)

  const ejectOnly = isEjectOnly(skillId)

  // The second door onto the cell's pairs, so it asks the same rule.
  const refusalFor = (patch: Partial<SkillOptions>) =>
    pressRefusal(provider, entry, patch)

  const pick = (patch: Partial<SkillOptions>) => {
    if (refusalFor(patch) !== undefined) return

    setSkillOption(skillId, patchForPress(provider, patch))
  }

  const toMatrixCell = (group: MatrixGroup, role: RoleColumn) => {
    const agent = group.byRole.get(role.id)
    if (!agent) return null

    return {
      key: agent.id,
      label: role.short,
      state: liveLoad(entry, agent.id),
      onCycle: () => cycleAssignment(skillId, agent.id),
    }
  }

  const toMatrixRow = (group: MatrixGroup): MatrixRow => ({
    key: group.domainId,
    label: group.label,
    cells: ROLE_COLUMNS.map((role) => toMatrixCell(group, role)),
  })

  const rows = matrixGroups.map(toMatrixRow)

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label="Skill options"
      // A guard: an ancestor handling it would deselect the skill.
      onClick={(event) => event.stopPropagation()}
      className={`absolute top-0 z-30 w-[18.5rem] border border-rule bg-cell pt-1 pb-2 text-left shadow-panel ${
        flip ? "right-[calc(100%+0.3125rem)]" : "left-[calc(100%+0.3125rem)]"
      }`}
    >
      <FieldLabel first>Install mode</FieldLabel>
      <Segmented>
        {SKILL_INSTALL_MODES.map((install) => (
          <PlacementSegment
            key={install}
            value={install}
            active={entry.install === install}
            // An added skill has no plugin form; the store refuses it too.
            disabled={ejectOnly && install === "plugin"}
            refusal={refusalFor({ install })}
            onPick={() => pick({ install })}
          />
        ))}
      </Segmented>

      <FieldLabel>
        Install scope
        {/* The tip hangs from the panel, clearing its edge. */}
        <InfoTip
          label="About install scope"
          glyph="info"
          flip={flip}
          className="ml-[0.3125rem] cursor-pointer align-[-0.0625rem] text-faint hover:text-brand-ink focus-visible:text-brand-ink"
        >
          {SCOPE_TIP}
        </InfoTip>
      </FieldLabel>
      <Segmented>
        {SKILL_SCOPES.map((scope) => (
          <PlacementSegment
            key={scope}
            value={scope}
            active={entry.scope === scope}
            refusal={refusalFor({ scope })}
            onPick={() => pick({ scope })}
          />
        ))}
      </Segmented>

      <FieldLabel>Sub-agents</FieldLabel>
      <div className="px-[0.625rem] pt-[0.125rem]">
        <MatrixGrid
          columns={ROLE_COLUMNS.map((role) => role.short)}
          rows={rows}
        />

        <button
          type="button"
          aria-expanded={metaOpen}
          onClick={() => setMetaOpen((open) => !open)}
          className="group flex w-full cursor-pointer items-center gap-2 pt-2 text-left"
        >
          <span className="font-mono text-8 font-semibold tracking-[.06em] text-ink-3 uppercase">
            Meta
          </span>
          <span className="ml-auto flex text-dots group-hover:text-ink">
            <Glyph name={metaOpen ? "minus" : "plus"} size={11} />
          </span>
        </button>

        {metaOpen && (
          <div className="mt-[0.375rem] flex flex-col gap-[0.125rem]">
            {metaAgents.map((agent) => (
              <LabelledAgentCell
                key={agent.id}
                agent={agent}
                state={liveLoad(entry, agent.id)}
                onCycle={() => cycleAssignment(skillId, agent.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* A new tab: added skills live for this session only. */}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
        // A margin, so the ring hugs the words.
        className="mt-[0.5625rem] ml-[0.625rem] inline-flex w-fit items-center gap-[0.3125rem] font-mono text-8 font-semibold tracking-[.06em] text-muted-foreground uppercase outline-none hover:text-brand-ink focus-visible:ring-1 focus-visible:ring-ring"
      >
        Source code
        <span aria-hidden>↗</span>
      </a>
    </div>
  )
}
