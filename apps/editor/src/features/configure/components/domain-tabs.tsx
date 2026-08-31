import { Chip, chipVariants } from "@workspace/ui/components/chip"
import { useEffect, useRef } from "react"

import type { DomainTab } from "@/features/configure/lib/derive"

/**
 * THE DOMAIN TITLES, RENDERED SIDE BY SIDE AS TABS.
 *
 * Each domain used to carry a 25px heading in the column, pinning under the
 * filter bar as you reached it. Now every title is on screen at once and the
 * one you are looking at is the one set in 25px Inter — the others are 10.5px
 * mono labels beside it. The type size is the ONLY thing that changes, and it
 * changes instantly: only the index's opacity and the count's rise are
 * animated, because a 10.5px label growing to 25px over 240ms reads as the page
 * loading rather than as a selection.
 *
 * TWO CLAIMS, NOT ONE. A tab is `aria-pressed` while the column is FILTERED to
 * its domain, and `data-active` whenever it is the domain on screen — which
 * includes every scroll position, where nothing is filtered at all. Collapsing
 * them would have the strip announce a filter nobody applied on every scroll.
 *
 * Three details that are load-bearing, all for the same reason — the rule under
 * the strip must never move:
 *
 *  · every tab is a FIXED 36px box, bottom-aligned, with `leading-none` on each
 *    child. `items-baseline` was the original and is what made the strip grow
 *    taller when the active label jumped to 25px: the larger descender pushed
 *    the box down.
 *  · the index occupies its 17px slot AT ALL TIMES, at zero opacity when it is
 *    not showing, so selection never shifts the strip sideways.
 *  · each tab draws its OWN underline. There is no rule across the container at
 *    rest — that only arrives when the bar sticks, where the strip needs an
 *    edge against the dark band above it.
 *
 * THE STRIP IS THE HALF THAT GIVES. Nine domains plus `23 skills selected ✕`
 * plus `selected` is wider than a 1600px window's main column, and the design
 * was drawn against three — so something has to absorb the difference, and it
 * cannot be the filters: they sit ON the content edge, and letting them move is
 * how a sticky row at `z-60` ends up painted over the roster panel, which is
 * exactly what it did. So the tabs scroll and the filters hold.
 */

// U+2715 MULTIPLICATION X, the design's own glyph on the clear control — not
// U+00D7 and not the letter. `aria-hidden`, because the button's accessible
// name already says what it does and "multiplication x" is not it.
const CLEAR_MARK = "✕"

// The tab's underline in each state. Written out rather than composed, because
// a `box-shadow` utility cannot be overridden by a later one in the same class
// string — the last one wins by cascade order in the stylesheet, not by
// position here — so the on-state has to be a variant of the whole declaration.
const TAB_RULE = "shadow-[inset_0_-1px_0_var(--color-hairline)]"
const TAB_RULE_HOVER = "hover:shadow-[inset_0_-1px_0_var(--color-field-border)]"
const TAB_RULE_ACTIVE =
  "data-active:shadow-[inset_0_-2px_0_var(--color-brand)] data-active:hover:shadow-[inset_0_-2px_0_var(--color-brand)]"

// Stuck, the tabs absorb the strip's top padding so the active tab's field runs
// the strip's full height and meets the dark band with no gap.
const TAB_STUCK =
  "[html[data-bar-stuck]_&]:h-[3.125rem] [html[data-bar-stuck]_&]:pt-3.5 [html[data-bar-stuck]_&]:data-active:bg-tab-field"

function DomainTabButton({
  tab,
  active,
  picked,
  onPick,
  ref,
}: {
  tab: DomainTab
  active: boolean
  picked: boolean
  onPick: () => void
  // `null` rather than absent, because `exactOptionalPropertyTypes` is on and
  // a ref slot that may hold nothing has to say so in its type.
  ref: React.Ref<HTMLButtonElement> | null
}) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={picked}
      // Absent rather than `false`, so `[data-active]` selects it — an
      // attribute set to "false" is still an attribute that is present.
      {...(active && { "data-active": "" })}
      onClick={onPick}
      className={`group box-border flex h-9 shrink-0 cursor-pointer items-end px-2.5 pb-[0.5625rem] whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-ring ${TAB_RULE} ${TAB_RULE_HOVER} ${TAB_RULE_ACTIVE} ${TAB_STUCK}`}
    >
      {/* The index and the count are decoration on a control whose name is the
          domain: nine repetitions of a two-digit number in front of nine
          domains is what an accessible name carrying them sounds like. */}
      <span
        aria-hidden="true"
        className="inline-block w-[1.0625rem] shrink-0 font-mono text-11 leading-none font-medium text-brand-ink opacity-0 transition-opacity duration-[240ms] ease-in group-hover:opacity-45 group-data-active:opacity-100"
      >
        {tab.index}
      </span>
      <span className="font-mono text-10_5 leading-none font-semibold tracking-[.14em] text-tab-label uppercase group-hover:text-matrix-ink group-data-active:font-heading group-data-active:text-25 group-data-active:tracking-[-.015em] group-data-active:text-ink-primary group-data-active:normal-case">
        {tab.label}
      </span>
      <span
        aria-hidden="true"
        className="ml-1.5 font-mono text-8 leading-none font-normal text-tab-count transition-[transform,color] duration-[240ms] ease-in group-data-active:-translate-y-[0.8125rem] group-data-active:text-brand-ink"
      >
        {tab.skillCount}
      </span>
    </button>
  )
}

