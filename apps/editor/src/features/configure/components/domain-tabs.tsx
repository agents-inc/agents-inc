import type { DomainTab } from "@/features/configure/lib/derive"
import { useWideViewport } from "@/lib/viewport"

/**
 * THE DOMAIN TITLES, AS ONE FULL-BLEED STRIP OF CONTENT-SIZED CELLS.
 *
 * `flex: 1 1 auto` on every cell is the whole layout, and the `auto` basis is
 * the part that carries it: each cell starts at the width of its own label and
 * the slack left over is shared out equally, so `Desktop` gets the room its
 * name needs and `AI` never holds a track three times what it can fill.
 * Nothing can overflow at any width either — the labels clip to an ellipsis
 * before the row does — which is what the two drawings before this could not
 * promise: variable-width tabs overflowed the column on a wide catalogue, and
 * the scrolling group that replaced them hid tabs behind an edge.
 *
 * `flex: 1 1 0` was the drawing in between, and it is the one this replaces:
 * equal cells could not overflow either, but they spent the same width on every
 * name and so pushed the long ones through their own ellipsis while the short
 * ones sat in empty tracks.
 *
 * THE INDEX AND THE COUNT ARE THE WIDE VIEWPORT'S ALONE. Below the threshold in
 * `lib/viewport.ts` a cell carries its label and nothing else — nine domains
 * each holding three pieces of text is what pushes the labels back through the
 * ellipsis the `auto` basis exists to avoid, and the two dropped are decoration
 * on a control whose name is the domain.
 *
 * LABELS HOLD ONE SIZE AT ALL TIMES. The active label used to jump to 600 25px
 * Inter, which reflowed the column on every selection — the strip grew taller,
 * the sections under it moved, and the scroll spy then decided a different
 * domain was current. Only the index's opacity and the count's colour move now,
 * and both ease over 240ms because neither changes anything's box.
 *
 * Three details that are load-bearing, all for the same reason — the rule under
 * the strip must never move:
 *
 *  · wherever the index is drawn it occupies its slot AT ALL TIMES, at zero
 *    opacity when it is not showing, so selection never shifts a cell's
 *    contents sideways. The narrow strip omits it outright rather than hiding
 *    it, so there is no slot for selection to move either;
 *  · each cell draws its OWN baseline as an inset shadow. There is no rule
 *    across the container, and that is what lets hover darken one segment;
 *  · the active cell's 2px amber baseline REPLACES the 1px hairline rather than
 *    being drawn over it, because a `box-shadow` utility cannot be overridden
 *    by a later one in the same class string.
 *
 * ONE CLAIM: THIS IS THE DOMAIN YOU ARE LOOKING AT. A pick is a jump down the
 * page rather than a filter (EDITOR-79), so there is no filter to announce and
 * nothing for a pressed state to be true of — `aria-current` carries it, the
 * same shape `skill-contents-dialog.tsx` uses for the same reason.
 */

// The cell's baseline in each state. Written out rather than composed for the
// reason above: the last `box-shadow` in the stylesheet wins, not the last one
// in this string, so the on-state has to restate the whole declaration.
const CELL_RULE = "shadow-[inset_0_-1px_0_var(--color-hairline)]"
const CELL_RULE_HOVER =
  "hover:shadow-[inset_0_-1px_0_var(--color-field-border)]"
const CELL_RULE_ACTIVE =
  "data-active:shadow-[inset_0_-2px_0_var(--color-brand)] data-active:hover:shadow-[inset_0_-2px_0_var(--color-brand)]"

