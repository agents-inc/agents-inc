import { DOMAIN_LABELS, type SubAgent } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"
import {
  ButtonGroup,
  ButtonGroupItem,
} from "@workspace/ui/components/button-group"
import { Hinge } from "@workspace/ui/components/divider"
import { Glyph } from "@workspace/ui/components/glyph"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useRef, useState } from "react"

import {
  selectInstalledAgents,
  selectRosterGroups,
  selectUnofferedPlacements,
  summarize,
  type ConfigSelection,
  type ConfigSummary,
  type RosterAgentRow,
  type RosterGroup,
  type RosterSkillRow,
} from "@/features/configure/lib/derive"
import {
  compilesAgent,
  leftOutOfCodexReason,
  unofferedPlacementLabel,
} from "@/features/configure/lib/provider"
import { useShareLink } from "@/features/configure/lib/use-share-link"
import { useConfigStore } from "@/stores/config-store"
import { ROSTER_GROUP_BYS, type RosterGroupBy } from "@/stores/persisted-schema"
import { useUiStore } from "@/stores/ui-store"

// The agent count is the provider's, not the configuration's: a Codex install
// drops both summoners, so it is passed in from `selectInstalledAgents`.
const installLabel = (agentCount: number, { skillCount }: ConfigSummary) =>
  `${agentCount} ${agentCount === 1 ? "agent" : "agents"} · ` +
  `${skillCount} ${skillCount === 1 ? "skill" : "skills"}`

// On the button rather than in a tooltip: a disabled button never opens one.
const blockedLabel = (count: number) =>
  count === 1
    ? "1 sub-agent needs project scope"
    : `${count} sub-agents need project scope`

// The scope conflict comes first because it refuses both doors; a placement is
// refused by one provider only.
const installButtonLabel = (
  stats: ConfigSummary,
  installedAgentCount: number,
  blocked: boolean,
  unofferedCount: number
) => {
  if (blocked) return blockedLabel(stats.unscopedAgentCount)
  if (unofferedCount > 0) return unofferedPlacementLabel(unofferedCount)

  return installLabel(installedAgentCount, stats)
}

// Refused, Install is unfilled with a hairline like the cells above it, and its
// reason may wrap under the word.
const REFUSED_INSTALL_CLASS =
  "flex-wrap gap-x-1 border border-divider bg-transparent px-3 text-center whitespace-normal text-track-ink disabled:opacity-100"

const installReasonClass = (refused: boolean) =>
  cn("font-normal tracking-[.06em]", refused ? undefined : "pl-1 text-faint")

const BAND_REM = 1.625

const TIP_ID = "where-used-tip"
const TIP_GAP_PX = 7
const VIEWPORT_MARGIN_PX = 8
// Rows and domain gaps at the 110% root, plus the frame. Only the upward
// clamp reads it.
const TIP_ROW_PX = 15.5
const TIP_DOMAIN_GAP_PX = 7
const TIP_FRAME_PX = 16

// Geometry is measured when the list opens; its rows are derived at render, so
// a press on the row it hangs from updates it in place.
type UseTip = {
  skillId: string
  fromAgentId: string
  right: number
  top: number
}

const tipName = (agent: SubAgent) =>
  `${DOMAIN_LABELS[agent.domainId].toLowerCase()} ${agent.label.toLowerCase()}`

const toTipRows = (usedBy: SubAgent[], fromAgentId: string) =>
  usedBy.map((agent, index) => ({
    agent,
    here: agent.id === fromAgentId,
    newDomain: index > 0 && usedBy[index - 1]?.domainId !== agent.domainId,
  }))

const estimateTipHeight = (rows: ReturnType<typeof toTipRows>) =>
  rows.length * TIP_ROW_PX +
  rows.filter((row) => row.newDomain).length * TIP_DOMAIN_GAP_PX +
  TIP_FRAME_PX

// Pushed up so a list of this height still ends inside the viewport.
const clampTopToViewport = (top: number, height: number) =>
  Math.max(
    VIEWPORT_MARGIN_PX,
    Math.min(top, window.innerHeight - height - VIEWPORT_MARGIN_PX)
  )

// Always left of the rail, level with the row.
const placeTip = (row: DOMRect, rail: DOMRect, height: number) => ({
  right: window.innerWidth - rail.left + TIP_GAP_PX,
  top: clampTopToViewport(row.top - VIEWPORT_MARGIN_PX, height),
})

const usedByOf = (groups: RosterGroup[], skillId: string) =>
  groups
    .flatMap((group) => group.agents)
    .flatMap((row) => row.skills)
    .find((skill) => skill.id === skillId)?.usedBy ?? []

