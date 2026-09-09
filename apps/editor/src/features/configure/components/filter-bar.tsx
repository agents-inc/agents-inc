import { useNavigate } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Glyph } from "@workspace/ui/components/glyph"
import { Input } from "@workspace/ui/components/input"
import { useRef } from "react"

import type { DomainTab } from "@/features/configure/lib/derive"
import { useActiveDomain } from "@/features/configure/lib/use-active-domain"
import {
  scrollToDomain,
  useDomainOnArrival,
} from "@/features/configure/lib/use-domain-scroll"
import {
  useBarStuckAttribute,
  usePinned,
  usePinnedAttribute,
} from "@/features/configure/lib/use-pinned"
import type { ConfigureSearch } from "@/routes/search"
import { useUiStore } from "@/stores/ui-store"
import { DomainTabs } from "./domain-tabs"

/**
 * TWO ROWS THAT STICK AS ONE UNIT: the search band, and the domain strip.
 *
 * ONLY THE BAND GOES DARK. The strip below it stays on the column colour once
 * the bar pins, and that dark/light edge is what separates the two rows —
 * there is no divider under the search field, and adding one is how the pair
 * stops reading as one control.
 *
 * The field holds SEARCH AND NOTHING ELSE. Domain chips lived inside its border
 * for most of this design's life and never read as domains there; they are the
 * strip now. The `selected` filter and the clear control were briefly on the
 * strip's far end and are gone from this file entirely: `selected` is a
 * section-level control and sits on the skills hinge above, and clearing lives
 * on the first stack cell, which already means "nothing selected". Nothing
 * shares the strip's row with the domains, which is what lets the strip be
 * equal cells spanning the column.
 */
