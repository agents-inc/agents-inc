import { getRouteApi } from "@tanstack/react-router"
import { Hinge, HingeButton } from "@workspace/ui/components/divider"
import { useMemo } from "react"

import {
  blockedNotice,
  selectDomainViews,
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
import { MarketplaceButton, MarketplaceDialog } from "./marketplace-dialog"
import { MarketplaceSwitchDialog } from "./marketplace-switch-dialog"
import { OutputPreviewDialog } from "./output-preview-dialog"
import { RosterPanel } from "./roster-panel"
import { SkillContentsDialog } from "./skill-contents-dialog"
import { StackGrid } from "./stack-grid"
import { StackSwitchDialog } from "./stack-switch-dialog"

const route = getRouteApi("/")

export function ConfigureScreen() {
  const search = route.useSearch()
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

  const stack = stacks.find((candidate) => candidate.id === stackId)

  // Composed rather than assigned, and the halves are deliberately different
  // kinds of thing. `notice` describes what the last catalogue-first act cost
  // — a fact about a moment, which is why it is state — while this describes
  // the configuration as it stands right now. Set once at arrival it would go
  // on saying "Install is blocked" after the user had unblocked it, which is
  // the same stale-vouching problem EDITOR-43 was about, wearing the other
  // coat.
  const blockedLine = blockedNotice(summarize(config).unscopedAgentCount)
  const line = [notice, blockedLine].filter((part) => part !== null).join(" ")

  return (
    <>
      <main className="min-w-0 bg-column px-gutter pt-0 pb-30">
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
              {stackCollapsed ? "+" : "−"}
            </HingeButton>
          }
        />
        {!stackCollapsed && <StackGrid />}

        {/* The page's only instructional copy, and it changes with the stack. */}
        {stack ? (
          <Hinge label="then customise" emphasis={stack.name.toLowerCase()} />
        ) : (
          <Hinge label="then" emphasis="pick your skills" />
        )}

        <FilterBar search={search} />

        {domainViews.length === 0 ? (
          <p className="pt-[1.875rem] font-mono text-11 text-muted-foreground">
            No skills match this filter.
          </p>
        ) : (
          domainViews.map((view, index) => (
            <DomainSection key={view.id} view={view} first={index === 0} />
          ))
        )}

        {/* TWO FLOATING CONTROLS, ONE STICKY ELEMENT.

            The composer docks to this column's foot and the marketplace button
            already owned that slot, so they share a single sticky wrapper with
            the button as the previous sibling. That introduces no layout
            constant: the button rides above the dock because it comes before
            it, so the dock's height is intrinsic and never measured — which
            matters because the dock grows a conditional child (the openers at
            rest, a proposal after a submit) and any `bottom: <composer height>`
            would have to be re-measured every time it did.

            Sticky rather than fixed, exactly as before (EDITOR-35): fixed put
            the button in the viewport's bottom-left corner, which the nav rail
            already owns, and a constant `left` cannot fix that because the page
            grid centres itself past 105.25rem. The mechanism has simply moved
            one level up, from the button to this wrapper.

            `pointer-events-none` with each child turning it back on, so the
            strip beside the `w-fit` button still falls through to the skill
            cells underneath rather than being a wide box over the grid. */}
        <div className="pointer-events-none sticky bottom-0 z-60">
          <MarketplaceButton />
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
