import { DOMAIN_LABELS, type SubAgent } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"
import { useEffect, useRef, useState } from "react"

import {
  selectRosterGroups,
  summarize,
  type RosterAgentRow,
  type RosterSkillRow,
} from "@/features/configure/lib/derive"
import { toSeedPayload } from "@/features/configure/lib/seed"
import {
  useShareLink,
  type ShareState,
} from "@/features/configure/lib/use-share-link"
import type { ConfigSelection } from "@/features/configure/lib/derive"
import { useConfigStore } from "@/stores/config-store"
import {
  AGENT_EFFORTS,
  AGENT_MODELS,
  AGENT_SCOPES,
  type AgentEffort,
  type AgentModel,
  type AgentScope,
} from "@/stores/persisted-schema"
import { useSavedStackStore } from "@/stores/saved-stack-store"
import { useUiStore } from "@/stores/ui-store"

const SHARE_LABELS: Record<ShareState, string> = {
  idle: "Share",
  sharing: "Sharing…",
  copied: "Link copied",
  failed: "Sharing failed",
}

// The domain band is exactly this tall, and each pinned header offsets by one
// band per index — that is what makes them stack while scrolling.
const BAND_REM = 1.625

// The where-used overlay, measured at hover time — position is geometry, not
// configuration, so none of it is stored.
type UseTip = {
  rows: { agent: SubAgent; here: boolean; newDomain: boolean }[]
  x: number | null
  right: number | null
  y: number
}

// Both roster controls step through their scale and wrap, starting from
// whatever the row currently resolves to.
const nextInCycle = <T,>(cycle: readonly T[], current: T): T =>
  cycle[(cycle.indexOf(current) + 1) % cycle.length]!

const tipName = (agent: SubAgent) =>
  `${DOMAIN_LABELS[agent.domainId].toLowerCase()} ${agent.label.toLowerCase()}`

const TIP_ID = "where-used-tip"

// Geometry, all measured at hover time. The gap is the air between the tooltip
// and whatever it is anchored to; the margin is how close it may come to the
// viewport edge; and it needs this much room on the right to open that way.
const TIP_GAP_PX = 7
const VIEWPORT_MARGIN_PX = 8
const TIP_MIN_ROOM_PX = 160

// Rows and domain gaps at the app's 110% scale, plus the frame. An estimate,
// but only the upward clamp consumes it, so a long list still opens intact.
const TIP_ROW_PX = 15.5
const TIP_DOMAIN_GAP_PX = 7
const TIP_FRAME_PX = 16

// Names only, with the agent being pointed from marked and a break wherever
// the domain changes — the tooltip's whole content.
const toTipRows = (usedBy: SubAgent[], fromAgentId: string) =>
  usedBy.map((agent, index) => ({
    agent,
    here: agent.id === fromAgentId,
    newDomain: index > 0 && usedBy[index - 1]?.domainId !== agent.domainId,
  }))

const estimateTipHeight = (rows: UseTip["rows"]) => {
  const domainBreaks = rows.filter((row) => row.newDomain).length

  return (
    rows.length * TIP_ROW_PX + domainBreaks * TIP_DOMAIN_GAP_PX + TIP_FRAME_PX
  )
}

// Opens to the right of the number, or flips when there is no room — and when
// it flips it clears the whole panel, anchored to the panel's edge rather than
// the number's. Clamped against its own height so a long list opens upward
// near the viewport bottom.
const placeTip = (
  anchor: DOMRect,
  panel: DOMRect | undefined,
  height: number
): Omit<UseTip, "rows"> => {
  const fits = window.innerWidth - anchor.right > TIP_MIN_ROOM_PX
  const highestTop = window.innerHeight - height - VIEWPORT_MARGIN_PX

  return {
    x: fits ? Math.round(anchor.right + TIP_GAP_PX) : null,
    right:
      fits || !panel
        ? null
        : Math.round(window.innerWidth - panel.left + TIP_GAP_PX),
    y: Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(anchor.top - VIEWPORT_MARGIN_PX, highestTop)
    ),
  }
}