export function FilterBar({
  search,
  tabs,
  renderedDomains,
}: {
  search: ConfigureSearch
  tabs: DomainTab[]
  /** The domain ids drawn in the column right now, in order. */
  renderedDomains: readonly string[]
}) {
  const navigate = useNavigate({ from: "/" })
  const setDialog = useUiStore((state) => state.setDialog)

  const wrapRef = useRef<HTMLDivElement>(null)

  // A filter change is a router navigation, which resets scroll by default.
  // `replace` for the query only, so typing does not fill the history stack.
  //
  // `resetScroll: false` protects a scroll the app MADE as well as one it
  // inherited, now that a domain pick jumps the page and then records itself
  // here: without it the router would slam the reader back to the top of the
  // catalogue a moment after landing them on the section they asked for.
  const update = (patch: Partial<ConfigureSearch>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...patch }),
      resetScroll: false,
      replace: "q" in patch,
    })

  // Local, not a store field: the strip and the sticky treatment follow this
  // from a root attribute in CSS, and sharing it re-rendered all 240 cells on
  // every flip.
  const stuck = usePinned(wrapRef)
  useBarStuckAttribute(stuck)

  // The same fact on the bar itself, for the one part of the treatment a
  // MEASUREMENT depends on: the band's height. `scrollToDomain` republishes it
  // mid-jump, which React state cannot be made to do from inside an effect.
  usePinnedAttribute(wrapRef)

  // Pinning changes how the bar looks and never where the caret is. It used to
  // take focus into the search field on the transition — but focus can cause
  // the scroll, so a Tab to anything below the fold stuck the bar and then had
  // its own focus taken, throwing a keyboard user back to the top of the page
  // by the act of moving down it.

  // THE PAGE OWNS THE ACTIVE TAB, at every scroll position and with no
  // exception for a pick (EDITOR-79). A pick used to short-circuit this, back
  // when it narrowed the column to one domain and the strip had to say which;
  // it is a jump down the page now, so the tab it lights is the tab the page
  // lights when it lands. The fallback is the first tab, which is what the
  // column is showing before anything has scrolled anywhere.
  const scrolledDomain = useActiveDomain(wrapRef, renderedDomains)
  const activeDomain = scrolledDomain ?? tabs[0]?.id ?? null

  // And the address's own half: `?domain=api` opens at the API section.
  useDomainOnArrival(wrapRef, search.domain, renderedDomains)

  // Two acts in one click, and the scroll is the one that matters. The URL
  // records where you were sent so the address stays shareable — it is an
  // ANCHOR rather than a cursor, so scrolling away afterwards leaves it alone
  // rather than rewriting it on every section the page passes.
  const pick = (domainId: DomainTab["id"]) => {
    scrollToDomain(wrapRef.current, domainId)
    update({ domain: domainId })
  }

  return (
    <div
      ref={wrapRef}
      data-slot="filter-bar"
      // A COLUMN so the band's bottom margin ADDS to the strip's top margin.
      // As block siblings the two collapse to the larger, which silently takes
      // 10px out of the 22px between them.
      className="group/bar sticky top-0 z-60 -mx-gutter flex flex-col bg-column"
    >
      <div
        data-slot="filter-band"
        // Horizontal padding only. Collapsing the design's 60px top padding
        // removes 78px of page height exactly as the bar pins, and scroll
        // anchoring then un-pins it — measured oscillating at scrollY 590/511.
        // The air above comes from the preceding hinge's margin instead.
        //
        // The air below is a MARGIN, and it has to be: a background paints
        // under its own padding, so held inside this box it went dark with the
        // band and ran the black on past the field's foot.
        //
        // 84a: once stuck, only the colour bleeds. ONLY THE LEFT GUTTER MOVES,
        // and it moves onto the field, so the whole of the search box out to the
        // bleed edge takes the caret while the text still starts on the content
        // edge.
        //
        // THE RIGHT GUTTER STAYS HERE, because a background paints under its own
        // padding: #242320 reaches the edge whatever this side is set to.
        // Collapsing it and re-homing it inside the block as `pr-gutter` bought
        // nothing on this side and walked the block's box out to that edge with
        // the fill.
        // `relative` and the height are BOTH here because the field is
        // absolute once stuck: it is this box the field is pinned to, and this
        // box is the only thing left holding the band open.
        className={`relative mb-3 pr-gutter transition-[padding,background-color] duration-150 group-data-pinned/bar:h-20 ${
          stuck ? "bg-ink pl-0" : "pl-gutter"
        }`}
      >
        {/* The gap is constant. Snapping the add button sideways at the same
            instant the bar is already changing width and losing its border
            would be three simultaneous shifts, which read as a jump. Holding
            it costs nothing and the transition stays calm. */}
        <div className="flex h-full items-stretch justify-end gap-2.5">
          <div
            data-slot="search-field"
            // THE BOX ONLY. Border and fill, no padding of its own: the whole
            // of the area inside this border is the field, so every pixel of it
            // takes the caret. The padding this used to hold sat between the
            // border and the input and belonged to neither, which left the
            // field a strip in the middle of its own box and the ring around it
            // dead to a click.
            //
            // The box itself goes on the band once stuck — border and fill both
            // — leaving the search text sitting straight on the dark.
            //
            // AND ONCE STUCK IT IS THE WHOLE BAND: absolute against the band's
            // padding box, so it reaches both bleed edges and the full 80px
            // rather than the row's share of them. The add block stays in the
            // flow beside it and is `relative` for that reason — an absolute
            // sibling paints over a flex item, and the block has to take its own
            // presses back. `items-stretch` is the last piece: centred, the
            // input would be a 55px strip inside an 80px box, which is the dead
            // ring above.
            //
            // On `data-pinned` rather than on `stuck` with the colours, because
            // `scrollToDomain` measures the bar between its two landings and a
            // geometry waiting on a React render is not there yet.
            className={`flex min-w-0 flex-1 items-stretch border group-data-pinned/bar:absolute group-data-pinned/bar:inset-0 ${
              stuck
                ? "border-transparent bg-transparent"
                : "border-field-border bg-cell"
            }`}
          >
            <Input
              onDark={stuck}
              // Equal vertical padding in both states, and it no longer sets
              // the height — the field's box does, and a stretched input
              // centres its value in whatever box it is given. The horizontal
              // half is what the pin swaps, and it animates on the band's own
              // 150ms or the pieces arrive at different times. The height does
              // not animate: it moves the whole page under the bar, and sliding
              // that draws the catalogue moving rather than the bar arriving.
              className={`py-[0.9375rem] transition-[padding] duration-150 ${
                stuck ? "pr-0 pl-gutter" : "px-[0.9375rem]"
              }`}
              value={search.q}
              placeholder="search skills"
              aria-label="Search skills"
              onChange={(event) => update({ q: event.target.value })}
            />
          </div>

          <Button
            variant="block"
            onDark={stuck}
            // The glyph's 8px is the design's `.bigadd .ig{margin-right:8px}`,
            // held as the row's gap because the mark is a flex item here rather
            // than a text glyph inheriting the label's own spacing — which is
            // the whole reason it stopped being `＋`.
            className="relative gap-2"
            // NO PADDING OF ITS OWN IN EITHER STATE, and so nothing here to
            // animate on the band's 150ms: the block's box is identical pinned
            // and at rest, and only its fill and hairline change. The gutter is
            // air BESIDE it and belongs to the band; held here as `pr-gutter` it
            // was padding INSIDE it, which walked the box out to the bleed edge
            // and left the label adrift in a strip 48px wider than itself.
            onClick={() => setDialog("add")}
          >
            <Glyph name="plus" />
            Add skill
          </Button>
        </div>
      </div>

      <DomainTabs
        tabs={tabs}
        activeDomain={activeDomain}
        // Unconditional, with no release arm: there is nothing to release when
        // a pick hides nothing, and clicking the tab you are on is a reader
        // asking to be taken back to the top of the section they are reading.
        onPick={pick}
      />
    </div>
  )
}