/**
 * `N skills selected ✕` — how much is chosen, and the one door back to nothing.
 *
 * `chipVariants` rather than `Chip`, and the distinction is the semantics
 * rather than the look: `Chip` publishes `aria-pressed`, and this is an action
 * that happens once rather than a state you are in.
 */
function ClearSelection({
  count,
  onClear,
}: {
  count: number
  onClear: () => void
}) {
  return (
    <button
      type="button"
      // The COUNT is in the visible label and out of the name, so a spec — and
      // a screen reader — meets one stable control rather than a differently
      // named one after every click in the grid.
      aria-label="Clear all selected skills"
      onClick={onClear}
      className={chipVariants({
        className:
          "flex items-center gap-[0.4375rem] py-[0.375rem] pr-[0.4375rem] pl-[0.5625rem] outline-none focus-visible:ring-1 focus-visible:ring-ring",
      })}
    >
      {count === 1 ? "1 skill selected" : `${count} skills selected`}
      <span
        aria-hidden="true"
        className="px-px font-mono text-11 leading-none font-normal text-faint"
      >
        {CLEAR_MARK}
      </span>
    </button>
  )
}

/**
 * The strip: every domain, then the selection filters at the content edge.
 *
 * The filters keep their RESTING treatment when the bar sticks — they live
 * here, and this row stays on the column colour while the band above it goes
 * dark. Copying the band's chip rules onto them was a real bug: #8f8b7d on
 * #fdfdfc is 3.35:1 and the borders disappeared.
 */
/**
 * Keeps the current tab inside the strip's own scroll box.
 *
 * `scrollLeft` set directly rather than `scrollIntoView`, and the difference is
 * load-bearing: `scrollIntoView` walks every scrollable ancestor, and the
 * ancestor here is the PAGE — whose scroll position is what decides which tab
 * is current in the first place. Nudging it from inside this effect is a
 * feedback loop with the scroll sync. This touches one number on one element.
 */
function useTabInView(activeDomain: string | null) {
  // Both refs are the hook's OWN rather than parameters. Passing them in reads
  // the same and is refused: writing through a ref a hook was handed is
  // modifying a caller's value, which the compiler's immutability rule catches
  // — and it is right to, because the caller then owns a scroll position two
  // places can move.
  const strip = useRef<HTMLDivElement>(null)
  const tab = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const box = strip.current
    const current = tab.current
    if (!box || !current) return

    const left = current.offsetLeft
    const right = left + current.offsetWidth
    if (left < box.scrollLeft) box.scrollLeft = left
    else if (right > box.scrollLeft + box.clientWidth)
      box.scrollLeft = right - box.clientWidth
  }, [activeDomain])

  return { strip, tab }
}

export function DomainTabs({
  tabs,
  activeDomain,
  pickedDomain,
  selectedCount,
  selectedOnly,
  onPick,
  onToggleSelectedOnly,
  onClear,
}: {
  tabs: DomainTab[]
  /** Which tab reads as current — a pick, or whatever the page has scrolled
   *  past. A bare string because it is only ever compared. */
  activeDomain: string | null
  pickedDomain: DomainTab["id"] | null
  selectedCount: number
  selectedOnly: boolean
  onPick: (domainId: DomainTab["id"]) => void
  onToggleSelectedOnly: () => void
  onClear: () => void
}) {
  const { strip: stripRef, tab: activeRef } = useTabInView(activeDomain)

  return (
    <div className="flex items-end gap-2.5 px-gutter pt-3.5 [html[data-bar-stuck]_&]:pt-0 [html[data-bar-stuck]_&]:shadow-[inset_0_-1px_0_var(--color-hairline)]">
      {/* Grouped, because the row's other end holds controls that are not
          domains — a locator that could match either could not say which one
          it found, and neither can a screen reader.

          The scrollbar is hidden rather than absent: the strip only overflows
          on a wide catalogue with a wide clear control, the current tab is kept
          in view above, and a horizontal bar inside a 36px row would sit on the
          tabs' own underlines — which are the design's whole idiom here. */}
      <div
        ref={stripRef}
        role="group"
        aria-label="Domains"
        className="flex min-w-0 flex-1 [scrollbar-width:none] items-end gap-0.5 overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((tab) => {
          const active = tab.id === activeDomain
          return (
            <DomainTabButton
              key={tab.id}
              ref={active ? activeRef : null}
              tab={tab}
              active={active}
              picked={tab.id === pickedDomain}
              onPick={() => onPick(tab.id)}
            />
          )
        })}
      </div>

      <div className="flex flex-none items-center gap-1.5 pb-[0.5625rem]">
        {/* Absent rather than disabled while nothing is selected: a counter
            reading zero is furniture. */}
        {selectedCount > 0 && (
          <ClearSelection count={selectedCount} onClear={onClear} />
        )}
        <Chip active={selectedOnly} onClick={onToggleSelectedOnly}>
          Selected
        </Chip>
      </div>
    </div>
  )
}
