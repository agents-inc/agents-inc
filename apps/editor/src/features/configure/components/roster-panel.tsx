import { DOMAIN_LABELS, type SubAgent } from "@workspace/matrix"
import { Button } from "@workspace/ui/components/button"
import { Hinge } from "@workspace/ui/components/divider"
import { Glyph } from "@workspace/ui/components/glyph"
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@workspace/ui/components/menu"
import { moveToAdjacentRadio } from "@workspace/ui/lib/radio-row"
import { cn } from "@workspace/ui/lib/utils"
import { useEffect, useRef, useState, type CSSProperties } from "react"

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
  type AgentOptions,
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

// What would install, under the Install button's own name. `agents · skills`
// rather than the sentence it used to be: the button shares its footer with a
// row of three now, and the design sets the pair as a stat line rather than
// prose — the middot is what keeps two counts legible in a 300px panel that
// narrows to 250px.
const installLabel = ({ agentCount, skillCount }: ConfigSummary) =>
  `${agentCount} ${agentCount === 1 ? "agent" : "agents"} · ` +
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
  // Reachable from this button and from no other, because Save is the one door
  // `blocked` deliberately does not close: an unwritable configuration has to
  // be storable while it is being repaired (EDITOR-08). Signed out that is a
  // local slot and still works; signed in the same payload is minted through
  // the store, which will not hold a configuration nobody can install.
  unwritable: { label: "Scope conflict — fix marked rows", decays: false },
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
// between an `i` and a `!`. Both are members of the shared set now, named for
// what they SAY rather than for the shape, because saying it is the only thing
// that separates them. The set is what makes them the same drawing: they were
// two hand-rolled SVGs at round caps until 2026-09-05, and nothing held them to
// each other or to the ＋ two rows up.
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
      <Glyph name="warning" size={12} />
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

/**
 * THE THREE SETTINGS AN AGENT CARRIES, AS ONE DESCRIPTION RATHER THAN THREE
 * COMPONENTS.
 *
 * They were three words that each cycled independently until the 2026-09-06
 * refresh — so effort's five steps were invisible until you had clicked past
 * four, which is the hidden-alternative pattern the whole refresh removes. They
 * are one panel now, and a panel drawing three columns wants one list.
 *
 * The order is the order the row draws them in, and the closed row and the open
 * panel both derive their grid from it — see `OPTION_TRACKS`.
 */
const AGENT_OPTION_FIELDS = [
  { field: "model", values: AGENT_MODELS },
  { field: "effort", values: AGENT_EFFORTS },
  { field: "scope", values: AGENT_SCOPES },
] as const satisfies readonly {
  field: keyof AgentOptions
  values: readonly string[]
}[]

type AgentOptionField = (typeof AGENT_OPTION_FIELDS)[number]["field"]

// Capitalised for the accessible name only — `Model for web-developer: sonnet`.
// The visible word is the value and is never the name, because it changes.
const FIELD_NAMES: Record<AgentOptionField, string> = {
  model: "Model",
  effort: "Effort",
  scope: "Scope",
}

/**
 * ALIGNMENT IS STRUCTURAL RATHER THAN TUNED, and this is the whole mechanism:
 * the closed row and the open panel declare THE SAME three tracks, so a panel
 * header cannot drift from the word it covers. Per-column padding was the
 * design's first attempt and every column was off.
 *
 * As CSS variables rather than a class string because the dividers are
 * positioned in the column gaps and their offsets have to be ARITHMETIC on
 * these numbers. Written out at either end, the two would agree until the first
 * time one was edited.
 *
 * THE WIDTHS ARE THIS APP'S, NOT THE DESIGN FILE'S. The design sizes them to
 * `sonnet` / `low` / `project` (35 / 23 / 40px) against a prototype offering
 * three models and four efforts. `persisted-schema.ts` offers four and five,
 * and the longest words are `sonnet`, `medium` and `project` — 6, 6 and 7
 * characters. IBM Plex Mono's advance is 0.6em and the row is `text-9_5`
 * (0.59375rem), so a character is 0.35625rem: 2.25rem clears six and 2.625rem
 * clears seven. Copying the design's numbers would clip `medium` by a third.
 */