function DomainTabButton({
  tab,
  active,
  detailed,
  onPick,
}: {
  tab: DomainTab
  active: boolean
  /** Whether the cell carries its index and count as well as its label. */
  detailed: boolean
  onPick: () => void
}) {
  return (
    <button
      type="button"
      aria-current={active}
      // Absent rather than `false`, so `[data-active]` selects it — an
      // attribute set to "false" is still an attribute that is present. The
      // `aria-current` above is the opposite case on purpose: `false` is a
      // documented value there, and a reader is told which tabs are not
      // current by the one that is.
      {...(active && { "data-active": "" })}
      onClick={onPick}
      // THE VERTICAL PADDING IS THE DESIGN'S AND THE HORIZONTAL IS NOT, and the
      // difference is what the two are doing. 12px above and below sets the
      // strip's height, which the sticky jump measures. The design's 15px
      // either side was slack on a 309px cell drawn against three domains; this
      // catalogue has nine, so the cells are a third of that and the same 15px
      // is the thing pushing `Desktop` out through its own ellipsis. The cells
      // are `justify-center`, so on a short label the inset is invisible either
      // way — all it decides is whether a long one survives.
      //
      // `flex-auto` rather than `flex-1`: the basis is the cell's own content,
      // so the width a name needs is the width it gets. See the note above.
      className={`group box-border flex min-w-0 flex-auto cursor-pointer items-center justify-center gap-1.5 px-1 py-3 whitespace-nowrap outline-none focus-visible:ring-1 focus-visible:ring-ring ${CELL_RULE} ${CELL_RULE_HOVER} ${CELL_RULE_ACTIVE}`}
    >
      {/* The index and the count are decoration on a control whose name is the
          domain: nine repetitions of a two-digit number in front of nine
          domains is what an accessible name carrying them sounds like. Which is
          also why dropping them on a narrow strip costs a reader nothing — the
          name is unchanged either way. */}
      {detailed && (
        <span
          aria-hidden="true"
          className="inline-block flex-none font-mono text-9 leading-none font-medium text-tab-index opacity-0 transition-opacity duration-[240ms] ease-in group-hover:opacity-45 group-data-active:text-brand group-data-active:opacity-100"
        >
          {tab.index}
        </span>
      )}
      <span className="overflow-hidden font-mono text-11 leading-none font-semibold tracking-[.12em] text-ellipsis text-muted-foreground uppercase group-hover:text-track-ink group-data-active:text-ink-primary">
        {tab.label}
      </span>
      {detailed && (
        <span
          aria-hidden="true"
          className="flex-none font-mono text-9 leading-none font-normal text-muted-foreground transition-colors duration-[240ms] ease-in group-data-active:text-brand-ink"
        >
          {tab.skillCount}
        </span>
      )}
    </button>
  )
}

/**
 * The strip: every domain, spanning the column, and nothing else on the row.
 *
 * `selected` and the clear control used to sit at its far end and are gone from
 * here — both were rejected by name. `selected` is a section-level control and
 * lives on the skills hinge's rule now; clearing lives on the first stack cell,
 * which already means "nothing selected". What is left is one kind of thing
 * across the whole row, which is why it can be one shared flex line at all.
 *
 * The viewport is asked ONCE, here, rather than by each cell: every tab is
 * drawn the same way, and nine subscriptions to one media query is nine
 * answers that can only ever agree.
 */
export function DomainTabs({
  tabs,
  activeDomain,
  onPick,
}: {
  tabs: DomainTab[]
  /** Which cell reads as current — whatever the page has scrolled past. A bare
   *  string because it is only ever compared. */
  activeDomain: string | null
  onPick: (domainId: DomainTab["id"]) => void
}) {
  const detailed = useWideViewport()

  return (
    <div
      role="group"
      aria-label="Domains"
      // The strip's cells run to the column's content edge on both sides, so
      // the first and last baselines end exactly where the skill grid does.
      //
      // ITS HEIGHT IS THE SAME PINNED AND AT REST, and that is a contract
      // rather than a coincidence: `scrollToDomain` measures the bar ONCE and
      // scrolls by that measurement, so a bar that grew as it pinned would land
      // every jumped-to section under itself by the difference. The design adds
      // 12px of top padding here when the bar sticks, and it needs to — its own
      // band drops from 72px of vertical padding to 36px as it goes dark, so
      // the dark row's bottom edge would otherwise sit on these baselines. This
      // band keeps its 12px throughout (collapsing the design's 60px top
      // padding at the moment of pinning removed 78px of page height and set
      // the bar oscillating), so the air is already there and adding more would
      // buy a mis-landed jump for nothing.
      className="mt-2.5 flex items-stretch px-gutter"
    >
      {tabs.map((tab) => (
        <DomainTabButton
          key={tab.id}
          tab={tab}
          active={tab.id === activeDomain}
          detailed={detailed}
          onPick={() => onPick(tab.id)}
        />
      ))}
    </div>
  )
}
