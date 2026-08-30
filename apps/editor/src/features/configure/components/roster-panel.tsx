import { DOMAIN_LABELS, type SubAgent } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"
import { Hinge } from "@workspace/ui/components/divider"
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@workspace/ui/components/menu"
import { useEffect, useRef, useState } from "react"

import {
  selectRosterGroups,
  summarize,
  type ConfigSummary,
  type RosterAgentRow,
  type RosterSkillRow,
} from "@/features/configure/lib/derive"
import { toSeedPayload } from "@/features/configure/lib/seed"
import { useShareLink } from "@/features/configure/lib/use-share-link"
import type { ConfigSelection } from "@/features/configure/lib/derive"
import { useConfigStore } from "@/stores/config-store"
import {
  AGENT_EFFORTS,
  AGENT_MODELS,
  AGENT_SCOPES,
  ROSTER_GROUP_BYS,
  restingAgentOptions,
  type AgentEffort,
  type AgentModel,
  type AgentScope,
  type RosterGroupBy,
} from "@/stores/persisted-schema"
import { createSharedConfig, type ShareRefusal } from "@/lib/api/configs"
import type { StackRefusal } from "@/lib/api/stacks"
import { useAccountStore } from "@/stores/account-store"
import {
  SAVED_STACK_NAME,
  useSavedStackStore,
} from "@/stores/saved-stack-store"
import { useUiStore } from "@/stores/ui-store"

// What would install, under the Install button's own name.
const installLabel = ({ agentCount, skillCount }: ConfigSummary) =>
  `${agentCount} ${agentCount === 1 ? "sub-agent" : "sub-agents"} and ` +
  `${skillCount} ${skillCount === 1 ? "skill" : "skills"}`

/**
 * Every way a signed-in Save can END, and what the button says about it.
 *
 * A save signed in is two round trips — mint the payload, then store the
 * pointer — so it can be refused for the three reasons a share can be, plus
 * the one a share cannot have: the session lapsing between the click and the
 * write. Signed out it is a write to localStorage and cannot fail at all,
 * which is exactly why silence here made one button mean two things.
 *
 * `decays` is the same rule `useShareLink` follows and is not styling: a word
 * that REPORTS is noise once it has been read, and a word that names something
 * to DO has to still be there when the person looks up from doing it.
 *
 * The words are this button's own rather than `SHARE_NARRATIONS`'s, because
 * two of the four differ — "Saving failed" is not "Sharing failed", and no
 * share ending is a lapsed session.
 */
type SaveRefusal = ShareRefusal | StackRefusal

type SaveNarration = { label: string; decays: boolean }

const SAVE_NARRATIONS = {
  "out-of-date": { label: "Out of date — reload", decays: false },
  refused: { label: "Saving failed", decays: true },
  unreachable: { label: "Offline — try again", decays: true },
  "signed-out": { label: "Signed out — sign in", decays: false },
} as const satisfies Record<SaveRefusal, SaveNarration>

const SAVE_RESET_DELAY_MS = 2_000

// And what is stopping it instead. The number IS the number of clicks left:
// each of these sub-agents is one scope word away from resolving.
//
// On the button rather than behind a tooltip, and that is deliberate — a
// disabled button suppresses pointer events, so a `title` on one never opens.
// The reason has to be readable without asking for it.
const blockedLabel = (count: number) =>
  count === 1
    ? "1 sub-agent needs project scope"
    : `${count} sub-agents need project scope`

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

// Nothing on the right edge of a skill row may compete with the effort word
// above it, so both of them wait to be asked for: revealed while the pointer is
// anywhere over the agent block, or while focus is inside it — the keyboard
// half, without which the load word could be tabbed to but never read.
//
// Opacity, not display: the words hold their place in the layout, or every row
// beneath one would move the moment the pointer arrived.
const QUIET_AT_REST =
  "opacity-0 transition-opacity duration-[120ms] group-hover/agent:opacity-100 group-focus-within/agent:opacity-100"