const OPTION_VARS: CSSProperties & Record<`--${string}`, string> = {
  "--c1": "2.25rem",
  "--c2": "2.25rem",
  "--c3": "2.625rem",
  "--cg": "0.625rem",
  // The panel's own left padding, which every divider offset starts from.
  "--op": "0.5625rem",
  // How far the panel bleeds past the block's right edge, and the row's own
  // right padding. BOTH are in the panel's right padding, and that is the whole
  // reason they are named: the bleed is what gives the field a flush edge
  // against the roster's clip, and `--rp` is what the closed row holds its
  // words off that edge by — so a panel padded by the bleed alone lands its
  // headers exactly `--rp` to the right of the words they cover. Measured at
  // 4.38px of drift before this was written down.
  "--bleed": "0.875rem",
  "--rp": "0.25rem",
}

const OPTION_TRACKS =
  "grid grid-cols-[var(--c1)_var(--c2)_var(--c3)] gap-x-[var(--cg)]"

// A divider sits in a column GAP rather than on a column edge: `border-left` on
// a track adds 1px inside it and pushes every option out of line with its own
// header, which is the defect the design names.
const DIVIDER = "absolute top-[1.625rem] bottom-2 w-px bg-hairline content-['']"

/**
 * One of the three words on the closed row. It STATES a value and OPENS the
 * panel; it no longer changes anything by itself.
 *
 * Its accessible name carries the value, because the visible word is the value
 * and a screen reader given `sonnet, button` has been told nothing about what
 * the button is for.
 */
function AgentOptionWord({
  agentId,
  field,
  value,
  on,
  open,
  onOpen,
  className,
}: {
  agentId: string
  field: AgentOptionField
  value: string
  on: boolean
  open: boolean
  onOpen: () => void
  className?: string | undefined
}) {
  return (
    <button
      type="button"
      aria-label={`${FIELD_NAMES[field]} for ${agentId}: ${value}`}
      aria-expanded={open}
      onClick={onOpen}
      className={cn(
        "cursor-pointer text-left font-mono text-9_5 font-medium",
        on ? "text-matrix-ink hover:text-ink-primary" : "text-roster-off",
        className
      )}
    >
      {value}
    </button>
  )
}

/**
 * ONE PANEL FOR ALL THREE SETTINGS, opened by any of the three words.
 *
 * Every column sits directly under the word it belongs to, which is the reason
 * a per-word popover was rejected: three open states, and the rightmost of them
 * opened off the panel entirely.
 *
 * THE HEADERS ARE THE WORDS, AND THEY CLOSE WHAT THEY OPENED. The trigger row
 * behind this is hidden rather than removed, so each header lands exactly on
 * the word it replaces — the same pixel closes the panel that opened it. It
 * also means the two never both reach the accessibility tree: `visibility:
 * hidden` takes the trigger out of it, so a locator asking for
 * `Model for X: sonnet` finds whichever of the pair is currently on screen.
 *
 * A column is a `radiogroup`: five efforts of which one is on is one choice
 * with five options, and only the role says so.
 */
