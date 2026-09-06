import { getRouteApi, useNavigate } from "@tanstack/react-router"
import {
  Hinge,
  HingeButton,
  HingeToggle,
} from "@workspace/ui/components/divider"
import { Glyph } from "@workspace/ui/components/glyph"
import { useMemo } from "react"

import {
  blockedNotice,
  catalogueSkillCount,
  selectDomainTabs,
  selectDomainViews,
  selectedOnlyLabel,
  summarize,
} from "@/features/configure/lib/derive"
import { useCatalogFirst } from "@/features/configure/lib/use-catalog-first"
import { useCatalogStore } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import { useUiStore } from "@/stores/ui-store"
import { AddSkillDialog } from "./add-skill-dialog"
import { Composer } from "./composer"
import { DomainSection } from "./domain-section"
import { FilterBar } from "./filter-bar"
import { InstallDialog } from "./install-dialog"
import { MarketplaceDialog } from "./marketplace-dialog"
import { MarketplaceSwitchDialog } from "./marketplace-switch-dialog"
import { OutputPreviewDialog } from "./output-preview-dialog"
import { RosterPanel } from "./roster-panel"
import { SkillContentsDialog } from "./skill-contents-dialog"
import { StackGrid } from "./stack-grid"
import { StackSwitchDialog } from "./stack-switch-dialog"

const route = getRouteApi("/")