function WhereUsedTip({ tip, usedBy }: { tip: UseTip; usedBy: SubAgent[] }) {
  if (usedBy.length === 0) return null

  return (
    <div
      id={TIP_ID}
      role="tooltip"
      className="fixed z-[120] bg-tip-field px-[0.625rem] py-[0.4375rem]"
      style={{ top: tip.top, right: tip.right }}
    >
      {toTipRows(usedBy, tip.fromAgentId).map(({ agent, here, newDomain }) => (
        <div
          key={agent.id}
          className={cn(
            "flex items-baseline gap-[0.4375rem] py-px whitespace-nowrap",
            newDomain && "mt-1.5"
          )}
        >
          <span
            className={cn(
              "font-mono text-8_5 leading-[1.65] font-normal",
              here ? "text-brand-ink" : "text-matrix-ink"
            )}
          >
            {tipName(agent)}
          </span>
        </div>
      ))}
    </div>
  )
}

// A button so the reason is reachable by keyboard; its name is the reason.
// No handler: the row's toggle is a sibling beneath it, not an ancestor.
function ScopeErrorMark({ reason }: { reason: string }) {
  return (
    <button
      type="button"
      aria-label={reason}
      title={reason}
      className="pointer-events-auto ml-1 inline-flex shrink-0 cursor-help align-[-0.125rem] text-destructive outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Glyph name="warning" size={12} />
    </button>
  )
}

// One assignment line: bullet, name, load word. The toggle is a button
// stretched over the line as its sibling, since a control cannot contain the
// load word and the scope mark (`nested-interactive`).
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
  onShowUses: (row: HTMLElement, skill: RosterSkillRow) => void
  onHideUses: () => void
}) {
  const toggleAssignmentEnabled = useConfigStore(
    (state) => state.toggleAssignmentEnabled
  )
  const flipAssignmentLoad = useConfigStore((state) => state.flipAssignmentLoad)

  // A scope error is neither switch: the row stays live and gains a marker.
  const live = agentOn && skill.enabled

  return (
    <div
      onMouseEnter={(event) => onShowUses(event.currentTarget, skill)}
      onMouseLeave={onHideUses}
      className="relative -mx-1 grid w-[calc(100%+0.5rem)] cursor-pointer grid-cols-[1rem_minmax(0,1fr)_1.875rem] items-center px-1 py-0.5 hover:bg-skill-hover"
    >
      <button
        type="button"
        aria-pressed={skill.enabled}
        aria-label={`${skill.displayName} on ${agentId}`}
        aria-describedby={TIP_ID}
        onClick={() => toggleAssignmentEnabled(skill.id, agentId)}
        onFocus={(event) => onShowUses(event.currentTarget, skill)}
        onBlur={onHideUses}
        className="absolute inset-0 z-0 cursor-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <span
        aria-hidden
        className={cn(
          "relative z-1 mx-0.5 block size-[0.3125rem]",
          live
            ? "bg-brand"
            : "bg-transparent shadow-[inset_0_0_0_1px_var(--color-hairline)]"
        )}
      />
      <span className="pointer-events-none relative z-1 flex min-w-0 items-center">
        <span
          className={cn(
            "truncate text-10_5 leading-[1.35] font-normal",
            live ? "text-brand" : "text-roster-off"
          )}
        >
          {skill.displayName}
        </span>
        {skill.scopeError !== undefined && (
          <ScopeErrorMark reason={skill.scopeError} />
        )}
      </span>
      <button
        type="button"
        aria-label={`Load mode: ${skill.load}`}
        onClick={() => flipAssignmentLoad(skill.id, agentId)}
        className="relative z-1 cursor-pointer pr-1.5 text-right font-mono text-8 font-medium tracking-[.06em] text-roster-off uppercase hover:text-ink-primary"
      >
        {skill.load === "preloaded" ? "pre" : "lazy"}
      </button>
    </div>
  )
}

// Hover and the pulse paint one box, bled sideways by padding against an equal
// negative margin.
const AGENT_ROW = "-mx-1 w-[calc(100%+0.5rem)] px-1 py-0.5"

const agentNameTone = (flashed: boolean, installed: boolean): string => {
  if (flashed) return "font-medium text-brand-ink"
  if (installed) return "font-medium text-ink-primary"
  return "font-normal text-roster-off"
}