// One flat field and nothing else (90j): no border, no shadow, no accent edge
// — the frame was doing the work the surface now does, and three of them
// stacked on a panel that already has hairlines everywhere read as noise.
function WhereUsedTip({ tip }: { tip: UseTip }) {
  return (
    <div
      id={TIP_ID}
      role="tooltip"
      className="fixed z-[120] bg-tip-field px-[0.625rem] py-[0.4375rem]"
      style={{
        top: tip.y,
        left: tip.x ?? "auto",
        right: tip.right ?? "auto",
      }}
    >
      {tip.rows.map(({ agent, here, newDomain }) => (
        <div
          key={agent.id}
          className={`flex items-baseline gap-[0.4375rem] py-px whitespace-nowrap ${
            newDomain ? "mt-1.5" : ""
          }`}
        >
          {/* Colour alone marks the agent being pointed from — one weight
              throughout, so the list reads as a list. */}
          <span
            className={`font-mono text-8_5 leading-[1.65] font-normal ${
              here ? "text-brand-ink" : "text-matrix-ink"
            }`}
          >
            {tipName(agent)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Nothing on the right edge of a skill row may compete with the effort meter
// above it, so both of them wait to be asked for: revealed while the pointer is
// anywhere over the agent block, or while focus is inside it — the keyboard
// half, without which the load word could be tabbed to but never read.
//
// Opacity, not display: the words hold their place in the layout, or every row
// beneath one would move the moment the pointer arrived.
const QUIET_AT_REST =
  "opacity-0 transition-opacity duration-[120ms] group-hover/agent:opacity-100 group-focus-within/agent:opacity-100"

// One assignment line: bullet · name · load word · where-used. A 4-track grid
// so the bullet occupies the first track and every skill name shares the
// agents' flush left edge — indentation by structure, not padding.
function SkillRow({
  skill,
  agentOn,
  agentId,
  onShowUses,
  onHideUses,
}: {
  skill: RosterSkillRow
  agentOn: boolean
  agentId: string
  onShowUses: (anchor: HTMLElement, skill: RosterSkillRow) => void
  onHideUses: () => void
}) {
  const toggleAssignmentEnabled = useConfigStore(
    (state) => state.toggleAssignmentEnabled
  )
  const flipAssignmentLoad = useConfigStore((state) => state.flipAssignmentLoad)

  // The row reads as off when either switch is off — its own, or the agent's.
  const live = agentOn && skill.enabled

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={skill.enabled}
      aria-label={`${skill.displayName} on ${agentId}`}
      onClick={() => toggleAssignmentEnabled(skill.id, agentId)}
      onKeyDown={(event) => {
        // Only when the row itself is focused — the nested load-word and
        // where-used buttons must keep their own native activation.
        if (event.target !== event.currentTarget) return
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          toggleAssignmentEnabled(skill.id, agentId)
        }
      }}
      className="-mx-1 grid w-[calc(100%+0.5rem)] cursor-pointer grid-cols-[1rem_minmax(0,1fr)_1.875rem_1.625rem] items-center px-1 py-0.5 hover:bg-skill-hover"
    >
      <span
        aria-hidden
        className={`mx-0.5 block size-[0.3125rem] ${
          live
            ? "bg-brand"
            : "bg-transparent shadow-[inset_0_0_0_1px_var(--color-hairline)]"
        }`}
      />
      <span
        className={`truncate text-10_5 leading-[1.35] font-normal ${
          live ? "text-brand" : "text-roster-off"
        }`}
      >
        {skill.displayName}
      </span>
      {/* `pre` / `lazy` — never "preloaded" — and never amber: that is
          reserved for the name's on-state. One grey for both words, since the
          distinction they used to draw competes with the effort meter directly
          above them. Click flips this agent's copy. */}
      <button
        type="button"
        aria-label={`Load mode: ${skill.load}`}
        onClick={(event) => {
          event.stopPropagation()
          flipAssignmentLoad(skill.id, agentId)
        }}
        className={`cursor-pointer pr-1.5 text-right font-mono text-8 font-medium tracking-[.06em] text-roster-off uppercase hover:text-roster-ink ${QUIET_AT_REST}`}
      >
        {skill.load === "preloaded" ? "pre" : "lazy"}
      </button>
      {skill.usedBy.length > 1 ? (
        <button
          type="button"
          aria-label={`Used by ${skill.usedBy.length} sub-agents`}
          aria-describedby={TIP_ID}
          onMouseEnter={(event) => onShowUses(event.currentTarget, skill)}
          onMouseLeave={onHideUses}
          // Keyboard users get the same answer: focus opens, blur closes.
          onFocus={(event) => onShowUses(event.currentTarget, skill)}
          onBlur={onHideUses}
          onClick={(event) => event.stopPropagation()}
          className={`mr-0.5 flex size-[0.8125rem] cursor-help items-center justify-center justify-self-end font-mono text-7_5 font-medium text-use-ink hover:bg-wash hover:text-brand-ink ${QUIET_AT_REST}`}
        >
          {skill.usedBy.length}
        </button>
      ) : (
        <span />
      )}
    </div>
  )
}

// The model an agent runs on, as the word itself. Click cycles the four the
// CLI offers, starting from whatever the row resolves to — there is no menu,
// because at four values a menu costs more than a second click.
function ModelWord({
  agentId,
  model,
  on,
}: {
  agentId: string
  model: AgentModel
  on: boolean
}) {
  const setAgentOption = useConfigStore((state) => state.setAgentOption)

  return (
    <button
      type="button"
      // The word is the value, so a screen reader gets it either way — but not
      // *which* value it is, which is the whole content of the control.
      aria-label={`Model for ${agentId}: ${model}`}
      onClick={() =>
        setAgentOption(agentId, { model: nextInCycle(AGENT_MODELS, model) })
      }
      className={`cursor-pointer font-mono text-9_5 font-medium ${
        on ? "text-matrix-ink hover:text-roster-ink" : "text-roster-off"
      }`}
    >
      {model}
    </button>
  )
}

// Where this agent's front-matter is written: the project, or the user's own
// ~/.claude. Two values rather than four, so the word is even more plainly the
// control — and it is the same shape the model word takes for the same reason.
function ScopeWord({
  agentId,
  scope,
  on,
}: {
  agentId: string
  scope: AgentScope
  on: boolean
}) {
  const setAgentOption = useConfigStore((state) => state.setAgentOption)

  return (
    <button
      type="button"
      aria-label={`Scope for ${agentId}: ${scope}`}
      onClick={() =>
        setAgentOption(agentId, { scope: nextInCycle(AGENT_SCOPES, scope) })
      }
      className={`cursor-pointer font-mono text-8 font-medium tracking-[.06em] uppercase ${
        on ? "text-matrix-ink hover:text-roster-ink" : "text-roster-off"
      }`}
    >
      {scope}
    </button>
  )
}

// Five squares, one per level — the design draws three because its placeholder
// scale had three; the contract's scale has five and the meter follows it.
// Drawn, never written, so the value lives in the accessible name alone.
function EffortMeter({
  agentId,
  effort,
  on,
}: {
  agentId: string
  effort: AgentEffort
  on: boolean
}) {
  const setAgentOption = useConfigStore((state) => state.setAgentOption)
  const filled = AGENT_EFFORTS.indexOf(effort) + 1

  return (
    <button
      type="button"
      aria-label={`Effort for ${agentId}: ${effort}`}
      onClick={() =>
        setAgentOption(agentId, { effort: nextInCycle(AGENT_EFFORTS, effort) })
      }
      className="flex cursor-pointer items-center gap-[0.125rem]"
    >
      {AGENT_EFFORTS.map((level, index) => (
        <span
          key={level}
          aria-hidden
          className={`block size-[0.3125rem] border ${
            index < filled
              ? on
                ? "border-brand bg-brand"
                : "border-meter-off bg-meter-off"
              : "border-meter-border"
          }`}
        />
      ))}
    </button>
  )
}

function AgentBlock({
  row,
  flashed,
  onShowUses,
  onHideUses,
}: {
  row: RosterAgentRow
  flashed: boolean
  onShowUses: (anchor: HTMLElement, skill: RosterSkillRow) => void
  onHideUses: () => void
}) {
  const toggleAgentPin = useConfigStore((state) => state.toggleAgentPin)
  const { agent, on, model, effort, scope, skills } = row

  return (
    // The block is agent row + its skill rows, which is the unit the quiet
    // detail reveals over: pointing at one row answers for the whole agent,
    // and the next agent stays quiet.
    <div className="group/agent pb-2">
      {/* The name row. The three controls are siblings of the pin, never
          children of it: nested they would each swallow the click that pins
          and bury their own values inside the pin's accessible name. */}
      <div className="-mx-1 flex w-[calc(100%+0.5rem)] items-baseline">
        {/* State is colour only — no checkbox, no bracket. Click pins the
            agent to the opposite of what it currently derives to. */}
        <button
          type="button"
          aria-pressed={on}
          onClick={() => toggleAgentPin(agent.id)}
          // The pulse is the row's own tint and nothing else — the prototype's
          // amber left bar reads as a second, competing marker at this size.
          className={`min-w-0 flex-1 cursor-pointer px-1 py-0.5 text-left transition-colors duration-[250ms] ${
            flashed ? "bg-flash" : "hover:bg-roster-hover"
          }`}
        >
          <span
            className={`text-11_5 ${
              flashed
                ? "font-medium text-brand-ink"
                : on
                  ? "font-medium text-roster-ink"
                  : "font-normal text-roster-off"
            }`}
          >
            {agent.label.toLowerCase()}
          </span>
        </button>

        <span className="flex flex-none items-center gap-2 pr-1">
          <ModelWord agentId={agent.id} model={model} on={on} />
          <EffortMeter agentId={agent.id} effort={effort} on={on} />
          <ScopeWord agentId={agent.id} scope={scope} on={on} />
        </span>
      </div>

      {skills.map((skill) => (
        <SkillRow
          key={skill.id}
          skill={skill}
          agentOn={on}
          agentId={agent.id}
          onShowUses={onShowUses}
          onHideUses={onHideUses}
        />
      ))}

      {on && skills.length === 0 && (
        <p className="pl-[0.5625rem] text-10 font-normal text-roster-empty">
          no skills — base agent
        </p>
      )}
    </div>
  )
}

// The right column: every sub-agent there is, grouped under stacking sticky
// domain bands, with each agent's assignments inline. Everything is derived
// from `assignments` + `agents` — the panel stores nothing but hover geometry.
export function RosterPanel({ config }: { config: ConfigSelection }) {
  const collapsed = useUiStore((state) => state.rosterCollapsed)
  const toggleRosterDomain = useUiStore((state) => state.toggleRosterDomain)
  const flashedAgentIds = useUiStore((state) => state.flashedAgentIds)
  const setDialog = useUiStore((state) => state.setDialog)
  const saveStack = useSavedStackStore((state) => state.save)

  const asideRef = useRef<HTMLElement>(null)
  const [tip, setTip] = useState<UseTip | null>(null)

  const groups = selectRosterGroups(config)
  const stats = summarize(config)
  const { state: shareState, share } = useShareLink(config)
  const flashed = new Set(flashedAgentIds)

  // The tooltip's position was measured against a scroll state that no longer
  // holds — any scroll while it is open dismisses it. Capture phase, because
  // the roster's own scroller does not bubble.
  useEffect(() => {
    if (!tip) return

    const close = () => setTip(null)
    window.addEventListener("scroll", close, { capture: true, passive: true })
    return () => window.removeEventListener("scroll", close, { capture: true })
  }, [tip])

  const showUses = (
    anchor: HTMLElement,
    skill: RosterSkillRow,
    fromAgentId: string
  ) => {
    const rows = toTipRows(skill.usedBy, fromAgentId)

    setTip({
      rows,
      ...placeTip(
        anchor.getBoundingClientRect(),
        asideRef.current?.getBoundingClientRect(),
        estimateTipHeight(rows)
      ),
    })
  }

  return (
    <aside
      ref={asideRef}
      className="sticky top-0 flex h-svh flex-col overflow-hidden border-l border-divider pt-gutter pr-2.5 pb-6"
    >
      {tip && <WhereUsedTip tip={tip} />}

      <div className="rail-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-2">
        <div className="flex items-center gap-2 pr-0.5 pb-3 pl-4 font-mono text-10 font-medium tracking-[.14em] text-muted-foreground uppercase">
          Sub-agents
        </div>

        {groups.map((group, index) => {
          const shut = collapsed[group.domainId] ?? false

          return (
            // `display: contents` is doing real work here, not tidying.
            // `position: sticky` is confined to its containing block, so while
            // this <section> generated a box each band could only stay pinned
            // while its own group was on screen: the previous domain vanished
            // the moment the next one pinned, and since band N pins at N ×
            // band-height, the strip above it was left uncovered with rows
            // scrolling through the gap — which reads as the band sitting
            // *under* the content. One cause, both symptoms.
            //
            // Removing the box makes the scroll container their shared
            // containing block, so they stack. The element stays because it is
            // what groups a band with its agents in the DOM.
            <section className="contents" key={group.domainId}>
              {/* 26px unfilled band, hairline top and bottom, pinned at
                  index × 26px so collapsed headers stack flush. */}
              <button
                type="button"
                aria-expanded={!shut}
                onClick={() => {
                  // Collapsing can take the tooltip's anchor with it.
                  setTip(null)
                  toggleRosterDomain(group.domainId)
                }}
                style={{ top: `${index * BAND_REM}rem` }}
                className="sticky z-[5] flex h-[1.625rem] w-full cursor-pointer items-center border-y border-roster-band bg-page pl-[1.0625rem] text-left whitespace-nowrap"
              >
                <span className="font-mono text-7_5 font-semibold tracking-[.12em] text-ink-3 uppercase">
                  {group.label.toLowerCase()}
                </span>
                {/* Never changes on hover — the tooltip answers usage. */}
                <span className="ml-auto font-mono text-7_5 font-medium tracking-[.06em] text-roster-off">
                  {group.onCount} of {group.agents.length}
                </span>
              </button>

              {/* Spacing lives on the body and goes with it, so shut headers
                  butt together at exactly one band each. */}
              {!shut && (
                <div className="pt-2 pb-4 pl-[1.0625rem]">
                  {group.agents.map((row) => (
                    <AgentBlock
                      key={row.agent.id}
                      row={row}
                      flashed={flashed.has(row.agent.id)}
                      onShowUses={(event, skill) =>
                        showUses(event, skill, row.agent.id)
                      }
                      onHideUses={() => setTip(null)}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <div className="flex-none border-t border-divider pt-3.5 pr-0.5 pl-4">
        {/* Snapshots the selection into the stack grid, where it becomes a
            starting point like any stack. Its label never moves: the grid cell
            appearing is the feedback, and a button that renames itself cannot
            be clicked twice in a row. Nothing to snapshot without skills, the
            same rule Share follows. */}
        <Button
          className="mb-2 w-full"
          disabled={stats.skillCount === 0}
          onClick={() => saveStack(toSeedPayload(config))}
        >
          Save
        </Button>
        {/* Copies a `?fromId=` link; the button itself is the only feedback
            surface, so its label narrates the outcome and decays to idle. */}
        <Button
          className="mb-2 w-full"
          disabled={shareState === "sharing" || stats.skillCount === 0}
          onClick={() => void share()}
        >
          {SHARE_LABELS[shareState]}
        </Button>
        <Button variant="full" onClick={() => setDialog("install")}>
          Install{" "}
          <span className="pl-1 font-normal tracking-[.06em] text-faint">
            {stats.agentCount}{" "}
            {stats.agentCount === 1 ? "sub-agent" : "sub-agents"} and{" "}
            {stats.skillCount} {stats.skillCount === 1 ? "skill" : "skills"}
          </span>
        </Button>
      </div>
    </aside>
  )
}
