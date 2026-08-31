import { useNavigate } from "@tanstack/react-router"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { useRef } from "react"

import type { DomainTab } from "@/features/configure/lib/derive"
import { useActiveDomain } from "@/features/configure/lib/use-active-domain"
import {
  useBarStuckAttribute,
  usePinned,
} from "@/features/configure/lib/use-pinned"
import type { ConfigureSearch } from "@/routes/search"
import { useConfigStore } from "@/stores/config-store"
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
 * strip now. The `selected` filter and the clear control went with them, to the
 * far end of the same row — the end whose other side names what they narrow.
 */
export function FilterBar({
  search,
  tabs,
  renderedDomains,
  selectedCount,
}: {
  search: ConfigureSearch
  tabs: DomainTab[]
  /** The domain ids drawn in the column right now, in order. */
  renderedDomains: readonly string[]
  selectedCount: number
}) {
  const navigate = useNavigate({ from: "/" })
  const setDialog = useUiStore((state) => state.setDialog)
  // The one verb that empties a configuration, and it is the store's own rather
  // than a second one written here: clearing is `Start from scratch` reached by
  // a different door, so it drops the stack with the skills — a grid emptied
  // under a page still saying "then customise next.js full-stack" would be
  // telling the visitor they still had a stack.
  const clearSelection = useConfigStore((state) => state.reset)

  const wrapRef = useRef<HTMLDivElement>(null)

  // A filter change is a router navigation, which resets scroll by default.
  // `replace` for the query only, so typing does not fill the history stack.
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

  // Pinning changes how the bar looks and never where the caret is. It used to
  // take focus into the search field on the transition — but focus can cause
  // the scroll, so a Tab to anything below the fold stuck the bar and then had
  // its own focus taken, throwing a keyboard user back to the top of the page
  // by the act of moving down it.

  // Two effects, and the second is half the act rather than a courtesy:
  // clearing every selection while `selected` is still on lands the visitor on
  // an empty column, with the way back being a control they have to notice is
  // still pressed.
  const clearEverything = () => {
    clearSelection()
    update({ sel: false })
  }

  // A pick OWNS the active tab; with nothing picked the strip follows the page.
  // The fallback is the first tab, which is what the column is showing before
  // anything has scrolled anywhere.
  const scrolledDomain = useActiveDomain(wrapRef, renderedDomains)
  const activeDomain = search.domain ?? scrolledDomain ?? tabs[0]?.id ?? null

  return (
    <div
      ref={wrapRef}
      data-slot="filter-bar"
      className="sticky top-0 z-60 -mx-gutter bg-column"
    >
      <div
        data-slot="filter-band"
        // Horizontal padding only. Collapsing the design's 60px top padding
        // removes 78px of page height exactly as the bar pins, and scroll
        // anchoring then un-pins it — measured oscillating at scrollY 590/511.
        // The air above comes from the preceding hinge's margin instead.
        //
        // 84a: once stuck, only the colour bleeds. The gutters move from this
        // band onto the field and the button, which is what lets #242320 reach
        // the viewport edge while search still starts on the content edge and
        // add-skill still ends on it.
        className={`pb-3 transition-[padding,background-color] duration-150 ${
          stuck ? "bg-ink px-0" : "px-gutter"
        }`}
      >
        {/* The gap is constant. Snapping the add button sideways at the same
            instant the bar is already changing width and losing its border
            would be three simultaneous shifts, which read as a jump. Holding
            it costs nothing and the transition stays calm. */}
        <div className="flex items-stretch gap-2.5">
          <div
            data-slot="search-field"
            // Equal vertical padding in both states, for the same reason: any
            // height change here perturbs scroll at the moment of pinning. The
            // box itself goes on the band — border and fill both — leaving the
            // search text sitting straight on the dark.
            className={`flex min-w-0 flex-1 items-center gap-3 border py-[0.9375rem] transition-[padding] duration-150 ${
              stuck
                ? "border-transparent bg-transparent pr-0 pl-gutter"
                : "border-field-border bg-cell px-[0.9375rem]"
            }`}
          >
            <Input
              onDark={stuck}
              value={search.q}
              placeholder="search skills"
              aria-label="Search skills"
              onChange={(event) => update({ q: event.target.value })}
            />
          </div>

          <Button
            variant="block"
            onDark={stuck}
            // Same 150ms as the band, or the pieces arrive at different times.
            className={`transition-[padding] duration-150 ${
              stuck ? "pr-gutter pl-5" : ""
            }`}
            onClick={() => setDialog("add")}
          >
            ＋ Add skill
          </Button>
        </div>
      </div>

      <DomainTabs
        tabs={tabs}
        activeDomain={activeDomain}
        pickedDomain={search.domain}
        selectedCount={selectedCount}
        selectedOnly={search.sel}
        // Picking the domain already picked releases it, which hands the strip
        // back to the scroll sync — and that has to re-derive NOW rather than
        // on the next scroll event, which is what `useActiveDomain` watching
        // the rendered set buys.
        onPick={(domainId) =>
          update({ domain: search.domain === domainId ? null : domainId })
        }
        onToggleSelectedOnly={() => update({ sel: !search.sel })}
        onClear={clearEverything}
      />
    </div>
  )
}