function AgentBlock({
  row,
  domainPrefix,
  flashed,
  onShowUses,
  onHideUses,
}: {
  row: RosterAgentRow
  // Scope mode only, where the band names a destination; part of the name.
  domainPrefix: string | null
  flashed: boolean
  onShowUses: (row: HTMLElement, skill: RosterSkillRow) => void
  onHideUses: () => void
}) {
  const toggleAgentPin = useConfigStore((state) => state.toggleAgentPin)
  const provider = useUiStore((state) => state.provider)
  const { agent, on, skills } = row

  // Shown and inert rather than hidden (D18), so the roster and the install
  // agree about what is installed.
  const leftOut = compilesAgent(provider, agent.id)
    ? undefined
    : leftOutOfCodexReason()
  const installed = on && leftOut === undefined

  return (
    <div className="pb-2">
      <div
        data-slot="agent-row"
        className={cn(
          AGENT_ROW,
          "flex items-baseline transition-colors duration-[250ms]",
          flashed ? "bg-flash" : "hover:bg-roster-hover"
        )}
      >
        {/* `aria-disabled` rather than `disabled`, which would suppress the
            pointer events its `title` opens on. */}
        <button
          type="button"
          aria-pressed={installed}
          aria-disabled={leftOut !== undefined || undefined}
          title={leftOut}
          onClick={() => leftOut === undefined && toggleAgentPin(agent.id)}
          // The size on the button, not the span: the button's own strut
          // would otherwise set the line at the body's size.
          className="min-w-0 flex-1 cursor-pointer text-left text-11_5"
        >
          <span className={agentNameTone(flashed, installed)}>
            {domainPrefix !== null && (
              // Off, the prefix inherits the role's grey rather than drawing
              // darker than it.
              <span
                className={installed ? "font-normal text-faint" : undefined}
              >
                {domainPrefix}
              </span>
            )}
            {agent.label.toLowerCase()}
          </span>
        </button>
      </div>

      {skills.map((skill) => (
        <SkillRow
          key={skill.id}
          skill={skill}
          agentOn={installed}
          agentId={agent.id}
          onShowUses={onShowUses}
          onHideUses={onHideUses}
        />
      ))}

      {installed && skills.length === 0 && (
        <p className="pl-[0.5625rem] text-10 font-normal text-roster-empty">
          no skills — base agent
        </p>
      )}
    </div>
  )
}

function GroupByRow({ onPick }: { onPick: () => void }) {
  const rosterGroupBy = useUiStore((state) => state.rosterGroupBy)
  const setRosterGroupBy = useUiStore((state) => state.setRosterGroupBy)

  const pick = (groupBy: RosterGroupBy) => {
    setRosterGroupBy(groupBy)
    onPick()
  }

  return (
    <div className="flex items-center gap-2 pr-0.5 pb-3 pl-[1.0625rem]">
      <span className="font-mono text-8 font-medium tracking-[.12em] text-faint uppercase">
        group by
      </span>
      <ButtonGroup aria-label="Group sub-agents by">
        {ROSTER_GROUP_BYS.map((groupBy) => (
          <ButtonGroupItem
            key={groupBy}
            size="segment"
            preset="rail"
            active={rosterGroupBy === groupBy}
            onClick={() => pick(groupBy)}
          >
            {groupBy}
          </ButtonGroupItem>
        ))}
      </ButtonGroup>
    </div>
  )
}

// A domain is a short uppercase word and a destination is a path, so neither
// takes the other's case or tracking.
const BAND_LABEL_CLASS = {
  domain: "text-7_5 tracking-[.12em] uppercase",
  scope: "text-8_5 tracking-[.02em] normal-case",
} as const satisfies Record<RosterGroupBy, string>

const bandText = (groupBy: RosterGroupBy, label: string) =>
  groupBy === "scope" ? label : label.toLowerCase()

// A scope band names a destination, so the row names its own domain.
const domainPrefixFor = (groupBy: RosterGroupBy, agent: SubAgent) =>
  groupBy === "scope"
    ? `${DOMAIN_LABELS[agent.domainId].toLowerCase()} · `
    : null

// Pinned at one band height per index, so shut bands stack flush.
function RosterBand({
  label,
  index,
  shut,
  groupBy,
  onToggle,
}: {
  label: string
  index: number
  shut: boolean
  groupBy: RosterGroupBy
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      data-slot="roster-band"
      aria-expanded={!shut}
      onClick={onToggle}
      style={{ top: `${index * BAND_REM}rem` }}
      className="group/band sticky z-[5] flex h-[1.625rem] w-full cursor-pointer items-center border-y border-roster-band bg-page pl-[1.0625rem] text-left whitespace-nowrap"
    >
      <span
        className={cn(
          "font-mono font-semibold text-ink-3",
          BAND_LABEL_CLASS[groupBy]
        )}
      >
        {bandText(groupBy, label)}
      </span>
      <Glyph
        name={shut ? "plus" : "minus"}
        size={10}
        className="mr-2 ml-auto text-faint group-hover/band:text-ink"
      />
    </button>
  )
}

function PreviewEntryPoint({ disabled }: { disabled: boolean }) {
  const setDialog = useUiStore((state) => state.setDialog)

  return (
    <Button
      variant="action"
      disabled={disabled}
      title="Preview generated code"
      onClick={() => setDialog("output")}
    >
      <Glyph name="code" className="text-brand" />
      <span className="min-w-0 truncate">Preview</span>
    </Button>
  )
}