function AgentOptionsPanel({
  agentId,
  options,
  onClose,
  onPick,
}: {
  agentId: string
  options: AgentOptions
  onClose: () => void
  onPick: (patch: Partial<AgentOptions>) => void
}) {
  return (
    <div
      data-slot="agent-options"
      // Bleeds past the panel's right edge and is clipped by the roster's own
      // overflow, which is what gives it a flush edge there.
      className={`absolute -top-[0.1875rem] right-[calc(var(--bleed)*-1)] z-[130] ${OPTION_TRACKS} bg-tip-field pt-[0.3125rem] pr-[calc(var(--bleed)+var(--rp))] pb-2 pl-[var(--op)]`}
    >
      <span
        aria-hidden
        className={`${DIVIDER} left-[calc(var(--op)+var(--c1)+var(--cg)/2)]`}
      />
      <span
        aria-hidden
        className={`${DIVIDER} left-[calc(var(--op)+var(--c1)+var(--cg)+var(--c2)+var(--cg)/2)]`}
      />

      {AGENT_OPTION_FIELDS.map(({ field }) => (
        <button
          key={field}
          type="button"
          aria-label={`${FIELD_NAMES[field]} for ${agentId}: ${options[field]}`}
          aria-expanded
          onClick={onClose}
          className="cursor-pointer pb-1.5 text-left font-mono text-9_5 font-medium whitespace-nowrap text-matrix-ink hover:text-ink-primary"
        >
          {options[field]}
        </button>
      ))}

      {AGENT_OPTION_FIELDS.map(({ field, values }) => (
        <div
          key={field}
          role="radiogroup"
          aria-label={`${FIELD_NAMES[field]} for ${agentId}`}
          onKeyDown={moveToAdjacentRadio}
          className="flex flex-col gap-px"
        >
          {values.map((value) => {
            const current = options[field] === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={current}
                tabIndex={current ? 0 : -1}
                onClick={() => onPick({ [field]: value })}
                className={`cursor-pointer text-left font-mono text-9_5 leading-[1.6] font-medium whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  current
                    ? "text-brand-ink"
                    : "text-matrix-ink hover:text-ink-primary"
                }`}
              >
                {value}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// THE AGENT ROW'S ONE BOX, WORN TWO WAYS.
//
// The two axes are deliberately different mechanisms. SIDEWAYS is a padding
// with an equal negative margin and a width that adds both back, so the content
// box is exactly 100% and the 4px bleed is only enough for a tint to clear the
// ink. VERTICALLY it is a margin, and that is the whole difference between a
// tint that reads as this row and one that reads as this row's block: a
// background paints under its own padding, so 2px of `py` here put the fill
// hard against the skill row beneath and against the agent above, and the three
// touching fills closed into one field. A margin is outside the box, so the
// same 2px is air the fill never reaches — and the ink does not move either
// way, because a margin displaces the whole box rather than the content inside
// it.
//
// THE PULSE AND THE HOVER PAINT THE SAME BOX, and that is the whole of this
// constant. They were two geometries until 2026-09-06: a pulsing row bled 17px
// left to the panel's border and 8px right into the scroller's padding, and
// grew 4px taller — a box wider and taller than anything else on the row ever
// paints, which read as the agent's whole BLOCK having been tinted rather than
// its name row. The row the pointer highlights is the row the assignment
// reached, so it is one box and the state changes only the fill.
//
// It also retires a live hazard rather than only a wrong drawing: two boxes
// meant the row grew as the pulse landed, and the growth was cancelled by hand
// with matched margins. Nothing cancels now because nothing grows.
const AGENT_ROW = "-mx-1 my-0.5 w-[calc(100%+0.5rem)] px-1"

function AgentBlock({
  row,
  domainPrefix,
  flashed,
  optionsOpen,
  onToggleOptions,
  onCloseOptions,
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
  /** Whether THIS agent's options panel is the one open. At most one is. */
  optionsOpen: boolean
  onToggleOptions: () => void
  onCloseOptions: () => void
  onShowUses: (anchor: HTMLElement, skill: RosterSkillRow) => void
  onHideUses: () => void
}) {
  const toggleAgentPin = useConfigStore((state) => state.toggleAgentPin)
  const setAgentOption = useConfigStore((state) => state.setAgentOption)
  const { agent, on, model, effort, scope, skills } = row
  const options = { model, effort, scope }

  // Picking closes. The value is the whole reason the panel opened, so leaving
  // it up afterwards would ask for a second dismissal for nothing — and one
  // panel at a time means the next word to be pressed opens its own.
  const pick = (patch: Partial<AgentOptions>) => {
    setAgentOption(agent.id, patch)
    onCloseOptions()
  }

  return (
    // The block is agent row + its skill rows, which is the unit the quiet
    // detail reveals over: pointing at one row answers for the whole agent,
    // and the next agent stays quiet.
    //
    // `relative` IS LOAD-BEARING: it is what the options panel resolves
    // against. Without it the panel anchors to the roster and lands in a
    // different place on every row.
    <div className="group/agent relative pb-2" style={OPTION_VARS}>
      {/* The name row, and the box the assignment pulse paints.

          THE TINT IS THE WHOLE ROW AND NOTHING BUT THE ROW. It sat on the pin
          button once, which is `flex-1` and stops where the three words begin —
          so a pulse said "these skills reached this agent" while leaving the
          agent's own model, effort and scope outside the thing being pointed
          at. Then it overshot the other way, bleeding out to the panel's border
          and down past the row's own edges, which read as the whole block. It
          is the row, drawn exactly as the pointer draws it.

          A COLOUR CHANGE AND NOTHING ELSE, which is what lets 250ms be the
          whole treatment: one geometry means the ink is in the same place
          pulsing and at rest without anything being cancelled to keep it there.

          Hover lives on the same element and LOSES to the pulse — an agent the
          selection just reached is a fact about what happened, and the pointer
          happening to be over it does not change it. So the two fills are
          exclusive rather than layered.

          The three controls are siblings of the pin, never children of it:
          nested they would each swallow the click that pins and bury their own
          values inside the pin's accessible name. */}
      <div
        data-slot="agent-row"
        className={`${AGENT_ROW} flex items-baseline transition-colors duration-[250ms] ${
          flashed ? "bg-flash" : "hover:bg-roster-hover"
        }`}
      >
        {/* State is colour only — no checkbox, no bracket. Click pins the
            agent to the opposite of what it currently derives to. */}
        <button
          type="button"
          aria-pressed={on}
          onClick={() => toggleAgentPin(agent.id)}
          className="min-w-0 flex-1 cursor-pointer text-left"
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

        {/* THE SAME THREE TRACKS THE PANEL DECLARES, which is what keeps a
            header from drifting off the word it covers.

            HIDDEN RATHER THAN REMOVED while the panel is up: the row has to go
            on occupying its box or the panel's headers would land somewhere the
            words never were, and the whole roster would reflow as one opened.
            It also takes the three triggers out of the accessibility tree for
            exactly as long as the headers are in it, so the pair is never both
            reachable under one name. */}
        <span
          className={`${OPTION_TRACKS} ml-auto flex-none items-baseline pr-[var(--rp)] ${
            optionsOpen ? "invisible" : ""
          }`}
        >
          {AGENT_OPTION_FIELDS.map(({ field }) => (
            <AgentOptionWord
              key={field}
              agentId={agent.id}
              field={field}
              value={options[field]}
              on={on}
              open={optionsOpen}
              onOpen={onToggleOptions}
              // Effort is the one that goes amber, and amber means "not the
              // default" rather than "active" everywhere in this design. Its
              // resting value is resolved rather than compared to a literal, so
              // the day the CLI puts an effort on agent metadata this becomes
              // per-role with no edit here.
              className={
                field === "effort" &&
                on &&
                effort !== restingAgentOptions(agent.id).effort
                  ? "text-brand-ink hover:text-brand-ink"
                  : undefined
              }
            />
          ))}
        </span>
      </div>

      {optionsOpen && (
        <AgentOptionsPanel
          agentId={agent.id}
          options={options}
          onClose={onCloseOptions}
          onPick={pick}
        />
      )}

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

// How the panel is banded, as the word itself plus the set's chevron — the
// same idiom the three agent-row words use, except that at two values a menu is
// what the design draws rather than a cycle.
//
// The accessible name is the ACTION, not the value: the visible text is
// `domain`, which says nothing about what pressing it would do, and it changes
// the moment it is used.
function GroupControl({ onPick }: { onPick: () => void }) {
  const rosterGroupBy = useUiStore((state) => state.rosterGroupBy)
  const setRosterGroupBy = useUiStore((state) => state.setRosterGroupBy)

  const pick = (groupBy: RosterGroupBy) => {
    setRosterGroupBy(groupBy)
    onPick()
  }

  return (
    <Menu>
      {/* AN AMBER FIELD BLED TO THE PANEL'S INSET, the same treatment the
          rail's active nav item wears and for the same reason: amber marks
          what the user deliberately chose, and the grouping is a choice sitting
          on a rule with no other ink on it.

          The negative margin CANCELS the padding, so the field paints larger
          without moving a single neighbour — the label to its left and the rule
          to its right are exactly where they were, which is what keeps the
          panel's one flush edge and its never-collapsing rule intact. Only the
          INNER side is padded; the outer side runs to the panel's own inset. */}
      <MenuTrigger
        aria-label={`Group sub-agents by ${rosterGroupBy}`}
        className="-my-[0.1875rem] -mr-2.5 flex shrink-0 cursor-pointer items-center gap-1 bg-wash py-[0.1875rem] pr-2.5 pl-2 font-mono text-9_5 font-normal tracking-[.02em] whitespace-nowrap text-brand-ink normal-case hover:text-brand-hover"
      >
        {rosterGroupBy}
        {/* One step lighter than the word, so the caret reads as furniture on a
            field rather than a second piece of ink on it. */}
        <Glyph name="chevronDown" size={10} className="text-brand-dim" />
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

// The third cell of the action row, and the way into the output preview.
//
// It was a full-width recessed field reading `Preview generated code` until the
// refreshed design put Save, Share and Preview on one row of equal outlined
// cells. The half of that field's reasoning that survives is its POSITION —
// "above the Install button reads as a step before it; below reads as an aside.
// I prefer above — you preview, then you install" — and its place in the tab
// order between Share and Install. The half that goes is the recessed
// treatment: three filled cells over Install would make Install the fourth
// thing on the row rather than the panel's one filled element.
//
// The words the shortened label drops are not lost — "generated" was carrying
// the claim that the files do not exist yet, and it says so in the `title`.
function PreviewEntryPoint({ disabled }: { disabled: boolean }) {
  const setDialog = useUiStore((state) => state.setDialog)

  return (
    <Button
      variant="action"
      disabled={disabled}
      title="Preview generated code"
      onClick={() => setDialog("output")}
    >
      {/* The row's one piece of colour, and it keeps it under the pointer: the
          design gives the cell a hover border and a hover label, and no hover
          rule for the glyph. */}
      <Glyph name="code" className="text-brand" />
      <span className="min-w-0 truncate">Preview</span>
    </Button>
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
  // ONE OPEN PANEL FOR THE WHOLE ROSTER rather than one per agent. Held here
  // because that is the only place that can promise it: three words on one row
  // used to carry three independent open states, and the design replaced them
  // with one per agent — held per row, "one at a time" would be a rule every
  // row kept about itself and none of them kept about each other.
  const [optionsFor, setOptionsFor] = useState<string | null>(null)
  // The same dismissal the skill options panel keeps, and for the same reasons:
  // `pointerdown` rather than `click`, so the panel is gone before the press
  // resolves — otherwise a press on another agent's word would close this one
  // and the click would then reopen it. Presses INSIDE the roster are left
  // alone, because a press on a word or an option is already handled by the
  // control it landed on.
  useEffect(() => {
    if (optionsFor === null) return

    const onPointerDown = (event: PointerEvent) => {
      if (!asideRef.current?.contains(event.target as Node)) {
        setOptionsFor(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOptionsFor(null)
    }

    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [optionsFor])

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
                data-slot="roster-band"
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
                      optionsOpen={optionsFor === row.agent.id}
                      onToggleOptions={() =>
                        setOptionsFor(
                          optionsFor === row.agent.id ? null : row.agent.id
                        )
                      }
                      onCloseOptions={() => setOptionsFor(null)}
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
        {/* THREE EQUAL CELLS IN ONE ROW, over the panel's one filled element.
            They were three full-width stacked buttons, which spent four rows of
            a 300px panel on secondary actions and put two outlines directly
            over a fill.

            DOM ORDER IS LOAD-BEARING: Save, Share, Preview, then Install. It is
            the tab order the design put them in, and the output preview's own
            keyboard test tabs from Share and expects Preview next.

            Each label is truncated inside its own third: two of the three
            NARRATE — Share says what happened to the link, Save says what
            happened to the snapshot — and those sentences are far longer than a
            third of 300px. Clipping the words is right where wrapping them
            would move Install. */}
        <div className="mb-[0.5625rem] flex gap-[0.5625rem]">
          {/* Snapshots the selection into the stack grid, where it becomes a
              starting point like any stack. Its label moves only when nothing
              arrived in the grid: a cell appearing is the feedback on the way
              that works, and a refusal produces no cell to read. Nothing to
              snapshot without skills, the same rule Share follows. */}
          <Button
            variant="action"
            title="Save this configuration"
            disabled={stats.skillCount === 0 || saving}
            onClick={() => void save()}
          >
            <span className="min-w-0 truncate">
              {narration?.label ?? "Save"}
            </span>
          </Button>
          {/* Copies a `?fromId=` link. The button is the only feedback surface
              the panel has, so the words belong to whichever ending happened —
              `useShareLink` owns one narration per ending and this renders it. A
              table here could only key off the coarse state, which is how four
              endings came to share the word "failed" and how the one that a
              reload fixes came to vanish after two seconds (SERVER-04). */}
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