export function ConfigureScreen() {
  const search = route.useSearch()
  const navigate = useNavigate({ from: "/" })
  const skills = useConfigStore((state) => state.skills)
  const stackId = useConfigStore((state) => state.stackId)
  const agents = useConfigStore((state) => state.agents)
  // Subscribed rather than read once: swapping the marketplace replaces the
  // whole catalogue, and every derivation below has to be recomputed against
  // the new one. `derive.ts` reads the seat itself, so what this subscription
  // buys is the re-render that makes it read again.
  const catalog = useCatalogStore((state) => state.catalog)
  const stacks = useCatalogStore((state) => state.stacks)
  const stackCollapsed = useUiStore((state) => state.stackCollapsed)
  const toggleStackCollapsed = useUiStore((state) => state.toggleStackCollapsed)

  // The opening, in the one order it can be done in: the catalogue a set of ids
  // was minted against is seated before anything resolves them — for the saved
  // configuration and for a shared address alike. Which of the two is open is
  // the id in the URL, which is read on every load rather than consumed once.
  useCatalogFirst(search.fromId)

  // What that seating had to say, read from the store rather than returned by
  // the hook — because the opening is not the only thing that seats a
  // catalogue. Applying a saved stack does too, and it is not an address
  // change, so a value the hook held per address could never have carried it
  // (EDITOR-59).
  const notice = useUiStore((state) => state.catalogueNotice)
  const recovery = useUiStore((state) => state.marketplaceRecovery)

  const config = useMemo(
    () => ({ stackId, skills, agents }),
    [stackId, skills, agents]
  )
  const domainViews = useMemo(
    () => selectDomainViews(config, search),
    // `catalog` is load-bearing and is deliberately not read here.
    // `selectDomainViews` reads the seat itself — as every derivation in
    // `derive.ts` does — so this dependency is what re-derives the grid when
    // the catalogue underneath it is swapped, which now includes a skill being
    // added to it. Removing it as "unused" would leave a marketplace's skills
    // unrendered until something else changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, search, catalog]
  )

  // Every domain in the catalogue, filtered or not — the strip is the page's
  // map, so it is derived from the catalogue rather than from the view.
  //
  // NOT memoised, and that is the honest shape rather than an omission: the
  // derivation takes no arguments because it reads the seated catalogue
  // itself, so there is nothing for a dependency array to watch. It maps nine
  // domains; what a `useMemo` would buy here is a stale strip after a
  // marketplace swap, which is the one thing the subscription above exists to
  // prevent.
  const domainTabs = selectDomainTabs()
  // What the column is actually drawing, which is what the strip follows. It
  // changes whenever a filter does, and the strip has to re-derive with it
  // rather than on the next scroll event.
  const renderedDomains = useMemo(
    () => domainViews.map((view) => view.id),
    [domainViews]
  )

  const summary = summarize(config)
  const stack = stacks.find((candidate) => candidate.id === stackId)

  // Composed rather than assigned, and the halves are deliberately different
  // kinds of thing. `notice` describes what the last catalogue-first act cost
  // — a fact about a moment, which is why it is state — while this describes
  // the configuration as it stands right now. Set once at arrival it would go
  // on saying "Install is blocked" after the user had unblocked it, which is
  // the same stale-vouching problem EDITOR-43 was about, wearing the other
  // coat.
  const blockedLine = blockedNotice(summary.unscopedAgentCount)
  const line = [notice, blockedLine].filter((part) => part !== null).join(" ")

  return (
    <>
      <main className="min-w-0 bg-column px-gutter pt-0">
        {line && (
          <p
            role="alert"
            className="pt-4 font-mono text-11 text-muted-foreground italic"
          >
            {line}
          </p>
        )}

        {/* Folding the grid away is an arrangement decision and nothing else:
            `stackId` is untouched, so the stack stays chosen, the second hinge
            still names it and Install writes what it would have written.

            No `aria-controls` — the grid is UNMOUNTED rather than hidden, so
            there is no id to point at. `aria-expanded` on a button immediately
            preceding what it discloses is the pattern the roster bands already
            use. */}
        <Hinge
          label="choose your stack"
          action={
            <HingeButton
              aria-expanded={!stackCollapsed}
              aria-label={stackCollapsed ? "Show stacks" : "Hide stacks"}
              onClick={toggleStackCollapsed}
            >
              <Glyph name={stackCollapsed ? "plus" : "minus"} />
            </HingeButton>
          }
        />
        {!stackCollapsed && <StackGrid />}

        {/* The page's only instructional copy, and it changes with the stack —
            and the rule it is set on carries the column's one filter.

            `min-h-6` IS NOT SPACING. The hinge's natural line box is 13px and
            the toggle is 24px absolutely centred on it, so it overhangs by 6px
            top and bottom — and `FilterBar` below is a `-mx-gutter` sticky at
            `z-60` whose background paints over that overhang and eats the
            button's bottom border. Giving the hinge the control's own height
            removes the overhang; raising the toggle's `z-index` instead would
            float it over the dark band the moment the bar sticks. */}
        <Hinge
          className="min-h-6"
          label={stack ? "then customise" : "then"}
          emphasis={stack ? stack.name.toLowerCase() : "pick your skills"}
          action={
            // ONLY ONCE SOMETHING IS SELECTED. A toggle whose only possible
            // effect is an empty column is not a control.
            summary.skillCount > 0 ? (
              <HingeToggle
                active={search.sel}
                // The words are the VALUE and change with it, so they cannot
                // also be the name: a spec and a screen reader meet one stable
                // control rather than a differently named one after every
                // click in the grid.
                aria-label="Show only selected skills"
                title={
                  search.sel ? "show every skill" : "show only selected skills"
                }
                onClick={() =>
                  void navigate({
                    search: (prev) => ({ ...prev, sel: !search.sel }),
                    resetScroll: false,
                  })
                }
              >
                {selectedOnlyLabel(
                  search.sel,
                  summary.skillCount,
                  catalogueSkillCount()
                )}
              </HingeToggle>
            ) : null
          }
        />

        <FilterBar
          search={search}
          tabs={domainTabs}
          renderedDomains={renderedDomains}
        />

        {domainViews.length === 0 ? (
          <p className="pt-[1.875rem] font-mono text-11 text-muted-foreground">
            No skills match this filter.
          </p>
        ) : (
          domainViews.map((view, index) => (
            <DomainSection key={view.id} view={view} first={index === 0} />
          ))
        )}

        {/* ONE FLOATING CONTROL, AND THE STICKY THAT CARRIES IT.

            The marketplace button was the other one until 2026-09-04, when the
            owner moved it into the nav rail as a section of its own; the
            wrapper stays because the sticky belongs to it rather than to the
            composer, and because `pointer-events-none` here with
            `pointer-events-auto` on the dock is what keeps the full-bleed strip
            beside the dock falling through to the skill cells underneath.

            Sticky rather than fixed (EDITOR-35): fixed puts a control in the
            viewport's bottom-left corner, which the nav rail owns, and a
            constant `left` cannot fix that because the page grid centres itself
            past 105.25rem. Asking the column where it is costs no layout
            constant at all, which is why the dock's height is never measured —
            it grows a conditional child (the openers at rest, a proposal after
            a submit) and any `bottom: <composer height>` would have to be
            re-measured every time it did.

            AND THE COLUMN RESERVES NOTHING BELOW IT (EDITOR-75). The dock is
            the last thing in flow, so a `pb-*` on `<main>` lands entirely
            UNDER it — a sticky box cannot leave its containing block, so at
            maximum scroll the dock comes to rest that far above the viewport
            floor with a strip of bare column beneath it, and a page with no
            results scrolls by exactly that much for nothing. The gap the last
            skill cell needs is the dock's own `mt-*`, which is the composer's
            to own. */}
        <div className="pointer-events-none sticky bottom-0 z-60">
          <Composer />
        </div>
      </main>

      <RosterPanel config={config} />

      <StackSwitchDialog />
      <InstallDialog config={config} />
      <AddSkillDialog />
      {/* A sibling of the dialogs rather than a child of any of them: it is
          reached from the grid AND from Install, so it belongs to neither and
          opens over whichever asked. */}
      <SkillContentsDialog />
      {/* What the roster's own footer opens, so it takes the same selection
          the Install dialog reads — the two describe one configuration. */}
      <OutputPreviewDialog config={config} />
      {/* The recovery, handed to the dialog that can resolve it: a payload
          whose catalogue could not be read opens this pre-filled, and loading
          one finishes the import that was waiting. */}
      <MarketplaceDialog recovery={recovery} />
      {/* And to the switcher's confirmation, for the same reason: seating a
          catalogue is what finishes a parked recovery, whichever control
          seated it. */}
      <MarketplaceSwitchDialog recovery={recovery} />
    </>
  )
}