// Step 05: every sub-agent under stacking sticky bands, by domain or by the
// destination it writes into, with its assignments inline. Everything is
// derived; the panel stores only the where-used geometry.
export function RosterPanel({ config }: { config: ConfigSelection }) {
  const collapsed = useUiStore((state) => state.rosterCollapsed)
  const rosterGroupBy = useUiStore((state) => state.rosterGroupBy)
  const toggleRosterDomain = useUiStore((state) => state.toggleRosterDomain)
  const flashedAgentIds = useUiStore((state) => state.flashedAgentIds)
  const setDialog = useUiStore((state) => state.setDialog)
  const provider = useUiStore((state) => state.provider)

  const asideRef = useRef<HTMLElement>(null)
  const [tip, setTip] = useState<UseTip | null>(null)

  const groups = selectRosterGroups(config, rosterGroupBy, provider)
  const stats = summarize(config)
  const unofferedCount = selectUnofferedPlacements(config, provider).length
  const installedAgentCount = selectInstalledAgents(config, provider).length
  const {
    state: shareState,
    label: shareLabel,
    share,
    blocked,
  } = useShareLink(config)
  const flashed = new Set(flashedAgentIds)
  const refused = blocked || unofferedCount > 0

  // The geometry no longer holds once anything scrolls. Capture phase, because
  // the rail's own scroller does not bubble.
  useEffect(() => {
    if (!tip) return

    const close = () => setTip(null)
    window.addEventListener("scroll", close, { capture: true, passive: true })
    return () => window.removeEventListener("scroll", close, { capture: true })
  }, [tip])

  const showUses = (
    row: HTMLElement,
    skill: RosterSkillRow,
    fromAgentId: string
  ) => {
    const rail = asideRef.current
    if (!rail || skill.usedBy.length === 0) return

    setTip({
      skillId: skill.id,
      fromAgentId,
      ...placeTip(
        row.getBoundingClientRect(),
        rail.getBoundingClientRect(),
        estimateTipHeight(toTipRows(skill.usedBy, fromAgentId))
      ),
    })
  }

  return (
    <aside
      ref={asideRef}
      className="sticky top-0 flex h-svh flex-col overflow-hidden border-l border-divider pt-gutter pr-2.5 pb-6"
    >
      {tip && <WhereUsedTip tip={tip} usedBy={usedByOf(groups, tip.skillId)} />}

      <div className="rail-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto pr-2">
        <Hinge
          variant="panel"
          index="05"
          label="then"
          emphasis="assign skills"
        />
        <GroupByRow onPick={() => setTip(null)} />

        {groups.map((group, index) => {
          const shut = collapsed[group.key] ?? false

          return (
            // `contents`, so the scroller is every band's containing block and
            // the sticky bands stack instead of replacing each other.
            <section className="contents" key={group.key}>
              <RosterBand
                label={group.label}
                index={index}
                shut={shut}
                groupBy={rosterGroupBy}
                onToggle={() => {
                  setTip(null)
                  toggleRosterDomain(group.key)
                }}
              />

              {/* Spacing lives on the body, so shut bands butt together. */}
              {!shut && (
                <div className="pt-2 pb-4 pl-[1.0625rem]">
                  {group.agents.map((row) => (
                    <AgentBlock
                      key={row.agent.id}
                      row={row}
                      domainPrefix={domainPrefixFor(rosterGroupBy, row.agent)}
                      flashed={flashed.has(row.agent.id)}
                      onShowUses={(anchor, skill) =>
                        showUses(anchor, skill, row.agent.id)
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
        {/* DOM order is the tab order: Save, Share, Preview, then Install. */}
        <div className="mb-[0.5625rem] flex gap-[0.5625rem]">
          <Button
            variant="action"
            title="Save this configuration"
            disabled={stats.skillCount === 0}
            onClick={() => setDialog("save")}
          >
            <span className="min-w-0 truncate">Save</span>
          </Button>
          <Button
            variant="action"
            title="Share this configuration"
            disabled={
              shareState === "sharing" || stats.skillCount === 0 || blocked
            }
            onClick={() => void share()}
          >
            <span className="min-w-0 truncate">{shareLabel}</span>
          </Button>
          <PreviewEntryPoint disabled={stats.skillCount === 0} />
        </div>
        {/* One rule, both doors (EDITOR-08): a link minted over a scope
            conflict would fail on the recipient. */}
        <Button
          variant="full"
          disabled={refused}
          className={refused ? REFUSED_INSTALL_CLASS : undefined}
          onClick={() => setDialog("install")}
        >
          Install{" "}
          <span className={installReasonClass(refused)}>
            {installButtonLabel(
              stats,
              installedAgentCount,
              blocked,
              unofferedCount
            )}
          </span>
        </Button>
      </div>
    </aside>
  )
}
