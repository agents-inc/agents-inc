import type { SubAgent } from "@workspace/matrix"
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
import { useState } from "react"

import {
  ROLE_COLUMNS,
  matrixGroups,
  metaAgents,
  type MatrixGroup,
  type RoleColumn,
} from "@/features/configure/lib/agent-placement"
import { isEjectOnly, useConfigStore } from "@/stores/config-store"
import type { LoadState, SkillEntry } from "@/stores/persisted-schema"

// The one option in the panel whose consequence is not self-evident, so the
// one that gets explained — on demand rather than as standing hint text.
const SCOPE_TIP =
  "Determines where the skill is installed to. Project-level skills inherit global, but not vice versa."

// Reads as the word it is: nothing, `lazy`, or `pre`.
const loadWord = (state: LoadState | null) =>
  state === "preloaded" ? "pre" : (state ?? "")

// A switched-off row reads as unassigned here: the matrix answers "where does
// this install", and cycling an off cell starts it over at lazy.
const liveLoad = (entry: SkillEntry, agentId: string): LoadState | null => {
  const assignment = entry.assignments[agentId]
  return assignment?.enabled ? assignment.load : null
}

// 89a's glyph: an outlined circle at 12px, Lucide's geometry redrawn hard so
// it holds at this size. A real button, not a hinted span — that is what makes
// the explanation reachable without a pointer.
//
// The tip is a sibling rather than a child so `peer-*` can reveal it, and it
// resolves against the panel (the nearest positioned ancestor), clearing the
// panel's own edge instead of the label's. `:focus`, not `:focus-visible`:
// asking for the explanation with the keyboard has to work whether or not the
// browser decides the focus ring is warranted.
function InfoTip({
  label,
  text,
  flip,
}: {
  label: string
  text: string
  flip: boolean
}) {
  return (
    <>
      <button
        type="button"
        aria-label={`About ${label}`}
        className="peer ml-[0.3125rem] inline-flex cursor-pointer align-[-0.0625rem] text-faint hover:text-brand-ink focus-visible:text-brand-ink"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9.25" />
          <path d="M12 11v5.5" />
          <path d="M12 7.6v.1" />
        </svg>
      </button>
      <span
        className={`absolute top-0 z-40 hidden w-[12.25rem] bg-tip-field px-[0.5625rem] py-[0.4375rem] font-mono text-8_5 leading-[1.65] font-normal tracking-normal text-matrix-ink normal-case peer-hover:block peer-focus:block ${
          flip ? "right-[calc(100%+0.5rem)]" : "left-[calc(100%+0.5rem)]"
        }`}
      >
        {text}
      </span>
    </>
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
      // The tri-state styling comes from the one CVA so the two can never
      // drift, and the focus ring is restated here for the same reason the
      // grid's own cells carry it on the element: those variants also dress an
      // inert gap, so the rule about being focused belongs to the button.
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

// The `•••` popover. Opens to the right of its cell, top-aligned, and flips to
// the left for cells in the last column so it cannot escape the main column.
//
// Sections are separated by whitespace only — the design uses no rules inside
// the panel.
export function SkillOptionsPanel({
  skillId,
  sourceUrl,
  entry,
  flip,
}: {
  skillId: string
  // The skill's own directory on GitHub, derived in `derive.ts`.
  sourceUrl: string
  entry: SkillEntry
  flip: boolean
}) {
  const setSkillOption = useConfigStore((state) => state.setSkillOption)
  const cycleAssignment = useConfigStore((state) => state.cycleAssignment)
  const [metaOpen, setMetaOpen] = useState(false)

  const ejectOnly = isEjectOnly(skillId)

  // Both close over the open skill, so they live here rather than at module
  // scope — but they are still named, so the grid below reads as one line.
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
      role="group"
      aria-label="Skill options"
      // Kept, and no longer for the reason it was written. The panel used to sit
      // inside a cell that was itself a button, so a click reaching the ancestor
      // toggled the selection. Since EDITOR-58 the target is a sibling and nothing
      // above the panel handles a click — this guards against the cell becoming an
      // ancestor handler again rather than against one that exists today. Without
      // this, configuring a skill would also deselect it.
      onClick={(event) => event.stopPropagation()}
      className={`absolute top-0 z-30 w-[18.5rem] border border-rule bg-cell pt-1 pb-2 text-left shadow-panel ${
        flip ? "right-[calc(100%+0.3125rem)]" : "left-[calc(100%+0.3125rem)]"
      }`}
    >
      {/* Mirrors the cell's two badges — the design requires they stay in sync,
          which they do by both reading and writing the same store fields.
          Model and thinking effort were the two sections above these until v7;
          they belong to the sub-agent, and the roster is where they live now —
          a skill is a plugin from someone else's repo and configures where it
          installs, not how anyone thinks. */}
      <FieldLabel first>Install mode</FieldLabel>
      <Segmented>
        {(["plugin", "eject"] as const).map((install) => (
          <SegmentedItem
            key={install}
            active={entry.install === install}
            // A skill from outside the catalogue has no plugin form to offer:
            // a plugin install serves the third party's content as-is, and our
            // generated metadata cannot be written into their repository. So
            // the control cannot express it rather than expressing it and
            // being overruled — the store refuses it too, and neither half is
            // a fallback for the other.
            disabled={ejectOnly && install === "plugin"}
            onClick={() => setSkillOption(skillId, { install })}
          >
            {install}
          </SegmentedItem>
        ))}
      </Segmented>

      {/* Scope rode under the install-mode label until the explanation arrived:
          the info affordance hangs off a section name, so scope needed its own. */}
      <FieldLabel>
        Install scope
        <InfoTip label="install scope" text={SCOPE_TIP} flip={flip} />
      </FieldLabel>
      <Segmented>
        {(["project", "global"] as const).map((scope) => (
          <SegmentedItem
            key={scope}
            active={entry.scope === scope}
            onClick={() => setSkillOption(skillId, { scope })}
          >
            {scope}
          </SegmentedItem>
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
          <span className="ml-auto font-mono text-10 font-normal text-dots group-hover:text-ink">
            {metaOpen ? "−" : "＋"}
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

      {/* The panel's one outward link, and the only thing in it that is about
          the skill rather than about installing it. A new tab rather than a
          navigation: added skills live for this session only, so leaving the
          page would take them with it. `↗` is a text glyph like the `✕` and
          the `＋` — the design ships no icon set beyond the GitHub mark — and
          it is hidden from the tree so the link is announced by its words. */}
      <a
        href={sourceUrl}
        target="_blank"
        rel="noreferrer"
        // The panel's gutter as a margin rather than padding: the ring hugs
        // the words that way, which is what keeps it reading as a link rather
        // than as one more full-width cell under the ones above it.
        className="mt-[0.5625rem] ml-[0.625rem] inline-flex w-fit items-center gap-[0.3125rem] font-mono text-8 font-semibold tracking-[.06em] text-muted-foreground uppercase outline-none hover:text-brand-ink focus-visible:ring-1 focus-visible:ring-ring"
      >
        Source code
        <span aria-hidden>↗</span>
      </a>
    </div>
  )
}
