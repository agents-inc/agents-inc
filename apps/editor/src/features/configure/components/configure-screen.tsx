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
  // Subscribed only to re-render on a marketplace swap.
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

  useCatalogFirst(search.fromId)

  // From the store, since applying a saved stack seats a catalogue too.
  const notice = useUiStore((state) => state.catalogueNotice)
  const recovery = useUiStore((state) => state.marketplaceRecovery)

  const config = useMemo(
    () => ({ stackId, skills, agents }),
    [stackId, skills, agents]
  )
  const domainViews = useMemo(
    () => selectDomainViews(config, search),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derive when the seated catalogue swaps
    [config, search, catalog]
  )

  // Not memoised: a memo would go stale on a marketplace swap.
  const domainTabs = selectDomainTabs()
  const renderedDomains = useMemo(
    () => domainViews.map((view) => view.id),
    [domainViews]
  )

  const stack = stacks.find((candidate) => candidate.id === stackId)

  return (
    <>
      <main className="min-w-0 bg-column px-gutter pt-0">
        {notice && (
          <p
            role="alert"
            className="pt-4 font-mono text-11 text-muted-foreground italic"
          >
            {notice}
          </p>
        )}

        {/* No `aria-controls`: an unmounted step has no id to point at. */}
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

        {/* Room for an options panel past the catalogue's end. */}
        <div {...{ [PANEL_ROOM]: "" }} />

        {/* Clicks beside the dock fall through to the cells. Nothing may pad
            below it: a sticky box cannot leave its block. */}
        <div className="pointer-events-none sticky bottom-0 z-60">
          <Composer />
        </div>
      </main>

      <RosterPanel config={config} />

      <StackSwitchDialog />
      <InstallDialog config={config} />
      <SaveStackDialog config={config} />
      <AddSkillDialog />
      <SkillContentsDialog />
      <OutputPreviewDialog config={config} />
      <MarketplaceDialog recovery={recovery} />
      <MarketplaceSwitchDialog recovery={recovery} />
    </>
  )
}