// The marker on a row whose two scopes cannot meet.
//
// A real `<button>` rather than a hinted span, for the reason the options
// panel's info glyph is one: a hinted span is pointer-only, and a button is
// what makes the explanation reachable by keyboard. Its accessible name IS the
// explanation, so hovering and tabbing answer the same question.
//
// The glyph is that info glyph with the stem and the dot swapped — the same
// circle, the same 12px, the same stroke — which is the whole difference
// between an `i` and a `!`. The design ships no icon set beyond the GitHub
// mark, so drawing it here is what the panel already does.
//
// `destructive` is the one colour in the tokens that is neither the reserved
// amber (which means "the user chose this") nor the roster's off-grey (which
// means "this is not happening"). The design has never drawn an error state at
// all — EDITOR-07 lists them among the surfaces that have never been designed —
// so this is the smallest honest choice rather than a settled one.
function ScopeErrorMark({ reason }: { reason: string }) {
  return (
    <button
      type="button"
      aria-label={reason}
      title={reason}
      // No handler at all: asking what is wrong with a row is not asking to
      // switch it off, and catching the press is enough to say so — the row's
      // own toggle is a sibling beneath this rather than an ancestor above it.
      className="pointer-events-auto ml-1 inline-flex shrink-0 cursor-help align-[-0.125rem] text-destructive outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        <path d="M12 7v5.5" />
        <path d="M12 16.3v.1" />
      </svg>
    </button>
  )
}

// One assignment line: bullet · name · load word · where-used. A 4-track grid
// so the bullet occupies the first track and every skill name shares the
// agents' flush left edge — indentation by structure, not padding.
//
// The whole line toggles the assignment, through a button stretched over it
// rather than through the line itself: the line also holds the load word, the
// where-used count and the scope marker, and a control that contains controls
// hides every one of them from a screen reader (`nested-interactive`). Same
// division as a skill cell, and `LatticeCellButton` carries the reasoning.
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
  // A scope error is neither: the row is live, it is just not installable yet,
  // so it keeps its amber and gains a marker rather than going quiet.
  const live = agentOn && skill.enabled

  return (
    <div className="relative -mx-1 grid w-[calc(100%+0.5rem)] cursor-pointer grid-cols-[1rem_minmax(0,1fr)_1.875rem_1.625rem] items-center px-1 py-0.5 hover:bg-skill-hover">
      <button
        type="button"
        aria-pressed={skill.enabled}
        aria-label={`${skill.displayName} on ${agentId}`}
        onClick={() => toggleAssignmentEnabled(skill.id, agentId)}
        className="absolute inset-0 z-0 cursor-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <span
        aria-hidden
        className={`relative z-1 mx-0.5 block size-[0.3125rem] ${
          live
            ? "bg-brand"
            : "bg-transparent shadow-[inset_0_0_0_1px_var(--color-hairline)]"
        }`}
      />
      <span className="pointer-events-none relative z-1 flex min-w-0 items-center">
        <span
          className={`truncate text-10_5 leading-[1.35] font-normal ${
            live ? "text-brand" : "text-roster-off"
          }`}
        >
          {skill.displayName}
        </span>
        {skill.scopeError !== undefined && (
          <ScopeErrorMark reason={skill.scopeError} />
        )}
      </span>
      {/* `pre` / `lazy` — never "preloaded" — and never amber: that is
          reserved for the name's on-state. One grey for both words, since the
          distinction they used to draw competes with the effort word directly
          above them. Click flips this agent's copy. */}
      <button
        type="button"
        aria-label={`Load mode: ${skill.load}`}
        onClick={() => flipAssignmentLoad(skill.id, agentId)}
        className={`relative z-1 cursor-pointer pr-1.5 text-right font-mono text-8 font-medium tracking-[.06em] text-roster-off uppercase hover:text-ink-primary ${QUIET_AT_REST}`}
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
          className={`relative z-1 mr-0.5 flex size-[0.8125rem] cursor-help items-center justify-center justify-self-end font-mono text-7_5 font-medium text-use-ink hover:bg-wash hover:text-brand-ink ${QUIET_AT_REST}`}
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
        on ? "text-matrix-ink hover:text-ink-primary" : "text-roster-off"
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
        on ? "text-matrix-ink hover:text-ink-primary" : "text-roster-off"
      }`}
    >
      {scope}
    </button>
  )
}

// How much thinking the agent is given, as the word itself — the same shape
// the model word takes, and for the same reason. It was five drawn squares
// until the word replaced them; the design had already built and rejected a
// meter ("max effort was unreadable"), and a drawn value says itself only to a
// screen reader.
//
// The floor is `medium` at six characters — IBM Plex Mono's advance is 0.6em,
// so 6 × 0.6 × 9.5px = 34.2px and 36px clears it. Right-aligned against it so
// the row does not jitter as the word cycles.
const EFFORT_WORD_WIDTH = "min-w-[2.25rem] text-right"

function EffortWord({
  agentId,
  effort,
  on,
}: {
  agentId: string
  effort: AgentEffort
  on: boolean
}) {
  const setAgentOption = useConfigStore((state) => state.setAgentOption)
  // Written through the resolver rather than against the literal `"medium"`.
  // There is no per-role effort default yet — `persisted-schema.ts` says so —
  // so the two read identically today, and the day the CLI puts an effort on
  // agent metadata this line becomes per-role with no edit here.
  //
  // Computed here rather than added to `RosterAgentRow`: the resolver is
  // already exported and pure, and a boolean only one word needs would
  // otherwise touch every spec under the derive layer's two roster blocks.
  const isDefault = effort === restingAgentOptions(agentId).effort

  return (
    <button
      type="button"
      aria-label={`Effort for ${agentId}: ${effort}`}
      onClick={() =>
        setAgentOption(agentId, { effort: nextInCycle(AGENT_EFFORTS, effort) })
      }
      // Amber has no hover step, deliberately: amber means "the user chose
      // this", so nothing the pointer does may mask it. The design's own
      // cascade darkens it by accident; here the arm simply carries no hover.
      className={`cursor-pointer font-mono text-9_5 font-medium ${EFFORT_WORD_WIDTH} ${
        on
          ? isDefault
            ? "text-matrix-ink hover:text-ink-primary"
            : "text-brand-ink"
          : "text-roster-off"
      }`}
    >
      {effort}
    </button>
  )
}

function AgentBlock({
  row,
  domainPrefix,
  flashed,
  onShowUses,
  onHideUses,
}: {
  row: RosterAgentRow
  // Scope mode only: the band names a destination rather than a domain, so
  // the row has to name its own. `null` in domain mode, where the band
  // already said it. NOT `aria-hidden` — it is part of the agent's name here,
  // and a screen reader hearing a bare `developer` under `~/.claude · global`
  // has been told less than the screen shows.
  domainPrefix: string | null
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
                  ? "font-medium text-ink-primary"
                  : "font-normal text-roster-off"
            }`}
          >
            {domainPrefix !== null && (
              // One colour for the whole name row when the agent is off. The
              // prototype recedes the role to #b4b0a2 but targets the prefix
              // separately and never overrides it, so on a disabled agent the
              // "muted" prefix renders DARKER than the role it prefixes.
              // Inverted, and corrected here: off, the prefix takes no class
              // of its own and inherits the role's one grey.
              <span className={on ? "font-normal text-faint" : undefined}>
                {domainPrefix}
              </span>
            )}
            {agent.label.toLowerCase()}
          </span>
        </button>

        <span className="flex flex-none items-center gap-2 pr-1">
          <ModelWord agentId={agent.id} model={model} on={on} />
          <EffortWord agentId={agent.id} effort={effort} on={on} />
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

