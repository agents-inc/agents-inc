import { getRouteApi } from "@tanstack/react-router"
import { Hinge } from "@workspace/ui/components/divider"
import { useMemo } from "react"

import {
  blockedNotice,
  selectDomainViews,
  summarize,
} from "@/features/configure/lib/derive"
import { useCatalogFirst } from "@/features/configure/lib/use-catalog-first"
import { useCatalogStore } from "@/stores/catalog-store"
import { useConfigStore } from "@/stores/config-store"
import { AddSkillDialog } from "./add-skill-dialog"
import { DomainSection } from "./domain-section"
import { FilterBar } from "./filter-bar"
import { InstallDialog } from "./install-dialog"
import { MarketplaceButton, MarketplaceDialog } from "./marketplace-dialog"
import { MarketplaceSwitchDialog } from "./marketplace-switch-dialog"
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

  // The opening, in the one order it can be done in: the catalogue a set of ids
  // was minted against is seated before anything resolves them — for the saved
  // configuration and for a shared address alike. Which of the two is open is
  // the id in the URL, which is read on every load rather than consumed once.
  const { notice, recovery } = useCatalogFirst(search.fromId)

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
  // kinds of thing. `notice` describes the OPENING — a fact about a moment,
  // which is why it is state — while this describes the configuration as it
  // stands right now. Set once at arrival it would go on saying "Install is
  // blocked" after the user had unblocked it, which is the same stale-vouching
  // problem EDITOR-43 was about, wearing the other coat.
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

        <Hinge label="choose your stack" />
        <StackGrid />

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

        {/* Last in the column and sticky to its foot, so it floats over the
            grid without reaching into the nav rail's corner (EDITOR-35). The
            column is what it is a statement about, and being inside it is what
            lets the grid position it at every window width — the page centres
            itself past 105.25rem, which no viewport-fixed offset can follow. */}
        <MarketplaceButton />
      </main>

      <RosterPanel config={config} />

      <StackSwitchDialog />
      <InstallDialog config={config} />
      <AddSkillDialog />
      {/* A sibling of the dialogs rather than a child of any of them: it is
          reached from the grid AND from Install, so it belongs to neither and
          opens over whichever asked. */}
      <SkillContentsDialog />
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
