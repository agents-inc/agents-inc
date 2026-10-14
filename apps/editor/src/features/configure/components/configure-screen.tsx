import { getRouteApi } from "@tanstack/react-router"
import { Hinge } from "@workspace/ui/components/divider"
import { useMemo } from "react"

import {
  selectDomainTabs,
  selectDomainViews,
} from "@/features/configure/lib/derive"
import { useCatalogFirst } from "@/features/configure/lib/use-catalog-first"
import { PANEL_ROOM } from "@/features/configure/lib/use-panel-room"
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
import { ProviderGrid } from "./provider-grid"
import { RosterPanel } from "./roster-panel"
import { SaveStackDialog } from "./save-stack-dialog"
import { SkillContentsDialog } from "./skill-contents-dialog"
import { StackGrid } from "./stack-grid"
import { StackSwitchDialog } from "./stack-switch-dialog"
import { SubAgentGrid } from "./sub-agent-grid"

const route = getRouteApi("/")

export function ConfigureScreen() {
  const search = route.useSearch()
  const skills = useConfigStore((state) => state.skills)
  const stackId = useConfigStore((state) => state.stackId)
  const agents = useConfigStore((state) => state.agents)
  // Subscribed only for the re-render on a marketplace swap: `derive.ts` reads
  // the seated catalogue itself.
  const catalog = useCatalogStore((state) => state.catalog)
  const stacks = useCatalogStore((state) => state.stacks)
  const providerCollapsed = useUiStore((state) => state.providerCollapsed)
  const stackCollapsed = useUiStore((state) => state.stackCollapsed)
  const agentsCollapsed = useUiStore((state) => state.agentsCollapsed)
  const skillsCollapsed = useUiStore((state) => state.skillsCollapsed)
  const toggleProviderCollapsed = useUiStore(
    (state) => state.toggleProviderCollapsed
  )
  const toggleStackCollapsed = useUiStore((state) => state.toggleStackCollapsed)
  const toggleAgentsCollapsed = useUiStore(
    (state) => state.toggleAgentsCollapsed
  )
  const toggleSkillsCollapsed = useUiStore(
    (state) => state.toggleSkillsCollapsed
  )

  // Seats the catalogue a set of ids was minted against before anything
  // resolves them.
  useCatalogFirst(search.fromId)

  // Read from the store rather than the hook, because applying a saved stack
  // seats a catalogue too.
  const notice = useUiStore((state) => state.catalogueNotice)
  const recovery = useUiStore((state) => state.marketplaceRecovery)

  const config = useMemo(
    () => ({ stackId, skills, agents }),
    [stackId, skills, agents]
  )
  const domainViews = useMemo(
    () => selectDomainViews(config, search),
    // `catalog` is unread but load-bearing: `selectDomainViews` reads the seat
    // itself, so this dependency re-derives the grid when the catalogue swaps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, search, catalog]
  )

  // Every domain in the catalogue, filtered or not. Not memoised: it reads the
  // seated catalogue itself, so a memo would go stale on a marketplace swap.
  const domainTabs = selectDomainTabs()
  // What the column is actually drawing, which is what the strip follows.
  const renderedDomains = useMemo(
    () => domainViews.map((view) => view.id),
    [domainViews]
  )

  const stack = stacks.find((candidate) => candidate.id === stackId)

  return (
    <>
      <main className="min-w-0 bg-column px-gutter pt-0">
        {/* What the last catalogue-first act cost, and nothing else. */}
        {notice && (
          <p
            role="alert"
            className="pt-4 font-mono text-11 text-muted-foreground italic"
          >
            {notice}
          </p>
        )}

        {/* A fold unmounts its step and changes nothing chosen. No
            `aria-controls`: an unmounted step has no id to point at. */}
        <Hinge
          index="01"
          label="choose your"
          emphasis="provider"
          expanded={!providerCollapsed}
          onToggle={toggleProviderCollapsed}
        />
        {!providerCollapsed && <ProviderGrid />}

        <Hinge
          index="02"
          label="then your"
          emphasis="stack"
          expanded={!stackCollapsed}
          onToggle={toggleStackCollapsed}
        />
        {!stackCollapsed && <StackGrid />}

        <Hinge
          index="03"
          label="then your"
          emphasis="sub-agents"
          expanded={!agentsCollapsed}
          onToggle={toggleAgentsCollapsed}
        />
        {!agentsCollapsed && <SubAgentGrid config={config} />}

        <Hinge
          index="04"
          label={stack ? "then customise" : "then"}
          emphasis={stack ? stack.name.toLowerCase() : "pick your skills"}
          expanded={!skillsCollapsed}
          onToggle={toggleSkillsCollapsed}
        />
        {!skillsCollapsed && (
          <>
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
          </>
        )}

        {/* Room for an options panel hanging past the end of the catalogue,
            sized by `use-panel-room.ts`. Ahead of the dock, because anything
            below it lands under the dock. */}
        <div {...{ [PANEL_ROOM]: "" }} />

        {/* `pointer-events-none` here and `pointer-events-auto` on the dock let
            the strip beside the dock fall through to the cells beneath.
            Sticky rather than fixed, so it follows the centred column with no
            measured height.

            Nothing may reserve space below it: a sticky box cannot leave its
            containing block, so a `pb-*` on `<main>` lands under the dock. The
            gap above it is the composer's own `mt-*`. */}
        <div className="pointer-events-none sticky bottom-0 z-60">
          <Composer />
        </div>
      </main>

      <RosterPanel config={config} />

      <StackSwitchDialog />
      <InstallDialog config={config} />
      <SaveStackDialog config={config} />
      <AddSkillDialog />
      {/* Reached from the grid and from Install, so it opens over either. */}
      <SkillContentsDialog />
      <OutputPreviewDialog config={config} />
      {/* Seating a catalogue through either finishes a parked recovery. */}
      <MarketplaceDialog recovery={recovery} />
      <MarketplaceSwitchDialog recovery={recovery} />
    </>
  )
}