// How the panel is banded, as the word itself plus U+25BE — the same idiom
// the three agent-row words use, except that at two values a menu is what the
// design draws rather than a cycle.
//
// The accessible name is the ACTION, not the value: the visible text is
// `domain ▾`, which says nothing about what pressing it would do, and it
// changes the moment it is used.
function GroupControl({ onPick }: { onPick: () => void }) {
  const rosterGroupBy = useUiStore((state) => state.rosterGroupBy)
  const setRosterGroupBy = useUiStore((state) => state.setRosterGroupBy)

  const pick = (groupBy: RosterGroupBy) => {
    setRosterGroupBy(groupBy)
    onPick()
  }

  return (
    <Menu>
      {/* The design gives this control neither a hover nor an open state —
          both its rules restate the resting colour, which leaves it the one
          interactive element in the panel with no state at all. It gets the
          hover step every other word here has. */}
      <MenuTrigger
        aria-label={`Group sub-agents by ${rosterGroupBy}`}
        className="shrink-0 cursor-pointer font-mono text-9_5 font-normal tracking-[.02em] whitespace-nowrap text-ink normal-case hover:text-ink-primary"
      >
        {rosterGroupBy} ▾
      </MenuTrigger>
      <MenuPopup>
        <MenuRadioGroup value={rosterGroupBy} onValueChange={pick}>
          {ROSTER_GROUP_BYS.map((groupBy) => (
            <MenuRadioItem key={groupBy} value={groupBy}>
              {groupBy}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  )
}

// The band's own type, which is the only thing that changes with the banding:
// a domain is a short uppercase word and a destination is a path, so lower-
// casing or tracking one out would misread it.
const BAND_LABEL_CLASS = {
  domain: "text-7_5 tracking-[.12em] uppercase",
  scope: "text-8_5 tracking-[.02em] normal-case",
} as const satisfies Record<RosterGroupBy, string>

// The way into the output preview, and the panel's one recessed field.
//
// A real `<button>` rather than the prototype's `div` with an `onClick`: it
// sits between Share and Install in the tab order, which is where the design
// put it, and a div would have no place in that order at all.
//
// "Generated" is load-bearing in the label — it says the files do not exist
// yet. The glyph is a code-brackets pair at Lucide's geometry, drawn here
// because the design ships no icon set beyond the GitHub mark, and it keeps its
// amber under the pointer: the design gives the block a hover surface and a
// hover label, and no hover rule for the glyph.
function PreviewEntryPoint({ disabled }: { disabled: boolean }) {
  const setDialog = useUiStore((state) => state.setDialog)

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setDialog("output")}
      className="group/preview mb-[0.5625rem] flex w-full cursor-pointer items-center gap-[0.4375rem] bg-track px-3 py-2.5 outline-none hover:bg-track-hover focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-50 disabled:hover:bg-track"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="flex-none text-brand"
      >
        <path d="M16 18l6-6-6-6" />
        <path d="M8 6l-6 6 6 6" />
      </svg>
      <span className="truncate font-mono text-10 font-semibold tracking-[.04em] text-track-ink uppercase group-hover/preview:text-ink-primary">
        Preview generated code
      </span>
    </button>
  )
}

// The right column: every sub-agent there is, grouped under stacking sticky
// bands — by domain, or by the destination each agent writes into — with each
// agent's assignments inline. Everything is derived from `assignments` +
// `agents` — the panel stores nothing but hover geometry.
export function RosterPanel({ config }: { config: ConfigSelection }) {
  const collapsed = useUiStore((state) => state.rosterCollapsed)
  const rosterGroupBy = useUiStore((state) => state.rosterGroupBy)
  const toggleRosterDomain = useUiStore((state) => state.toggleRosterDomain)
  const flashedAgentIds = useUiStore((state) => state.flashedAgentIds)
  const setDialog = useUiStore((state) => state.setDialog)
  const saveStack = useSavedStackStore((state) => state.save)
  const account = useAccountStore((state) => state.session)
  const saveToAccount = useAccountStore((state) => state.save)

  const [refusal, setRefusal] = useState<SaveRefusal | null>(null)
  const narration = refusal === null ? null : SAVE_NARRATIONS[refusal]

  // Signed out, the local slot, unchanged. Signed in, the SAME payload is
  // minted through the very call a share link makes and what is stored against
  // the account is the id it came back with — a name and a pointer, no
  // configuration bytes. That is why saving and sharing can never restore
  // different things: it is one serialization and now one route as well.
  //
  // A refused mint leaves the account untouched rather than saving a name
  // pointing at nothing — and says so on the button, because a cell appearing
  // is the only feedback this button has and a refusal produces no cell.
  // Signed in, a save is TWO round trips — mint the payload, then store the
  // pointer — and the button stays live through both unless something stops
  // it. A second click during the mint stores a second KV entry and a second
  // row for one press, which is the same question the composer answered by
  // disabling Send: a round trip is a state the control is IN, not an instant
  // it passes through. Answered the same way here.
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const payload = toSeedPayload(config)
    if (!account) {
      saveStack(payload)
      return
    }
    if (saving) return

    // Cleared before the attempt rather than after it, so a second click on a
    // failure that ends the same way restarts the decay instead of inheriting
    // the first one's timer — setting a state to the value it already holds
    // re-renders nothing, and the words would vanish mid-attempt.
    setRefusal(null)
    setSaving(true)

    try {
      const minted = await createSharedConfig(payload)
      if (!minted.ok) return setRefusal(minted.refusal)

      const saved = await saveToAccount(SAVED_STACK_NAME, minted.id)
      if (!saved.ok) setRefusal(saved.refusal)
    } finally {
      setSaving(false)
    }
  }

  const asideRef = useRef<HTMLElement>(null)
  const [tip, setTip] = useState<UseTip | null>(null)

  const groups = selectRosterGroups(config, rosterGroupBy)
  const stats = summarize(config)
  const {
    state: shareState,
    label: shareLabel,
    share,
    blocked,
  } = useShareLink(config)
  const flashed = new Set(flashedAgentIds)

  // The endings that report rather than instruct clear themselves. The
  // narration is a member of the table above, so this re-runs when the ending
  // changes and not on every render.
  useEffect(() => {
    if (!narration?.decays) return

    const timer = setTimeout(() => setRefusal(null), SAVE_RESET_DELAY_MS)
    return () => clearTimeout(timer)
  }, [narration])

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
        {/* The main column's section rule, stubless: the panel has no gutter
            to bleed into, and a stub would push the header's first ink 76px in
            while every row beneath it is locked to the 17px flush edge. */}
        <Hinge
          variant="panel"
          label="Sub-agents grouped by"
          control={<GroupControl onPick={() => setTip(null)} />}
        />

        {groups.map((group, index) => {
          const shut = collapsed[group.key] ?? false

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
            <section className="contents" key={group.key}>
              {/* 26px unfilled band, hairline top and bottom, pinned at
                  index × 26px so collapsed headers stack flush. */}
              <button
                type="button"
                aria-expanded={!shut}
                onClick={() => {
                  // Collapsing can take the tooltip's anchor with it.
                  setTip(null)
                  toggleRosterDomain(group.key)
                }}
                style={{ top: `${index * BAND_REM}rem` }}
                className="sticky z-[5] flex h-[1.625rem] w-full cursor-pointer items-center border-y border-roster-band bg-page pl-[1.0625rem] text-left whitespace-nowrap"
              >
                <span
                  className={`font-mono font-semibold text-ink-3 ${BAND_LABEL_CLASS[rosterGroupBy]}`}
                >
                  {rosterGroupBy === "scope"
                    ? group.label
                    : group.label.toLowerCase()}
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
                      domainPrefix={
                        rosterGroupBy === "scope"
                          ? `${DOMAIN_LABELS[row.agent.domainId].toLowerCase()} · `
                          : null
                      }
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
            starting point like any stack. Its label moves only when nothing
            arrived in the grid: a cell appearing is the feedback on the way
            that works, and a refusal produces no cell to read. Nothing to
            snapshot without skills, the same rule Share follows. */}
        <Button
          className="mb-2 w-full"
          disabled={stats.skillCount === 0 || saving}
          onClick={() => void save()}
        >
          {narration?.label ?? "Save"}
        </Button>
        {/* Copies a `?fromId=` link. The button is the only feedback surface
            the panel has, so the words belong to whichever ending happened —
            `useShareLink` owns one narration per ending and this renders it. A
            table here could only key off the coarse state, which is how four
            endings came to share the word "failed" and how the one that a
            reload fixes came to vanish after two seconds (SERVER-04). */}
        <Button
          className="mb-2 w-full"
          disabled={
            shareState === "sharing" || stats.skillCount === 0 || blocked
          }
          onClick={() => void share()}
        >
          {shareLabel}
        </Button>
        {/* Above Install and below Share, which is the design's own reason:
            "above the Install button reads as a step before it; below reads as
            an aside. I prefer above — you preview, then you install."

            A recessed field rather than a fourth outline or a second fill:
            Install is the panel's only filled element and the panel has no
            borders to spend, so this is the segmented track's colour used
            inverted. Disabled with nothing selected, the same rule Save and
            Share follow and for the same reason — nothing to write.

            No count beside the label, deliberately: at 250px the label is all
            that fits, and the dialog's own footer states the file count. */}
        <PreviewEntryPoint disabled={stats.skillCount === 0} />
        {/* One rule, both doors (EDITOR-08). A project skill on a sub-agent
            resting at global is a pair `init --from` THROWS on, so a link
            minted from here would fail on the recipient — which is worse than
            no link. The button says how many sub-agents are left to move rather
            than how much would install, because a disabled button suppresses
            pointer events and a tooltip on one never opens. */}
        <Button
          variant="full"
          disabled={blocked}
          onClick={() => setDialog("install")}
        >
          Install{" "}
          <span className="pl-1 font-normal tracking-[.06em] text-faint">
            {blocked
              ? blockedLabel(stats.unscopedAgentCount)
              : installLabel(stats)}
          </span>
        </Button>
      </div>
    </aside>
  )
}
